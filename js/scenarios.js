// Scénarios de crise (« stress tests ») : combien vaudrait le portefeuille si…
// Deux façons de calculer le choc de chaque titre :
//  - scénarios prédéfinis : hypothèses par titre, liées aux enjeux suivis par le site (Taïwan, Ormuz, IA, dollar);
//    un titre ajouté par Michel reçoit « bêta × mouvement du marché » du scénario;
//  - scénario libre : 4 curseurs (bourse, pétrole, métaux, dollar), combinés avec le bêta réel de chaque titre.
// Ce sont des ordres de grandeur, pas des prévisions.
import { parametres } from './parametres.js';
import { chargerPrix } from './donnees.js';
import { analyser } from './risque.js';
import { argent, argentSigne, pct, sens } from './format.js';
import { TITRES } from './config.js';

// Chocs en % par titre. « marche » = mouvement du S&P 500 supposé (sert aux titres sans hypothèse propre).
const SCENARIOS = [
  { id: 'taiwan', nom: 'Blocus de Taïwan', marche: -12,
    pourquoi: 'La Chine bloque Taïwan : les puces et la mémoire s’effondrent, le pétrole et l’or servent de refuge.',
    chocs: { EWT: -40, SNDK: -35, WDC: -30, GOOGL: -15, SPCX: -15, SU: 10, CVE: 12, 'XAU/USD': 15, 'XAG/USD': 10, 'XPT/USD': 5, 'XPD/USD': 10 } },
  { id: 'ia', nom: 'Bulle de l’IA qui dégonfle', marche: -15,
    pourquoi: 'Les investissements en IA déçoivent : le Nasdaq recule d’environ 25 %, la mémoire et les grandes technos en tête.',
    chocs: { GOOGL: -30, SNDK: -45, WDC: -40, EWT: -30, SPCX: -35, SU: -5, CVE: -6, 'XAU/USD': 4, 'XAG/USD': -5, 'XPT/USD': -5, 'XPD/USD': -5 } },
  { id: 'krach', nom: 'Krach boursier (−20 %)', marche: -20, parBeta: true,
    pourquoi: 'Baisse générale de 20 % du S&P 500. Chaque titre bouge selon son bêta réel des 12 derniers mois; l’or monte un peu.',
    chocs: { 'XAU/USD': 5, 'XAG/USD': -8, 'XPT/USD': -10, 'XPD/USD': -12 } },
  { id: 'ormuz', nom: 'Réouverture d’Ormuz (pétrole −25 %)', marche: 2,
    pourquoi: 'Le trafic reprend à Ormuz : le pétrole perd environ 25 %, les pétrolières canadiennes reculent, le reste profite d’une inflation plus faible.',
    chocs: { SU: -18, CVE: -24, GOOGL: 3, SNDK: 3, WDC: 3, EWT: 3, SPCX: 3, 'XAU/USD': -4, 'XAG/USD': -4, 'XPT/USD': -3, 'XPD/USD': -3 } },
  { id: 'dollar', nom: 'Dollar US −10 % face au $ CA', marche: 0, fx: -10,
    pourquoi: 'Aucun titre ne bouge en $ US, mais chaque dollar américain vaut 10 % de moins en dollars canadiens.',
    chocs: {} },
  { id: 'or', nom: 'Ruée vers l’or (+20 %)', marche: -3,
    pourquoi: 'Crise de confiance (dettes, banques centrales) : l’or gagne 20 %, l’argent et le platine suivent, la bourse recule un peu.',
    chocs: { 'XAU/USD': 20, 'XAG/USD': 28, 'XPT/USD': 15, 'XPD/USD': 12 } }
];

/** Choc (en %) d'un titre pour un scénario prédéfini. */
function chocPredefini(sc, s, betas) {
  if (sc.chocs[s] != null) return sc.chocs[s];
  const b = betas[s] ?? (TITRES[s]?.secteur === 'metaux' ? 0 : 1);
  return b * sc.marche;
}

/** Choc (en %) d'un titre pour le scénario libre. */
function chocLibre(c, s, betas) {
  const t = TITRES[s] || {};
  if (t.secteur === 'metaux') return c.metaux * (s === 'XAU/USD' ? 1 : 1.3);
  let v = (betas[s] ?? 1) * c.bourse;
  if (t.secteur === 'energie') v += 0.65 * c.petrole; // les pétrolières suivent environ 2/3 du prix du baril
  return v;
}

let graphique = null;
let choix = 'taiwan';
const libre = { bourse: -10, petrole: 0, metaux: 0, dollar: 0 };

const h = (tag, attrs = {}, ...enfants) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (v != null) el.setAttribute(k, v);
  }
  for (const e of enfants.flat()) if (e != null && e !== false) el.append(e);
  return el;
};
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

