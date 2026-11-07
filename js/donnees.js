// Chargement des prix (data/prix.json, produit par la GitHub Action) et calculs :
// séries par période, valeur du portefeuille dans le temps, valeurs quotidiennes pour le calendrier.
// Les données sont chargées une seule fois par visite (cache en mémoire) et une copie de secours
// est gardée sur l'appareil pour les moments où la source est indisponible.
import { TAUX_USDCAD } from './config.js';

const CLE_SECOURS = 'mg-prix-secours';
const JOUR = 86400000;
let promesse = null;

// ---------- Chargement ----------

function lireSecours() {
  try { const s = localStorage.getItem(CLE_SECOURS); return s ? JSON.parse(s) : null; } catch { return null; }
}

function messageEtat(d) {
  if (!d) return 'Données indisponibles.';
  if (d.etat === 'cle-manquante') return 'Les graphiques historiques ne sont pas encore branchés (clé API à configurer). Les prix en direct restent affichés.';
  if (d.etat === 'limite') return 'La source de données a atteint sa limite d’appels. Nouvel essai automatique dans 15 minutes.';
  return d.message || 'La source de données ne répond pas pour le moment.';
}

/** Charge les prix une seule fois (promesse partagée par tous les composants). */
export function chargerPrix() {
  if (promesse) return promesse;
  promesse = (async () => {
    try {
      // Le paramètre change aux 5 minutes : évite qu'un vieux fichier reste en cache du navigateur.
      const rep = await fetch('data/prix.json?v=' + Math.floor(Date.now() / 300000));
      if (!rep.ok) throw new Error('HTTP ' + rep.status);
      const d = await rep.json();
      if (d.etat === 'ok') {
        try { localStorage.setItem(CLE_SECOURS, JSON.stringify(d)); } catch { /* espace plein : sans gravité */ }
        return preparer(d, null);
      }
      const s = lireSecours();
      if (s) return preparer(s, messageEtat(d) + ' Données gardées sur l’appareil affichées.');
      return { etat: d.etat || 'erreur', message: messageEtat(d), symboles: {} };
    } catch {
      const s = lireSecours();
      if (s) return preparer(s, 'Connexion impossible : dernières données gardées sur l’appareil.');
      return { etat: 'erreur', message: 'Impossible de charger les prix. Vérifie la connexion Internet, puis recharge la page.', symboles: {} };
    }
  })();
  return promesse;
}

// ---------- Outils de date et de recherche ----------

const fmtNY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
const fmtTO = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' });
/** Date de bourse (heure de New York) d'un instant, « AAAA-MM-JJ ». */
export const dateBourse = (ms) => fmtNY.format(ms);
/** Date du jour à Toronto, « AAAA-MM-JJ ». */
export const aujourdhui = () => fmtTO.format(Date.now());
/** Midi UTC d'une date « AAAA-MM-JJ » (sert d'abscisse aux points quotidiens). */
export const msDate = (iso) => { const [a, m, j] = iso.split('-').map(Number); return Date.UTC(a, m - 1, j, 12); };
export const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Dernière valeur dont la clé est ≤ cle (tableau trié [[cle, valeur], …]). */
function valeurAvant(tab, cle) {
  let lo = 0, hi = tab.length - 1, res;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tab[mid][0] <= cle) { res = tab[mid][1]; lo = mid + 1; } else hi = mid - 1;
  }
  return res;
}

const estContinu = (s) => s.includes('/'); // métaux et devises : marché presque 24 h sur 24

// ---------- Préparation ----------

function preparer(d, avis) {
  const symboles = {};
  for (const [s, e] of Object.entries(d.symboles || {})) {
    if (e.erreur) { symboles[s] = { erreur: e.erreur }; continue; }
    const intraday = e.intraday || [];
    const quotidien = e.quotidien || [];
    const derIntra = intraday[intraday.length - 1];
    const derQuot = quotidien[quotidien.length - 1];
    const session = derIntra ? dateBourse(derIntra[0]) : derQuot?.[0];
    // Prix de la veille : dernière fermeture avant la séance en cours.
    let precedent = null;
    for (let i = quotidien.length - 1; i >= 0; i--) if (quotidien[i][0] < session) { precedent = quotidien[i][1]; break; }
    const dernier = derIntra && (!derQuot || dateBourse(derIntra[0]) >= derQuot[0]) ? derIntra[1] : derQuot?.[1];
    symboles[s] = { intraday, quotidien, session, precedent, dernier, tDernier: derIntra?.[0] ?? (derQuot ? msDate(derQuot[0]) : null), devise: e.devise || 'USD', avertissement: e.avertissement, estime: e.estime };
  }
  return { etat: 'ok', avis, genere: new Date(d.genere), symboles };
}

