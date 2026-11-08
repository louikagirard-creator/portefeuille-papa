// Projection de retraite : si Michel retire X $ par année (indexé à l'inflation), combien de chances
// que l'argent dure N années ? Simulation de Monte-Carlo (2 000 trajectoires, une année par pas) avec :
//  - un rendement moyen choisi (prudent / moyen / optimiste);
//  - la volatilité choisie : celle du portefeuille sur 12 mois (analyse de risque), ou celle d'un portefeuille
//    d'actions diversifié (16 %) ou équilibré 60/40 (10 %), pour voir ce que coûte le risque actuel.
// Le générateur aléatoire a une graine fixe : les résultats ne « sautent » pas à chaque redessin.
// Montants affichés en dollars d'aujourd'hui (inflation retirée).
import { parametres, modifier } from './parametres.js';
import { chargerPrix } from './donnees.js';
import { analyser } from './risque.js';
import { argent, pct } from './format.js';

const TRAJECTOIRES = 2000;
const RENDEMENTS = { 4: 'Prudent (4 %)', 5: 'Moyen (5 %)', 6: 'Optimiste (6 %)' };
const HORIZONS = { 15: '15 ans', 20: '20 ans', 25: '25 ans', 30: '30 ans' };

let graphique = null;

/** Générateur pseudo-aléatoire reproductible (mulberry32) et loi normale (Box-Muller). */
function aleatoire(graine) {
  let a = graine >>> 0;
  const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());
}

/** Simule et renvoie les centiles 10/50/90 par année (dollars d'aujourd'hui) et la probabilité de réussite. */
export function simuler({ capital, retrait, horizon, rendement, inflation, volatilite }) {
  const normale = aleatoire(20261108);
  const sigma = Math.max(0.08, volatilite);
  const mu = Math.log(1 + rendement / 100) - sigma * sigma / 2;  // rendement moyen géométrique cohérent
  const infl = inflation / 100;
  const annees = Array.from({ length: horizon + 1 }, () => []);
  let reussites = 0;
  for (let i = 0; i < TRAJECTOIRES; i++) {
    let v = capital, ok = true;
    annees[0].push(v);
    for (let t = 1; t <= horizon; t++) {
      const r = Math.exp(mu + sigma * normale()) - 1;
      v = (v - retrait * (1 + infl) ** (t - 1)) * (1 + r);  // retrait en début d'année, indexé
      if (v <= 0) { v = 0; ok = false; }
      annees[t].push(v / (1 + infl) ** t);                  // en dollars d'aujourd'hui
    }
    if (ok) reussites++;
  }
  const centile = (arr, q) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(q * (s.length - 1))]; };
  return {
    p10: annees.map((a) => centile(a, 0.1)), p50: annees.map((a) => centile(a, 0.5)), p90: annees.map((a) => centile(a, 0.9)),
    reussite: reussites / TRAJECTOIRES, sigma
  };
}

const h = (tag, attrs = {}, ...enfants) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (v != null && v !== false) el.setAttribute(k, v);
  }
  for (const e of enfants.flat()) if (e != null && e !== false) el.append(e);
  return el;
};
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

function segments(label, options, valeur, onChange) {
  return h('fieldset', { class: 'pj-champ' }, h('legend', {}, label),
    h('div', { class: 'sc-choix' }, Object.entries(options).map(([v, t]) =>
      h('button', { type: 'button', class: 'puce-btn', 'aria-pressed': String(+v === +valeur), onclick: () => onChange(+v) }, t))));
}

