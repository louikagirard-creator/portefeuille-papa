// Récupère les prix (intrajournaliers et quotidiens) chez Twelve Data et écrit data/prix.json.
// Roule dans la GitHub Action « donnees.yml ». La clé API vient du secret TWELVE_DATA_API_KEY :
// elle n'est jamais écrite dans le code ni dans le fichier produit.
//
// Limites du plan gratuit : 8 crédits par minute et 800 par jour (1 crédit par symbole par appel).
// Pour rester dessous :
//   - les symboles sont demandés par lots de 8, avec une pause d'une minute entre les lots;
//   - l'historique quotidien (2 ans) est réutilisé depuis la version déjà en ligne s'il date d'aujourd'hui,
//     sauf au passage de fin de journée (FORCER_QUOTIDIEN=1).

import { writeFile, mkdir, readFile } from 'node:fs/promises';

const CLE = process.env.TWELVE_DATA_API_KEY || '';
const SITE = process.env.SITE_URL || 'https://louikagirard-creator.github.io/portefeuille-papa/';
const FORCER_QUOTIDIEN = process.env.FORCER_QUOTIDIEN === '1';
const SORTIE = 'data/prix.json';
const API = 'https://api.twelvedata.com/time_series';

// Même liste que js/config.js (titres + indices + taux de change).
const SYMBOLES = [
  'SPCX', 'GOOGL', 'SU', 'CVE', 'SNDK', 'WDC', 'EWT',
  'XAU/USD', 'XAG/USD', 'XPT/USD', 'XPD/USD',
  'SPY', 'QQQ', 'DIA', 'EWC',
  'USD/CAD'
];

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const lots = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const dateNY = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);

// Un appel « batch » : renvoie { symbole: réponse } même s'il n'y a qu'un symbole.
async function appel(symboles, params) {
  const url = new URL(API);
  url.searchParams.set('symbol', symboles.join(','));
  url.searchParams.set('apikey', CLE);
  url.searchParams.set('timezone', 'UTC');
  url.searchParams.set('order', 'ASC');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const rep = await fetch(url);
  const json = await rep.json().catch(() => ({ status: 'error', code: rep.status, message: 'Réponse illisible' }));
  if (json.status === 'error' && !json.meta) {
    // Erreur globale (clé invalide, limite atteinte…) : on l'applique à tous les symboles du lot.
    return Object.fromEntries(symboles.map((s) => [s, json]));
  }
  return symboles.length === 1 ? { [symboles[0]]: json } : json;
}

function messageErreur(r) {
  if (!r) return 'Aucune réponse';
  if (r.code === 429) return 'Limite d’appels atteinte';
  if (r.code === 401) return 'Clé API invalide';
  if (r.code === 403) return 'Symbole non offert dans le plan gratuit';
  if (r.code === 404 || r.code === 400) return 'Symbole introuvable';
  return r.message || 'Erreur inconnue';
}

async function recuperer(params, conversion) {
  const resultats = {};
  const groupes = lots(SYMBOLES, 8);
  for (let i = 0; i < groupes.length; i++) {
    if (i > 0) await pause(62_000); // respecte 8 crédits / minute
    const rep = await appel(groupes[i], params);
    for (const s of groupes[i]) {
      const r = rep[s];
      if (r && r.status !== 'error' && Array.isArray(r.values)) {
        resultats[s] = { valeurs: r.values.map(conversion).filter((x) => Number.isFinite(x[1])), devise: r.meta?.currency || r.meta?.currency_quote || 'USD' };
      } else {
        resultats[s] = { erreur: messageErreur(r) };
      }
    }
  }
  return resultats;
}

async function precedent() {
  // Dernière version publiée, pour réutiliser l'historique quotidien et garder les données si l'API tombe.
  try {
    const rep = await fetch(SITE + 'data/prix.json?_=' + Date.now());
    if (rep.ok) return await rep.json();
  } catch { /* première publication */ }
  try { return JSON.parse(await readFile(SORTIE, 'utf8')); } catch { return null; }
}