// ---------- Séries d'un symbole ----------

/**
 * Série d'un symbole pour une période.
 * Renvoie { points: [{t, v}], base, intraday } ou { erreur }.
 * - 1J : séance du jour en 5 min, base = fermeture de la veille.
 * - 1S : 7 derniers jours en 30 min, base = premier point.
 * - 1M / 1A : fermetures quotidiennes sur 30 / 365 jours (+ dernier prix du jour), base = premier point.
 */
export function serieSymbole(donnees, sym, periode) {
  const s = donnees.symboles[sym];
  if (!s) return { erreur: 'Symbole introuvable dans les données' };
  if (s.erreur) return { erreur: s.erreur };

  if (periode === '1J') {
    let pts;
    if (estContinu(sym)) {
      const fin = s.intraday[s.intraday.length - 1]?.[0] ?? 0;
      pts = s.intraday.filter(([t]) => t > fin - JOUR);
      const base = valeurAvant(s.intraday, fin - JOUR) ?? pts[0]?.[1];
      return { points: pts.map(([t, v]) => ({ t, v })), base, intraday: true };
    }
    pts = s.intraday.filter(([t]) => dateBourse(t) === s.session);
    return { points: pts.map(([t, v]) => ({ t, v })), base: s.precedent ?? pts[0]?.[1], intraday: true };
  }
  if (periode === '1S') {
    const fin = s.intraday[s.intraday.length - 1]?.[0] ?? 0;
    const pts = s.intraday.filter(([t]) => t >= fin - 7 * JOUR && new Date(t).getUTCMinutes() % 30 === 0);
    return { points: pts.map(([t, v]) => ({ t, v })), base: pts[0]?.[1], intraday: true };
  }
  const derDate = s.quotidien[s.quotidien.length - 1]?.[0];
  if (!derDate) return { erreur: 'Pas d’historique' };
  const complet = s.quotidien.map(([d, v]) => ({ t: msDate(d), v }));
  const pts = tranche(complet, s.quotidien.map(([d]) => d), derDate, periode);
  // Ajoute le dernier prix connu si la séance du jour n'est pas encore dans l'historique.
  if (s.session && s.session > derDate && s.dernier != null) pts.push({ t: msDate(s.session), v: s.dernier, live: true });
  return { points: pts, base: pts[0]?.v, intraday: false, complet };
}

// ---------- Périodes quotidiennes ----------

const JOURS_PERIODE = { '1M': 30, '3M': 91, '6M': 182, '1A': 365, '2A': 730 };

/**
 * Points d'une période quotidienne. « AAJ » (année à date) part de la dernière fermeture de l'année précédente,
 * comme le calculent les courtiers; les autres partent de la première fermeture dans la fenêtre.
 */
function tranche(points, dates, derDate, periode) {
  if (periode === 'AAJ') {
    const debut = derDate.slice(0, 4) + '-01-01';
    let i = dates.findIndex((d) => d >= debut);
    if (i < 0) return [];
    if (i > 0) i -= 1;
    return points.slice(i);
  }
  const debut = isoDate(msDate(derDate) - (JOURS_PERIODE[periode] || 30) * JOUR);
  const i = dates.findIndex((d) => d >= debut);
  return i < 0 ? [] : points.slice(i);
}

/** Moyenne mobile simple sur n points (null tant qu'il n'y a pas assez d'historique). */
export function moyenneMobile(complet, n) {
  const res = new Map();
  let somme = 0;
  for (let i = 0; i < complet.length; i++) {
    somme += complet[i].v;
    if (i >= n) somme -= complet[i - n].v;
    if (i >= n - 1) res.set(complet[i].t, somme / n);
  }
  return res;
}