export async function dessinerScenarios() {
  const el = document.getElementById('scenarios-contenu');
  if (!el) return;
  const p = parametres();
  const donnees = await chargerPrix();
  el.classList.remove('chargement');
  const a = analyser(donnees, p);
  if (!a) { el.replaceChildren(h('p', { class: 'small' }, donnees.etat === 'ok' ? 'Ajoute tes positions dans Paramètres pour tester des scénarios.' : donnees.message)); return; }

  const boutons = h('div', { class: 'sc-choix', role: 'group', 'aria-label': 'Scénario' },
    [...SCENARIOS, { id: 'libre', nom: 'Mon scénario' }].map((sc) => h('button', { type: 'button', class: 'puce-btn', 'aria-pressed': String(sc.id === choix),
      onclick: () => { choix = sc.id; dessinerScenarios(); } }, sc.nom)));
  const resultat = h('div', { class: 'sc-resultat' });
  const sc0 = SCENARIOS.find((x) => x.id === choix);
  // Les curseurs sont créés une seule fois : seul le résultat est redessiné pendant qu'on les glisse.
  const curseurs = sc0 ? null : h('div', { class: 'sc-curseurs' },
    [['bourse', 'Bourse (S&P 500)', -40, 30], ['petrole', 'Prix du pétrole', -50, 80], ['metaux', 'Or et métaux', -30, 50], ['dollar', '$ US face au $ CA', -20, 20]]
      .map(([k, label, min, max]) => {
        const sortie = h('output', {}, pct(libre[k], 0));
        return h('label', { class: 'sc-curseur' }, h('span', {}, label), sortie,
          h('input', { type: 'range', min, max, step: '1', value: libre[k],
            oninput: (e) => { libre[k] = +e.target.value; sortie.textContent = pct(libre[k], 0); clearTimeout(calculer.t); calculer.t = setTimeout(calculer, 120); } }));
      }));
  el.replaceChildren(...[boutons,
    h('p', { class: 'small' }, sc0 ? sc0.pourquoi : 'Bouge les curseurs : chaque titre réagit selon son bêta réel face au S&P 500; les pétrolières suivent environ 2/3 du prix du baril.'),
    curseurs, resultat].filter(Boolean));

  const calculer = () => {
    const sc = SCENARIOS.find((x) => x.id === choix);
    const fx = sc ? (sc.fx || 0) : libre.dollar;
    const effetFx = p.devise === 'CAD' ? fx : 0; // en $ US, le taux de change ne change rien
    const lignes = a.poids.map((x) => {
      const choc = sc ? (sc.parBeta && sc.chocs[x.symbole] == null ? (a.betas[x.symbole] ?? 1) * sc.marche : chocPredefini(sc, x.symbole, a.betas)) : chocLibre(libre, x.symbole, a.betas);
      const enUSD = (donnees.symboles[x.symbole]?.devise || 'USD') === 'USD';
      const total = ((1 + choc / 100) * (1 + (enUSD ? effetFx : 0) / 100) - 1) * 100;
      return { symbole: x.symbole, choc: total, impact: x.valeur * total / 100 };
    }).sort((x, y) => x.impact - y.impact);
    const impact = lignes.reduce((s, l) => s + l.impact, 0);
    const impactPct = impact / a.total * 100;

    graphique?.destroy();
    resultat.replaceChildren(
      h('div', { class: 'sc-total' },
        h('span', { class: 'small' }, 'Effet sur le portefeuille'),
        h('strong', { class: sens(impact) }, `${argentSigne(impact, p.devise, 0)} (${pct(impactPct, 1)})`),
        h('span', { class: 'small' }, `Valeur après le choc : ${argent(a.total + impact, p.devise, 0)}`)),
      h('div', { class: 'chart', style: `height:${Math.max(200, lignes.length * 28 + 30)}px` }, h('canvas', { role: 'img', 'aria-label': 'Effet du scénario par titre' })));
    graphique = new window.Chart(resultat.querySelector('canvas'), {
      type: 'bar',
      data: { labels: lignes.map((l) => TITRES[l.symbole]?.court || l.symbole),
        datasets: [{ data: lignes.map((l) => l.impact), backgroundColor: lignes.map((l) => (l.impact >= 0 ? css('--up') : css('--down'))), borderRadius: 3, barThickness: 14 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
        scales: { x: { grid: { color: css('--line') }, ticks: { color: css('--muted'), maxTicksLimit: 5, callback: (v) => argentSigne(v, p.devise, 0) } },
          y: { grid: { display: false }, ticks: { color: css('--fg') } } },
        plugins: { legend: { display: false }, tooltip: { backgroundColor: css('--panel'), titleColor: css('--muted'), bodyColor: css('--fg'), borderColor: css('--line'), borderWidth: 1,
          callbacks: { label: (x) => { const l = lignes[x.dataIndex]; return ` ${argentSigne(l.impact, p.devise, 0)} · titre ${pct(l.choc, 0)}`; } } } } }
    });
  };
  calculer();
}

window.addEventListener('mg:parametres', (e) => {
  if (['positions', 'devise', 'discret', 'formatNombre', 'gainsPertes', 'theme', 'accent'].some((k) => k in e.detail)) dessinerScenarios();
});
