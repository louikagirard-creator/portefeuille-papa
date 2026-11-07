// Paramètres : lecture/sauvegarde (localStorage), application en direct (variables CSS sur <html>)
// et panneau latéral « Paramètres ». Chaque changement émet l'événement « mg:parametres ».
import { DEFAUTS, THEMES, POLICES, TAILLES, PERIODES, INDICES, TITRES, POSITIONS_EXEMPLE, OUTILS } from './config.js';

const CLE = 'mg-parametres';
let etat = charger();

function charger() {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) || 'null');
    return brut ? { ...structuredClone(DEFAUTS), ...brut } : structuredClone(DEFAUTS);
  } catch { return structuredClone(DEFAUTS); }
}

/** Paramètres courants (lecture seule). */
export const parametres = () => etat;

/** Thème réellement affiché (« auto » suit l'appareil). */
export function themeEffectif() {
  if (etat.theme !== 'auto') return etat.theme;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'sombre' : 'clair';
}
export const estSombre = () => !!THEMES[themeEffectif()]?.sombre;

/** Modifie un ou plusieurs paramètres, sauvegarde, applique et prévient les composants. */
export function modifier(changements) {
  etat = { ...etat, ...changements };
  try { localStorage.setItem(CLE, JSON.stringify(etat)); } catch { /* navigation privée : on garde en mémoire */ }
  appliquer();
  // La liste de surveillance et les recherches récentes ne changent rien aux graphiques : pas de redessin.
  const listes = Object.keys(changements).length && Object.keys(changements).every((k) => k === 'surveillance' || k === 'recherchesRecentes');
  if (!listes) window.dispatchEvent(new CustomEvent('mg:parametres', { detail: changements }));
}

export function reinitialiser() {
  const positions = etat.positionsExemple ? POSITIONS_EXEMPLE : etat.positions; // on ne perd jamais les vraies positions
  etat = { ...structuredClone(DEFAUTS), positions, positionsExemple: etat.positionsExemple, surveillance: etat.surveillance, recherchesRecentes: etat.recherchesRecentes };
  modifier({});
}

/** Applique thème, accent, couleurs gains/pertes, police, taille et densité via des attributs et variables CSS. */
export function appliquer() {
  const r = document.documentElement;
  r.dataset.theme = themeEffectif();
  r.dataset.gp = etat.gainsPertes;
  r.dataset.densite = etat.densite;
  r.dataset.sombre = estSombre() ? '1' : '0';
  if (etat.accent) r.style.setProperty('--accent', etat.accent); else r.style.removeProperty('--accent');
  r.style.setProperty('--police', (POLICES[etat.police] || POLICES.plex).css);
  r.style.fontSize = (TAILLES[etat.taille] || 16) + 'px';
  r.style.colorScheme = estSombre() ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(r).getPropertyValue('--bg').trim();
}

// Le thème automatique suit l'appareil quand celui-ci change.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (etat.theme === 'auto') { appliquer(); window.dispatchEvent(new CustomEvent('mg:parametres', { detail: { theme: 'auto' } })); }
});

// ---------- Panneau ----------

const h = (tag, attrs = {}, ...enfants) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const e of enfants.flat()) if (e != null) el.append(e);
  return el;
};

function choix(id, label, options, valeur, onChange) {
  return h('label', { class: 'pr-champ', for: id }, h('span', {}, label),
    h('select', { id, onchange: (e) => onChange(e.target.value) },
      Object.entries(options).map(([v, nom]) => h('option', { value: v, selected: v === valeur }, nom))));
}

function segments(nom, label, options, valeur, onChange) {
  return h('fieldset', { class: 'pr-champ' }, h('legend', {}, label),
    h('div', { class: 'seg' }, Object.entries(options).map(([v, txt]) =>
      h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(v === String(valeur)), onclick: (e) => {
        e.currentTarget.parentElement.querySelectorAll('.seg-btn').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
        onChange(v);
      } }, txt))));
}

function interrupteur(id, label, valeur, onChange) {
  return h('label', { class: 'pr-champ pr-inline', for: id },
    h('input', { type: 'checkbox', id, checked: !!valeur, onchange: (e) => onChange(e.target.checked) }), h('span', {}, label));
}

function texte(id, label, valeur, placeholder, onChange) {
  return h('label', { class: 'pr-champ', for: id }, h('span', {}, label),
    h('input', { type: 'text', id, value: valeur || '', placeholder: placeholder || '', oninput: (e) => onChange(e.target.value) }));
}

