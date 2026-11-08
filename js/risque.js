// Analyse de risque du portefeuille, comme dans un rapport de gestion privée :
// concentration, exposition (secteur, pays, devise), volatilité, pire baisse, bêta face au S&P 500,
// « mauvais mois » probable, et titres qui bougent ensemble (corrélations sur 1 an).
// Tous les calculs partent des fermetures quotidiennes de data/prix.json (aucun appel de plus).
import { parametres } from './parametres.js';
import { chargerPrix, valeursQuotidiennes, valeurActuelle, positionsValides, msDate } from './donnees.js';
import { argent, argentSigne, pct, dateCourte } from './format.js';
import { TITRES } from './config.js';

const UN_AN = 252;          // jours de bourse
const NOMS_SECTEUR = { techno: 'Technologie', energie: 'Énergie', metaux: 'Métaux précieux', autre: 'Autres' };
const NOMS_PAYS = { US: 'États-Unis', CA: 'Canada', TW: 'Taïwan', MONDE: 'Mondial (métaux)' };

// ---------- Statistiques ----------

const moyenne = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const ecartType = (a) => { const m = moyenne(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

/** Rendements quotidiens Map(date → r) à partir de [[date, prix], …]. */
function rendements(serie) {
  const m = new Map();
  for (let i = 1; i < serie.length; i++) if (serie[i - 1][1] > 0) m.set(serie[i][0], serie[i][1] / serie[i - 1][1] - 1);
  return m;
}

/** Paires de rendements aux dates communes (les dates les plus récentes, au plus n). */
function communs(a, b, n = UN_AN) {
  const dates = [...a.keys()].filter((d) => b.has(d)).sort().slice(-n);
  return [dates.map((d) => a.get(d)), dates.map((d) => b.get(d))];
}

function correlation(a, b) {
  const [x, y] = communs(a, b);
  if (x.length < 60) return null;
  const mx = moyenne(x), my = moyenne(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

function beta(a, marche) {
  const [x, m] = communs(a, marche);
  if (x.length < 60) return null;
  const mx = moyenne(x), mm = moyenne(m);
  let cov = 0, v = 0;
  for (let i = 0; i < x.length; i++) { cov += (x[i] - mx) * (m[i] - mm); v += (m[i] - mm) ** 2; }
  return v ? cov / v : null;
}

/**
 * Analyse complète. Renvoie null si les données ou les positions manquent.
 * Les montants sont dans la devise d'affichage; le bêta et les corrélations sont calculés en $ US.
 */
export function analyser(donnees, p) {
  if (donnees?.etat !== 'ok') return null;
  const act = valeurActuelle(donnees, p.positions, p.devise);
  if (!act || !act.total) return null;
  const { ok } = positionsValides(donnees, p.positions);

  // Poids et exposition
  const poids = act.details.map((d) => ({ symbole: d.symbole, valeur: d.valeur, poids: d.valeur / act.total })).sort((a, b) => b.poids - a.poids);
  const expo = { secteur: {}, pays: {} };
  for (const x of poids) {
    const t = TITRES[x.symbole] || {};
    expo.secteur[t.secteur || 'autre'] = (expo.secteur[t.secteur || 'autre'] || 0) + x.poids;
    expo.pays[t.pays || 'US'] = (expo.pays[t.pays || 'US'] || 0) + x.poids;
  }
  const partUSD = poids.filter((x) => (donnees.symboles[x.symbole]?.devise || 'USD') === 'USD').reduce((s, x) => s + x.poids, 0);
  const nbEffectif = 1 / poids.reduce((s, x) => s + x.poids ** 2, 0);

  // Série de valeur du portefeuille (devise d'affichage) et en $ US pour le bêta
  const serie = [...valeursQuotidiennes(donnees, p.positions, p.devise)].map(([d, v]) => [d, v.total]);
  const serieUSD = [...valeursQuotidiennes(donnees, p.positions, 'USD')].map(([d, v]) => [d, v.total]);
  const rPort = rendements(serie);
  const r1an = [...rPort.values()].slice(-UN_AN);
  const volatilite = r1an.length > 30 ? ecartType(r1an) * Math.sqrt(UN_AN) : null;

  // Pire baisse (du sommet au creux) sur 1 an
  let sommet = -Infinity, dSommet = null, pire = 0, dHaut = null, dBas = null;
  for (const [d, v] of serie.slice(-UN_AN)) {
    if (v > sommet) { sommet = v; dSommet = d; }
    const baisse = v / sommet - 1;
    if (baisse < pire) { pire = baisse; dHaut = dSommet; dBas = d; }
  }

  // « Mauvais mois » : 5e centile des variations sur 21 jours de bourse (historique ~2 ans)
  const mois = [];
  for (let i = 21; i < serie.length; i++) mois.push(serie[i][1] / serie[i - 21][1] - 1);
  mois.sort((a, b) => a - b);
  const mauvaisMois = mois.length > 40 ? mois[Math.floor(mois.length * 0.05)] : null;
  const pireMois = mois.length ? mois[0] : null;

  // Bêta et corrélations (en $ US)
  const spy = donnees.symboles.SPY && !donnees.symboles.SPY.erreur ? rendements(donnees.symboles.SPY.quotidien) : null;
  const rTitres = Object.fromEntries(ok.map((x) => [x.symbole, rendements(donnees.symboles[x.symbole].quotidien)]));
  const betaPort = spy ? beta(rendements(serieUSD), spy) : null;
  const betas = Object.fromEntries(Object.entries(rTitres).map(([s, r]) => [s, spy ? beta(r, spy) : null]));
  const symboles = poids.map((x) => x.symbole).filter((s) => rTitres[s]);
  const correl = {};
  for (const a of symboles) for (const b of symboles) if (a < b) correl[a + '|' + b] = correlation(rTitres[a], rTitres[b]);
  const corr = (a, b) => (a === b ? 1 : correl[a < b ? a + '|' + b : b + '|' + a] ?? null);

  // Groupes qui bougent ensemble (corrélation ≥ 0,7) et poids combiné
  const paires = Object.entries(correl).filter(([, c]) => c != null && c >= 0.7).map(([k, c]) => ({ a: k.split('|')[0], b: k.split('|')[1], c })).sort((x, y) => y.c - x.c);

  return { total: act.total, devise: p.devise, poids, expo, partUSD, nbEffectif, volatilite, pireBaisse: pire, dHaut, dBas,
    mauvaisMois, pireMois, betaPort, betas, symboles, corr, paires };
}

/** Résumé en texte pour l'assistant IA. */
export async function resumeRisque() {
  const a = analyser(await chargerPrix(), parametres());
  if (!a) return '';
  const nom = (s) => TITRES[s]?.court || s;
  return [
    `RISQUE : volatilité annuelle ${pct(a.volatilite * 100, 1)}; pire baisse sur 1 an ${pct(a.pireBaisse * 100, 1)} (${a.dHaut} → ${a.dBas}); bêta face au S&P 500 ${a.betaPort?.toFixed(2) ?? 'n.d.'}; mauvais mois (1 sur 20) ${pct((a.mauvaisMois ?? 0) * 100, 1)}.`,
    `Concentration : plus grosse position ${nom(a.poids[0].symbole)} ${pct(a.poids[0].poids * 100, 1).replace('+', '')}; nombre effectif de titres ${a.nbEffectif.toFixed(1)}; part en $ US ${pct(a.partUSD * 100, 0).replace('+', '')}.`,
    `Secteurs : ${Object.entries(a.expo.secteur).map(([k, v]) => `${NOMS_SECTEUR[k] || k} ${pct(v * 100, 0).replace('+', '')}`).join(', ')}.`,
    `Bêtas : ${Object.entries(a.betas).filter(([, b]) => b != null).map(([s, b]) => `${nom(s)} ${b.toFixed(2)}`).join(', ')}.`,
    a.paires.length ? `Titres très liés (corrélation ≥ 0,7) : ${a.paires.slice(0, 6).map((x) => `${nom(x.a)}–${nom(x.b)} ${x.c.toFixed(2)}`).join(', ')}.` : ''
  ].join('\n');
}

// ---------- Affichage ----------

const h = (tag, attrs = {}, ...enfants) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v; else if (k === 'style') el.style.cssText = v; else if (v != null) el.setAttribute(k, v);
  }
  for (const e of enfants.flat()) if (e != null && e !== false) el.append(e);
  return el;
};
const p0 = (v) => pct(v * 100, 0).replace('+', '');
const p1 = (v) => pct(v * 100, 1).replace('+', '');

function tuile(titre, valeur, explication, niveau) {
  return h('div', { class: 'tile rq-tuile' + (niveau ? ' ' + niveau : '') },
    h('span', { class: 'small' }, titre), h('strong', { class: 'rq-val' }, valeur), h('span', { class: 'small' }, explication));
}

function barres(titre, parts, noms) {
  const lignes = Object.entries(parts).sort((a, b) => b[1] - a[1]);
  return h('div', { class: 'rq-barres' }, h('p', { class: 'gr-menu-titre' }, titre),
    lignes.map(([k, v]) => h('div', { class: 'rq-barre' },
      h('span', {}, noms[k] || k),
      h('span', { class: 'rq-piste' }, h('span', { class: 'rq-rempli', style: `width:${Math.max(1, v * 100).toFixed(1)}%` })),
      h('span', { class: 'rq-pct' }, p0(v)))));
}

/** Couleur d'une case de corrélation : neutre près de 0, accent vers +1, bleu vers −1. */
function couleurCorr(c) {
  if (c == null) return 'transparent';
  const fort = Math.round(Math.abs(c) * 85);
  return c >= 0 ? `color-mix(in srgb, var(--down) ${fort}%, var(--panel))` : `color-mix(in srgb, #3b82f6 ${fort}%, var(--panel))`;
}

export async function dessinerRisque() {
  const el = document.getElementById('risque-contenu');
  if (!el) return;
  const p = parametres();
  const donnees = await chargerPrix();
  el.classList.remove('chargement');
  const a = analyser(donnees, p);
  if (!a) { el.replaceChildren(h('p', { class: 'small' }, donnees.etat === 'ok' ? 'Ajoute tes positions dans Paramètres pour voir l’analyse de risque.' : donnees.message)); return; }
  const nom = (s) => TITRES[s]?.court || s;
  const grosse = a.poids[0];
  const top3 = a.poids.slice(0, 3).reduce((s, x) => s + x.poids, 0);

  // Alertes de concentration, en langage clair
  const alertes = [];
  for (const x of a.poids.filter((x) => x.poids >= 0.15)) alertes.push(`${nom(x.symbole)} pèse ${p1(x.poids)} du portefeuille (repère courant : 10 à 15 % au maximum par titre).`);
  if (top3 > 0.5) alertes.push(`Les 3 plus grosses positions font ${p0(top3)} du total.`);
  const secteurMax = Object.entries(a.expo.secteur).sort((x, y) => y[1] - x[1])[0];
  if (secteurMax && secteurMax[1] > 0.4) alertes.push(`${NOMS_SECTEUR[secteurMax[0]] || secteurMax[0]} : ${p0(secteurMax[1])} du portefeuille dans un seul secteur.`);
  if (a.partUSD > 0.8 && p.devise === 'CAD') alertes.push(`${p0(a.partUSD)} des placements sont en dollars US : si le $ US perd 10 % face au $ CA, le portefeuille perd environ ${argent(a.total * a.partUSD * 0.1, p.devise, 0)} sans qu’aucun titre ne bouge.`);
  // Groupes liés : réunit les paires qui partagent un titre
  const groupes = [];
  for (const { a: x, b: y } of a.paires) {
    const g = groupes.find((G) => G.has(x) || G.has(y));
    if (g) { g.add(x); g.add(y); } else groupes.push(new Set([x, y]));
  }
  for (const g of groupes) {
    const part = a.poids.filter((x) => g.has(x.symbole)).reduce((s, x) => s + x.poids, 0);
    if (g.size >= 2) alertes.push(`${[...g].map(nom).join(', ')} bougent presque ensemble (corrélation ≥ 0,7) : ensemble ${p0(part)} du portefeuille, donc moins diversifié qu’il n’y paraît.`);
  }

  const vol = a.volatilite;
  const niveauVol = vol == null ? '' : vol > 0.3 ? 'rq-eleve' : vol > 0.18 ? 'rq-moyen' : 'rq-bas';
  const beta = a.betaPort;

  // Carte des corrélations (défilement horizontal sur téléphone)
  const syms = a.symboles;
  const table = h('table', { class: 'rq-corr' },
    h('thead', {}, h('tr', {}, h('th', {}), syms.map((s) => h('th', { scope: 'col' }, h('span', {}, nom(s)))))),
    h('tbody', {}, syms.map((r) => h('tr', {}, h('th', { scope: 'row' }, nom(r)),
      syms.map((c) => { const v = a.corr(r, c); return h('td', { style: `background:${couleurCorr(r === c ? null : v)}`, title: `${nom(r)} / ${nom(c)} : ${v == null ? 'n.d.' : v.toFixed(2)}` }, r === c ? '—' : v == null ? '' : v.toFixed(1)); })))));

  el.replaceChildren(...[
    h('div', { class: 'tiles rq-tuiles' },
      tuile('Volatilité (1 an)', vol == null ? '—' : p0(vol), vol == null ? '' : `Variation typique sur une année. S&P 500 : environ 15 à 20 %.`, niveauVol),
      tuile('Pire baisse sur 1 an', p1(a.pireBaisse), a.dHaut ? `Du sommet du ${dateCourte(msDate(a.dHaut))} au creux du ${dateCourte(msDate(a.dBas))}.` : '', a.pireBaisse < -0.2 ? 'rq-eleve' : a.pireBaisse < -0.1 ? 'rq-moyen' : 'rq-bas'),
      tuile('Mauvais mois (1 fois sur 20)', a.mauvaisMois == null ? '—' : p1(a.mauvaisMois), a.mauvaisMois == null ? '' : `Soit environ ${argentSigne(a.total * a.mauvaisMois, p.devise, 0)}. Pire mois observé : ${p1(a.pireMois)}.`),
      tuile('Bêta face au S&P 500', beta == null ? '—' : beta.toFixed(2).replace('.', ','), beta == null ? '' : `Si la bourse américaine baisse de 10 %, le portefeuille tend à bouger de ${pct(-10 * beta, 1)}.`),
      tuile('Diversification réelle', a.nbEffectif.toFixed(1).replace('.', ',') + ' titres', `Se comporte comme ${a.nbEffectif.toFixed(1).replace('.', ',')} titres de poids égal (sur ${a.poids.length}). Plus grosse position : ${nom(grosse.symbole)}, ${p1(grosse.poids)}.`)),
    alertes.length ? h('div', { class: 'rq-alertes' }, h('p', { class: 'gr-menu-titre' }, 'Points d’attention'), h('ul', {}, alertes.map((t) => h('li', {}, t)))) : null,
    h('div', { class: 'grid rq-expo' },
      barres('Par secteur', a.expo.secteur, NOMS_SECTEUR),
      barres('Par pays', a.expo.pays, NOMS_PAYS),
      barres('Par devise de cotation', { USD: a.partUSD, CAD: 1 - a.partUSD }, { USD: 'Dollar US', CAD: 'Dollar canadien' })),
    h('details', { class: 'rq-details' },
      h('summary', {}, 'Quels titres bougent ensemble ? (corrélations sur 1 an)'),
      h('p', { class: 'small' }, '1 = bougent toujours dans le même sens; 0 = sans lien; négatif = bougent en sens inverse (protègent). Plus la case est rouge, moins les deux titres se diversifient.'),
      h('div', { class: 'rq-corr-box' }, table)),
    h('p', { class: 'small' }, 'Calculé sur les fermetures quotidiennes des 12 derniers mois (bêta et corrélations en $ US). Le passé ne garantit pas l’avenir; ces chiffres servent à comparer et à poser les bonnes questions à ton conseiller.')
  ].filter(Boolean));
}

window.addEventListener('mg:parametres', (e) => {
  if (['positions', 'devise', 'discret', 'formatNombre', 'gainsPertes', 'theme'].some((k) => k in e.detail)) dessinerRisque();
});
