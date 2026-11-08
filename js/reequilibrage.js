// Calculatrice de rééquilibrage : Michel choisit un poids cible par titre (ou un modèle : plafond de 10 %,
// poids égal), et la carte calcule les achats et ventes qui y mènent, en $ et en nombre d'unités,
// avec l'impôt approximatif sur les ventes faites dans un compte non enregistré.
// C'est un calcul, pas une recommandation : la décision et le choix des cibles restent à Michel et à son conseiller.
import { parametres, modifier } from './parametres.js';
import { chargerPrix, valeurActuelle, tauxConversion } from './donnees.js';
import { argent, pct, nombre } from './format.js';
import { TITRES, COMPTES } from './config.js';

const TAUX_GAIN = 0.5 * 0.533; // Québec, taux marginal maximal, 50 % imposable

const h = (tag, attrs = {}, ...enfants) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (v != null && v !== false) el.setAttribute(k, v);
  }
  for (const e of enfants.flat()) if (e != null && e !== false) el.append(e);
  return el;
};
const arrondi = (v) => Math.round(v * 10) / 10;

/** Plafonne chaque poids à `max` et redistribue l'excédent entre les autres, au prorata. */
function plafonner(poids, max) {
  const res = { ...poids };
  for (let i = 0; i < 20; i++) {
    const exces = Object.values(res).reduce((s, v) => s + Math.max(0, v - max), 0);
    if (exces < 1e-9) break;
    const libres = Object.keys(res).filter((k) => res[k] < max);
    const base = libres.reduce((s, k) => s + res[k], 0);
    for (const k of Object.keys(res)) if (res[k] > max) res[k] = max;
    if (!base) break;
    for (const k of libres) res[k] += exces * (res[k] / base);
  }
  return res;
}