// ---------- Portefeuille ----------

/** Taux USD → devise d'affichage à un instant (ms) ou une date (« AAAA-MM-JJ »). */
function tauxA(donnees, devise, cle) {
  if (devise === 'USD') return 1;
  const fx = donnees.symboles[TAUX_USDCAD];
  if (!fx || fx.erreur) return null;
  if (typeof cle === 'number') return valeurAvant(fx.intraday, cle) ?? valeurAvant(fx.quotidien, dateBourse(cle)) ?? fx.dernier;
  return valeurAvant(fx.quotidien, cle) ?? fx.quotidien[0]?.[1] ?? fx.dernier;
}

/** Positions dont les données sont disponibles, et celles en erreur. */
export function positionsValides(donnees, positions) {
  const ok = [], erreurs = [];
  for (const p of positions) {
    if (!(p.quantite > 0)) continue;
    const s = donnees.symboles[p.symbole];
    if (s && !s.erreur) ok.push(p); else erreurs.push({ ...p, erreur: s?.erreur || 'Symbole introuvable' });
  }
  return { ok, erreurs };
}

/** Prix d'un symbole à un instant (intrajournalier), sinon fermeture de la veille. */
function prixInstant(s, t) {
  return valeurAvant(s.intraday, t) ?? s.precedent ?? s.quotidien[0]?.[1];
}

/** Série de la valeur totale du portefeuille (dans la devise d'affichage) pour une période. */
export function seriePortefeuille(donnees, positions, periode, devise) {
  const { ok } = positionsValides(donnees, positions);
  if (!ok.length) return { erreur: 'Aucune position avec des données. Ajoute tes positions dans Paramètres.' };
  const bourse = ok.filter((p) => !estContinu(p.symbole));
  const ref = bourse.length ? bourse : ok;

  if (periode === '1J' || periode === '1S') {
    // Axe du temps : tous les instants de cotation des titres de bourse (ou des métaux s'il n'y a que ça).
    const sessions = ref.map((p) => donnees.symboles[p.symbole].session).sort();
    const session = sessions[sessions.length - 1];
    const fin = Math.max(...ref.map((p) => donnees.symboles[p.symbole].tDernier || 0));
    const instants = new Set();
    for (const p of ref) {
      for (const [t] of donnees.symboles[p.symbole].intraday) {
        if (periode === '1J' ? (bourse.length ? dateBourse(t) === session : t > fin - JOUR) : (t >= fin - 7 * JOUR && new Date(t).getUTCMinutes() % 30 === 0)) instants.add(t);
      }
    }
    const temps = [...instants].sort((a, b) => a - b);
    const points = temps.map((t) => {
      const taux = tauxA(donnees, devise, t);
      let v = 0;
      for (const p of ok) v += p.quantite * prixInstant(donnees.symboles[p.symbole], t) * taux;
      return { t, v };
    });
    let base = points[0]?.v;
    if (periode === '1J' && bourse.length) {
      // Base = valeur à la fermeture de la veille.
      const veille = ok.reduce((acc, p) => acc + p.quantite * (donnees.symboles[p.symbole].precedent ?? 0), 0);
      const taux = tauxA(donnees, devise, isoDate(msDate(session) - JOUR));
      if (veille > 0 && taux) base = veille * taux;
    }
    return { points, base, intraday: true };
  }

  const quot = valeursQuotidiennes(donnees, positions, devise);
  const dates = [...quot.keys()];
  if (!dates.length) return { erreur: 'Pas d’historique' };
  const complet = dates.map((d) => ({ t: msDate(d), v: quot.get(d).total }));
  const points = tranche(complet, dates, dates[dates.length - 1], periode);
  const live = valeurActuelle(donnees, positions, devise);
  if (live && live.session > dates[dates.length - 1]) points.push({ t: msDate(live.session), v: live.total, live: true });
  else if (live && points.length) points[points.length - 1] = { t: points[points.length - 1].t, v: live.total, live: true };
  return { points, base: points[0]?.v, intraday: false, complet };
}