export async function dessinerProjection() {
  const el = document.getElementById('projection');
  if (!el) return;
  const p = parametres();
  const d = await chargerPrix();
  el.classList.remove('chargement');
  const a = analyser(d, p);
  if (!a) { el.replaceChildren(h('p', { class: 'small' }, d.etat === 'ok' ? 'Ajoute tes positions dans Paramètres.' : d.message)); return; }
  const cfg = { horizon: 25, rendement: 5, inflation: 2.5, risque: 'actuel', ...(p.projection || {}) };
  const volActuelle = a.volatilite ?? 0.15;
  const volatilite = cfg.risque === 'actuel' ? volActuelle : +cfg.risque / 100;
  const retrait = cfg.retrait ?? Math.round(a.total * 0.04 / 1000) * 1000;   // 4 % par défaut
  const maj = (ch) => modifier({ projection: { ...cfg, retrait, ...ch } });

  const champRetrait = h('input', { type: 'number', min: '0', step: '1000', inputmode: 'numeric', value: retrait, id: 'pj-retrait',
    onchange: (e) => maj({ retrait: Math.max(0, parseFloat(e.target.value) || 0) }) });
  const res = simuler({ capital: a.total, retrait, horizon: cfg.horizon, rendement: cfg.rendement, inflation: cfg.inflation, volatilite });
  const taux = a.total ? retrait / a.total : 0;
  const niveau = res.reussite >= 0.85 ? 'hausse' : res.reussite >= 0.65 ? '' : 'baisse';

  graphique?.destroy();
  el.replaceChildren(
    h('div', { class: 'pj-reglages' },
      h('label', { class: 'pj-champ', for: 'pj-retrait' }, h('span', {}, `Retrait par année (${p.devise}, indexé à l’inflation)`), champRetrait,
        h('small', {}, `${pct(taux * 100, 1).replace('+', '')} du portefeuille`)),
      segments('Pendant', HORIZONS, cfg.horizon, (v) => maj({ horizon: v })),
      segments('Rendement moyen supposé', RENDEMENTS, cfg.rendement, (v) => maj({ rendement: v })),
      h('fieldset', { class: 'pj-champ' }, h('legend', {}, 'Niveau de risque (volatilité)'),
        h('div', { class: 'sc-choix' }, [['actuel', `Mon portefeuille (${pct(volActuelle * 100, 0).replace('+', '')})`], ['16', 'Actions diversifiées (16 %)'], ['10', 'Équilibré 60/40 (10 %)']]
          .map(([v, t]) => h('button', { type: 'button', class: 'puce-btn', 'aria-pressed': String(String(cfg.risque) === v), onclick: () => maj({ risque: v }) }, t))))),
    h('div', { class: 'tiles' },
      h('div', { class: 'tile rq-tuile ' + (niveau === 'hausse' ? 'rq-bas' : niveau === 'baisse' ? 'rq-eleve' : 'rq-moyen') },
        h('span', { class: 'small' }, `Chances que l’argent dure ${cfg.horizon} ans`),
        h('strong', { class: 'rq-val' }, pct(res.reussite * 100, 0).replace('+', '')),
        h('span', { class: 'small' }, res.reussite >= 0.85 ? 'Confortable.' : res.reussite >= 0.65 ? 'Raisonnable, mais à surveiller.' : 'Risqué : retrait trop élevé pour ce niveau de risque.')),
      h('div', { class: 'tile rq-tuile' },
        h('span', { class: 'small' }, `Valeur médiane dans ${cfg.horizon} ans`),
        h('strong', { class: 'rq-val' }, argent(res.p50[cfg.horizon], p.devise, 0)),
        h('span', { class: 'small' }, `En dollars d’aujourd’hui. 1 fois sur 10 : moins de ${argent(res.p10[cfg.horizon], p.devise, 0)}.`))),
    h('div', { class: 'chart' }, h('canvas', { role: 'img', 'aria-label': 'Projection de la valeur du portefeuille' })),
    h('p', { class: 'small' }, `${TRAJECTOIRES.toLocaleString('fr-CA')} scénarios simulés avec une volatilité de ${pct(res.sigma * 100, 0).replace('+', '')} par année${cfg.risque === 'actuel' ? ' (celle de ton portefeuille sur 12 mois)' : ''} et une inflation de ${String(cfg.inflation).replace('.', ',')} %. Ne tient pas compte de l’impôt, des frais, ni des retraits minimums d’un FERR. Repère courant : retirer 4 % par année est jugé prudent pour un portefeuille diversifié. Plus un portefeuille bouge, plus les mauvaises années du début font mal quand on retire de l’argent : compare les niveaux de risque.`));

  const annees = res.p50.map((_, i) => (i === 0 ? 'Auj.' : `${i} an${i > 1 ? 's' : ''}`));
  const acc = css('--accent');
  graphique = new window.Chart(el.querySelector('canvas'), {
    type: 'line',
    data: { labels: annees, datasets: [
      { label: '1 fois sur 10 (mauvais)', data: res.p10, borderColor: css('--down'), borderWidth: 1.5, pointRadius: 0, fill: false, borderDash: [4, 3] },
      { label: 'Médiane', data: res.p50, borderColor: acc, borderWidth: 2.5, pointRadius: 0, fill: false },
      { label: '1 fois sur 10 (bon)', data: res.p90, borderColor: css('--up'), borderWidth: 1.5, pointRadius: 0, fill: '-2', backgroundColor: `color-mix(in srgb, ${acc} 12%, transparent)`, borderDash: [4, 3] }
    ] },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, animation: { duration: 250 },
      scales: { x: { grid: { display: false }, ticks: { color: css('--muted'), maxTicksLimit: 6 } },
        y: { grid: { color: css('--line') }, ticks: { color: css('--muted'), maxTicksLimit: 5, callback: (v) => argent(v, p.devise, 0) }, beginAtZero: true } },
      plugins: { legend: { labels: { color: css('--fg'), boxWidth: 14, usePointStyle: true } },
        tooltip: { backgroundColor: css('--panel'), titleColor: css('--muted'), bodyColor: css('--fg'), borderColor: css('--line'), borderWidth: 1,
          callbacks: { label: (x) => ` ${x.dataset.label} : ${argent(x.raw, p.devise, 0)}` } } } }
  });
}

window.addEventListener('mg:parametres', (e) => {
  if (['positions', 'projection', 'devise', 'discret', 'formatNombre', 'theme', 'accent', 'gainsPertes'].some((k) => k in e.detail)) dessinerProjection();
});