export async function dessinerReequilibrage() {
  const el = document.getElementById('reequilibrage');
  if (!el) return;
  const p = parametres();
  const d = await chargerPrix();
  el.classList.remove('chargement');
  const act = d.etat === 'ok' ? valeurActuelle(d, p.positions, p.devise) : null;
  if (!act || !act.total) { el.replaceChildren(h('p', { class: 'small' }, d.etat === 'ok' ? 'Ajoute tes positions dans Paramètres.' : d.message)); return; }

  const pos = new Map(p.positions.map((x) => [x.symbole, x]));
  const actuels = Object.fromEntries(act.details.map((x) => [x.symbole, (x.valeur / act.total) * 100]));
  const cibles = { ...Object.fromEntries(Object.entries(actuels).map(([k, v]) => [k, arrondi(v)])), ...(p.cibles || {}) };
  const nom = (s) => TITRES[s]?.court || s;
  const dev = p.devise;

  const appliquerModele = (c) => { modifier({ cibles: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, arrondi(v)])) }); };
  const modeles = h('div', { class: 'sc-choix' },
    h('button', { type: 'button', class: 'puce-btn', onclick: () => appliquerModele(plafonner(actuels, 10)) }, 'Plafond 10 % par titre'),
    h('button', { type: 'button', class: 'puce-btn', onclick: () => appliquerModele(plafonner(actuels, 15)) }, 'Plafond 15 %'),
    h('button', { type: 'button', class: 'puce-btn', onclick: () => appliquerModele(Object.fromEntries(Object.keys(actuels).map((k) => [k, 100 / Object.keys(actuels).length]))) }, 'Poids égal'),
    h('button', { type: 'button', class: 'puce-btn', onclick: () => modifier({ cibles: null }) }, 'Revenir aux poids actuels'));

  const sommeBrute = Object.keys(actuels).reduce((s, k) => s + (+cibles[k] || 0), 0);
  // Les arrondis (ex. 100,1 %) ne doivent pas compter : à moins de 0,5 point près, on ramène le total à 100 %.
  const facteur = Math.abs(sommeBrute - 100) < 0.5 && sommeBrute > 0 ? 100 / sommeBrute : 1;
  const somme = sommeBrute * facteur;
  let achats = 0, ventes = 0, impot = 0;
  const lignes = act.details.slice().sort((a, b) => b.valeur - a.valeur).map((x) => {
    const cible = +cibles[x.symbole] || 0;
    const ecart = act.total * cible * facteur / 100 - x.valeur;          // > 0 : acheter, < 0 : vendre
    const prixAff = x.prix * (tauxConversion(d, d.symboles[x.symbole]?.devise || 'USD', dev) ?? 1);
    const unites = prixAff ? Math.abs(ecart) / prixAff : 0;
    const q = pos.get(x.symbole) || {};
    let impotLigne = 0;
    if (ecart < 0 && (q.compte || 'non-enregistre') === 'non-enregistre' && q.prixAchat > 0) {
      const coutUnite = q.prixAchat * (tauxConversion(d, q.deviseAchat || 'USD', dev) ?? 1);
      impotLigne = Math.max(0, (prixAff - coutUnite) * unites) * TAUX_GAIN;
    }
    if (ecart > 0) achats += ecart; else ventes -= ecart;
    impot += impotLigne;
    const petit = Math.abs(ecart) < act.total * 0.002; // moins de 0,2 % du portefeuille : on n'y touche pas
    const operation = petit ? h('span', { class: 'small' }, 'Rien à faire')
      : h('span', { class: ecart > 0 ? 'hausse' : 'baisse' }, `${ecart > 0 ? 'Acheter' : 'Vendre'} ${argent(Math.abs(ecart), dev, 0)}`,
        h('small', {}, ` ≈ ${nombre(unites, unites < 10 ? 2 : 0)} ${TITRES[x.symbole]?.unite || 'unités'}`));
    return h('li', { class: 'rb-ligne' },
      h('span', { class: 'rb-nom' }, nom(x.symbole), h('small', {}, COMPTES[q.compte || 'non-enregistre'])),
      h('span', { class: 'rb-actuel' }, pct(actuels[x.symbole], 1).replace('+', '')),
      h('label', { class: 'rb-cible' }, h('span', { class: 'sr' }, 'Cible pour ' + nom(x.symbole) + ' en %'),
        h('input', { type: 'number', min: '0', max: '100', step: '0.5', inputmode: 'decimal', value: cible,
          onchange: (e) => modifier({ cibles: { ...cibles, [x.symbole]: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) } }) }), '%'),
      h('span', { class: 'rb-op' }, operation, impotLigne > 1 ? h('small', { class: 'rb-impot' }, `impôt ≈ ${argent(impotLigne, dev, 0)}`) : null));
  });

  const liquidites = 100 - somme;
  el.replaceChildren(
    h('p', { class: 'small' }, 'Choisis un modèle ou entre ta cible pour chaque titre. Le calcul montre quoi acheter ou vendre pour l’atteindre.'),
    modeles,
    h('div', { class: 'rb-tete small' }, h('span', {}, 'Titre'), h('span', {}, 'Actuel'), h('span', {}, 'Cible'), h('span', {}, 'Opération')),
    h('ul', { class: 'rb-liste' }, lignes),
    h('div', { class: 'sc-total' },
      h('span', { class: 'small' }, `Total des cibles : ${pct(somme, 1).replace('+', '')}` + (Math.abs(liquidites) >= 0.5 ? (liquidites > 0 ? ` (le reste, ${pct(liquidites, 1).replace('+', '')}, resterait en liquidités)` : ' — c’est plus que 100 % : baisse certaines cibles') : '')),
      h('strong', {}, `Ventes ${argent(ventes, dev, 0)} · Achats ${argent(achats, dev, 0)}`),
      h('span', { class: 'small' }, impot > 1 ? `Impôt approximatif sur les gains réalisés en non enregistré : ${argent(impot, dev, 0)} (selon les prix payés entrés).` : 'Aucun impôt estimé (ventes dans des comptes enregistrés, ou prix payés non entrés).')),
    h('p', { class: 'small' }, 'Un calcul pour réfléchir, pas une recommandation. Vendre dans un REER ou un CELI ne crée pas d’impôt; en non enregistré, chaque vente avec gain est imposable. À valider avec ton conseiller avant d’agir.'));
  if (somme > 100.5) el.querySelector('.sc-total strong').classList.add('baisse');
}

window.addEventListener('mg:parametres', (e) => {
  if (['positions', 'cibles', 'devise', 'discret', 'formatNombre'].some((k) => k in e.detail)) dessinerReequilibrage();
});