function editeurPositions() {
  const box = h('div', { class: 'pr-positions' });
  const dessiner = () => {
    box.replaceChildren(
      etat.positionsExemple ? h('p', { class: 'pr-note alerte' }, 'Ce sont des quantités d’exemple. Entre les vraies pour que les montants soient exacts.') : null,
      h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Titre'), h('th', {}, 'Quantité'), h('th', {}, h('span', { class: 'sr' }, 'Retirer')))),
        h('tbody', {}, etat.positions.map((p, i) => h('tr', {},
          h('td', {}, h('select', { 'aria-label': 'Titre', onchange: (e) => maj(i, { symbole: e.target.value }) },
            Object.entries(TITRES).map(([s, t]) => h('option', { value: s, selected: s === p.symbole }, t.nom)))),
          h('td', {}, h('input', { type: 'number', min: '0', step: 'any', inputmode: 'decimal', value: p.quantite, 'aria-label': 'Quantité (' + (TITRES[p.symbole]?.unite || 'actions') + ')',
            onchange: (e) => maj(i, { quantite: Math.max(0, parseFloat(e.target.value) || 0) }) })),
          h('td', {}, h('button', { type: 'button', class: 'btn-icone', 'aria-label': 'Retirer ' + (TITRES[p.symbole]?.nom || p.symbole), onclick: () => retirer(i) }, '×'))
        )))),
      h('div', { class: 'pr-actions' },
        h('button', { type: 'button', class: 'btn', onclick: ajouter }, 'Ajouter un titre'),
        etat.positionsExemple ? h('button', { type: 'button', class: 'btn', onclick: () => { modifier({ positionsExemple: false }); dessiner(); } }, 'Ce sont mes vraies quantités') : null),
      h('p', { class: 'pr-note' }, 'Actions et parts : nombre détenu. Métaux : onces. Sandisk se divise 8 pour 1 le 19 novembre 2026 : multiplie alors ta quantité par 8.')
    );
  };
  const maj = (i, ch) => { const pos = etat.positions.map((p, j) => (j === i ? { ...p, ...ch } : p)); modifier({ positions: pos, positionsExemple: false }); dessiner(); };
  const retirer = (i) => { modifier({ positions: etat.positions.filter((_, j) => j !== i), positionsExemple: false }); dessiner(); };
  const ajouter = () => { const libre = Object.keys(TITRES).find((s) => !etat.positions.some((p) => p.symbole === s)) || 'GOOGL'; modifier({ positions: [...etat.positions, { symbole: libre, quantite: 0 }] }); dessiner(); };
  dessiner();
  return box;
}