/**
 * Valeur du portefeuille à chaque fermeture (Map date → { total, details }).
 * Un jour compte comme jour de bourse si au moins un titre de bourse du portefeuille a fermé ce jour-là.
 * Un titre sans prix ce jour-là (congé dans son pays) garde son dernier prix connu.
 */
export function valeursQuotidiennes(donnees, positions, devise) {
  const { ok } = positionsValides(donnees, positions);
  const bourse = ok.filter((p) => !estContinu(p.symbole));
  const ref = bourse.length ? bourse : ok;
  const dates = new Set();
  for (const p of ref) for (const [d] of donnees.symboles[p.symbole].quotidien) dates.add(d);
  const triees = [...dates].sort();
  const res = new Map();
  let precedent = null;
  for (const d of triees) {
    const taux = tauxA(donnees, devise, d);
    if (!taux) continue;
    const details = [];
    let total = 0;
    for (const p of ok) {
      const q = donnees.symboles[p.symbole].quotidien;
      // Titre pas encore en bourse ce jour-là (ex. SpaceX avant son IPO) : compté à son premier cours,
      // pour que son arrivée ne ressemble pas à un gain. Le graphique le signale.
      const prix = valeurAvant(q, d) ?? q[0]?.[1];
      if (prix == null) continue;
      const prixVeille = precedent ? (valeurAvant(q, precedent) ?? q[0]?.[1]) : null;
      const valeur = p.quantite * prix * taux;
      total += valeur;
      details.push({ symbole: p.symbole, quantite: p.quantite, prix, valeur, varPct: prixVeille ? (prix / prixVeille - 1) * 100 : null });
    }
    res.set(d, { total, details });
    precedent = d;
  }
  return res;
}

/** Valeur « à ce jour » avec les derniers prix disponibles, et la variation depuis la fermeture de la veille. */
export function valeurActuelle(donnees, positions, devise) {
  const { ok } = positionsValides(donnees, positions);
  if (!ok.length) return null;
  const bourse = ok.filter((p) => !estContinu(p.symbole));
  const ref = bourse.length ? bourse : ok;
  const session = ref.map((p) => donnees.symboles[p.symbole].session).sort().pop();
  const tauxNow = tauxA(donnees, devise, Date.now());
  const tauxVeille = tauxA(donnees, devise, isoDate(msDate(session) - JOUR));
  let total = 0, veille = 0;
  const details = [];
  for (const p of ok) {
    const s = donnees.symboles[p.symbole];
    const valeur = p.quantite * s.dernier * tauxNow;
    total += valeur;
    veille += p.quantite * (s.precedent ?? s.dernier) * tauxVeille;
    details.push({ symbole: p.symbole, quantite: p.quantite, prix: s.dernier, valeur, varPct: s.precedent ? (s.dernier / s.precedent - 1) * 100 : null });
  }
  return { total, veille, variation: total - veille, variationPct: veille ? (total / veille - 1) * 100 : null, session, details };
}

/**
 * Contribution de chaque titre à la variation du jour (dans la devise d'affichage), triée de la plus forte hausse
 * à la plus forte baisse, et poids de chaque titre dans le portefeuille.
 */
export function contributions(donnees, positions, devise) {
  const a = valeurActuelle(donnees, positions, devise);
  if (!a) return null;
  const lignes = a.details.map((d) => {
    const avant = d.varPct != null ? d.valeur / (1 + d.varPct / 100) : d.valeur;
    return { symbole: d.symbole, valeur: d.valeur, poids: a.total ? d.valeur / a.total : 0, variation: d.valeur - avant, varPct: d.varPct };
  });
  return { total: a.total, variation: a.variation, lignes };
}

/** Part du portefeuille par pays / secteur (sert aux suggestions d'indices). */
export function repartition(donnees, positions, titres) {
  const act = valeurActuelle(donnees, positions, 'USD');
  const parts = { pays: {}, secteur: {} };
  if (!act || !act.total) return parts;
  for (const d of act.details) {
    const t = titres[d.symbole] || {};
    parts.pays[t.pays] = (parts.pays[t.pays] || 0) + d.valeur / act.total;
    parts.secteur[t.secteur] = (parts.secteur[t.secteur] || 0) + d.valeur / act.total;
  }
  return parts;
}