async function main() {
  await mkdir('data', { recursive: true });
  const ancien = await precedent();

  if (!CLE) {
    // Pas de clé : le site affiche un message clair et garde ses widgets en direct.
    const sortie = ancien && ancien.etat === 'ok' ? ancien : { etat: 'cle-manquante', genere: new Date().toISOString(), symboles: {} };
    await writeFile(SORTIE, JSON.stringify(sortie));
    console.log('TWELVE_DATA_API_KEY absente : fichier', sortie.etat);
    return;
  }

  // 1) Intrajournalier 5 min sur ~7 jours (sert à 1J et 1S).
  //    Les métaux et devises se négocient presque 24 h sur 24 : on garde un point aux 15 min pour alléger le fichier.
  const intra = await recuperer({ interval: '5min', outputsize: '2100' }, (v) => [Date.parse(v.datetime.replace(' ', 'T') + 'Z'), +v.close]);
  for (const [s, r] of Object.entries(intra)) {
    if (s.includes('/') && r.valeurs) r.valeurs = r.valeurs.filter(([t]) => new Date(t).getUTCMinutes() % 15 === 0);
  }
  const septJours = Date.now() - 8 * 86400_000;
  for (const r of Object.values(intra)) if (r.valeurs) r.valeurs = r.valeurs.filter(([t]) => t >= septJours);

  // 2) Quotidien sur ~2 ans (sert à 1M, 1A et au calendrier).
  let quotidien;
  const memeJour = ancien?.quotidienDate === dateNY();
  if (!FORCER_QUOTIDIEN && memeJour && ancien?.symboles) {
    quotidien = Object.fromEntries(SYMBOLES.map((s) => [s, ancien.symboles[s]?.quotidien ? { valeurs: ancien.symboles[s].quotidien } : { erreur: ancien.symboles[s]?.erreur || 'Absent' }]));
    console.log('Historique quotidien réutilisé');
  } else {
    await pause(62_000);
    quotidien = await recuperer({ interval: '1day', outputsize: '560' }, (v) => [v.datetime.slice(0, 10), +v.close]);
  }

  const symboles = {};
  let nbOk = 0;
  for (const s of SYMBOLES) {
    const a = intra[s] || {};
    const q = quotidien[s] || {};
    const garde = ancien?.symboles?.[s];
    const entree = {
      devise: a.devise || q.devise || garde?.devise || 'USD',
      intraday: a.valeurs || garde?.intraday || [],
      quotidien: q.valeurs || garde?.quotidien || []
    };
    const erreur = a.erreur && q.erreur ? (a.erreur || q.erreur) : null;
    if (erreur && !entree.intraday.length && !entree.quotidien.length) entree.erreur = erreur;
    else if (a.erreur || q.erreur) entree.avertissement = 'Données partielles : ' + (a.erreur || q.erreur);
    if (!entree.erreur) nbOk++;
    symboles[s] = entree;
  }

  const limite = Object.values(intra).some((r) => r.erreur === 'Limite d’appels atteinte');
  const sortie = {
    etat: nbOk ? 'ok' : (limite ? 'limite' : 'erreur'),
    message: nbOk ? null : (Object.values(intra)[0]?.erreur || 'Aucune donnée'),
    genere: new Date().toISOString(),
    quotidienDate: memeJour && !FORCER_QUOTIDIEN ? ancien.quotidienDate : dateNY(),
    source: 'Twelve Data',
    symboles
  };
  await writeFile(SORTIE, JSON.stringify(sortie));
  console.log(`prix.json écrit : ${nbOk}/${SYMBOLES.length} symboles OK`);
  for (const [s, e] of Object.entries(symboles)) if (e.erreur || e.avertissement) console.log(' -', s, e.erreur || e.avertissement);
}

main().catch(async (e) => {
  console.error(e);
  // Ne jamais publier un fichier vide : on garde l'ancien s'il existe.
  const ancien = await precedent();
  await writeFile(SORTIE, JSON.stringify(ancien || { etat: 'erreur', message: 'Récupération impossible', genere: new Date().toISOString(), symboles: {} }));
});