function contenu() {
  const m = (k) => (v) => { modifier({ [k]: v }); };
  return [
    h('section', {}, h('h3', {}, 'Personnalisation'),
      texte('pr-prenom', 'Prénom dans le message d’accueil', etat.prenom, 'Michel', m('prenom')),
      texte('pr-nom', 'Nom affiché dans le titre', etat.nomComplet, 'Michel Girard', m('nomComplet')),
      texte('pr-accueil', 'Message d’accueil personnalisé', etat.accueilPerso, 'Laisser vide pour « Bonjour / Bon après-midi / Bonsoir »', m('accueilPerso'))),
    h('section', {}, h('h3', {}, 'Mes positions'), editeurPositions()),
    h('section', {}, h('h3', {}, 'Apparence'),
      choix('pr-theme', 'Thème', Object.fromEntries(Object.entries(THEMES).map(([k, t]) => [k, t.nom])), etat.theme, m('theme')),
      h('div', { class: 'pr-champ pr-inline' },
        h('input', { type: 'color', id: 'pr-accent', value: etat.accent || couleurAccentActuelle(), oninput: (e) => modifier({ accent: e.target.value }) }),
        h('label', { for: 'pr-accent' }, 'Couleur d’accent'),
        h('button', { type: 'button', class: 'btn btn-petit', onclick: () => { modifier({ accent: '' }); ouvrir(true); } }, 'Couleur du thème')),
      segments('gp', 'Couleurs des gains / pertes', { 'vert-rouge': 'Vert / rouge', 'bleu-orange': 'Bleu / orange' }, etat.gainsPertes, m('gainsPertes')),
      choix('pr-police', 'Police', Object.fromEntries(Object.entries(POLICES).map(([k, p]) => [k, p.nom])), etat.police, m('police')),
      segments('taille', 'Taille du texte', { petit: 'Petit', normal: 'Normal', grand: 'Grand', tresgrand: 'Très grand' }, etat.taille, m('taille')),
      segments('densite', 'Densité', { compact: 'Compact', confortable: 'Confortable' }, etat.densite, m('densite'))),
    h('section', {}, h('h3', {}, 'Graphiques'),
      segments('style', 'Style', { aire: 'Aire remplie', ligne: 'Ligne' }, etat.styleGraph, m('styleGraph')),
      segments('epaisseur', 'Épaisseur de la ligne', { 1: 'Fine', 2: 'Normale', 3: 'Épaisse' }, etat.epaisseur, (v) => modifier({ epaisseur: +v })),
      interrupteur('pr-grille', 'Afficher la grille', etat.grille, m('grille')),
      segments('periode', 'Période par défaut', Object.fromEntries(PERIODES.map((p) => [p, p])), etat.periode, m('periode')),
      h('fieldset', { class: 'pr-champ' }, h('legend', {}, 'Outils affichés par défaut'),
        h('div', { class: 'pr-cases' }, Object.entries(OUTILS).map(([k, o]) => h('label', { class: 'pr-inline' },
          h('input', { type: 'checkbox', checked: !!etat.outils?.[k], onchange: (e) => modifier({ outils: { ...etat.outils, [k]: e.target.checked } }) }),
          h('span', {}, o.nom + (o.quotidien ? ' (à partir de 1M)' : '')))))),
      h('fieldset', { class: 'pr-champ' }, h('legend', {}, 'Indices de comparaison favoris'),
        h('div', { class: 'pr-cases' }, INDICES.map((ix) => h('label', { class: 'pr-inline' },
          h('input', { type: 'checkbox', checked: etat.indicesFavoris.includes(ix.id),
            onchange: (e) => modifier({ indicesFavoris: e.target.checked ? [...etat.indicesFavoris, ix.id] : etat.indicesFavoris.filter((x) => x !== ix.id) }) }),
          h('span', {}, ix.nom)))))),
    h('section', {}, h('h3', {}, 'Nombres et devise'),
      segments('devise', 'Devise du portefeuille', { CAD: 'Dollar canadien', USD: 'Dollar américain' }, etat.devise, m('devise')),
      segments('format', 'Format des nombres', { fr: '1 234,56 $', en: '$1,234.56' }, etat.formatNombre, m('formatNombre'))),
    h('div', { class: 'pr-bas' },
      h('button', { type: 'button', class: 'btn', onclick: () => { reinitialiser(); ouvrir(true); } }, 'Réinitialiser'),
      h('p', { class: 'pr-note' }, 'Les préférences sont gardées sur cet appareil. Réinitialiser garde tes positions et ta liste de surveillance.'))
  ];
}

function couleurAccentActuelle() {
  const c = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  return /^#[0-9a-f]{6}$/i.test(c) ? c : '#1f6b55';
}

let panneau, voile, declencheur;

/** Ouvre le panneau (ou le redessine s'il est déjà ouvert). */
export function ouvrir(redessiner = false) {
  if (!panneau) {
    voile = h('div', { class: 'pr-voile', hidden: true, onclick: fermer });
    panneau = h('aside', { class: 'pr-panneau', id: 'parametres', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pr-titre', hidden: true });
    document.body.append(voile, panneau);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panneau.hidden) fermer(); });
  }
  const defile = redessiner ? panneau.querySelector('.pr-corps')?.scrollTop : 0;
  panneau.replaceChildren(
    h('div', { class: 'pr-tete' }, h('h2', { id: 'pr-titre' }, 'Paramètres'), h('button', { type: 'button', class: 'btn-icone', 'aria-label': 'Fermer les paramètres', onclick: fermer }, '×')),
    h('div', { class: 'pr-corps' }, contenu()));
  if (redessiner) panneau.querySelector('.pr-corps').scrollTop = defile;
  if (panneau.hidden) {
    declencheur = document.activeElement;
    voile.hidden = false; panneau.hidden = false;
    requestAnimationFrame(() => { panneau.classList.add('ouvert'); voile.classList.add('ouvert'); });
    panneau.querySelector('.pr-tete button').focus();
  }
}

export function fermer() {
  if (!panneau || panneau.hidden) return;
  panneau.classList.remove('ouvert'); voile.classList.remove('ouvert');
  setTimeout(() => { panneau.hidden = true; voile.hidden = true; }, 220);
  declencheur?.focus?.();
}
