// Paramètres : lecture/sauvegarde (localStorage), application en direct (variables CSS sur <html>)
// et panneau latéral « Paramètres ». Chaque changement émet l'événement « mg:parametres ».
import { cleGemini, enregistrerCleGemini } from './ia.js';
import { DEFAUTS, THEMES, POLICES, TAILLES, PERIODES, INDICES, TITRES, POSITIONS_EXEMPLE, OUTILS, COMPTES, ajouterTitres, trouverTitre } from './config.js';
import { chargerPrix } from './donnees.js';
import { SUGGESTIONS, versSymbole } from './recherche.js';

const CLE = 'mg-parametres';
let etat = charger();
ajouterTitres(etat.titresPerso); // les titres ajoutés par Michel existent dès le départ

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
  etat = { ...structuredClone(DEFAUTS), positions, positionsExemple: etat.positionsExemple, surveillance: etat.surveillance, recherchesRecentes: etat.recherchesRecentes, titresPerso: etat.titresPerso };
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

/**
 * Ajoute un titre au portefeuille (quantité 0, à remplir) à partir d'un choix de recherche { nom, symbole }.
 * Un titre déjà connu (ex. « Google ») réutilise sa fiche; sinon une fiche perso est créée.
 * Renvoie l'identifiant du titre.
 */
export function ajouterAuPortefeuille(choix) {
  let id = trouverTitre(choix.symbole);
  let titresPerso = etat.titresPerso || [];
  if (!id) {
    id = choix.symbole.toUpperCase();
    const fiche = { id, nom: choix.nom === choix.symbole ? id.split(':').pop() : choix.nom, tv: id };
    titresPerso = [...titresPerso.filter((t) => t.id !== id), fiche];
    ajouterTitres([fiche]);
  }
  const positions = etat.positions.some((p) => p.symbole === id) ? etat.positions : [...etat.positions, { symbole: id, quantite: 0 }];
  modifier({ positions, titresPerso, positionsExemple: false });
  return id;
}

/** Texte prêt à envoyer pour demander l'ajout de titres au suivi automatique (historique + total). */
function demandeSuivi(titres) {
  return 'Salut ! Peux-tu ajouter au suivi automatique de mon site de portefeuille : '
    + titres.map((t) => `${t.nom} (${t.tv})`).join(', ') + ' ? Merci !';
}

async function partager(texte, bouton) {
  try {
    if (navigator.share) { await navigator.share({ text: texte }); return; }
    await navigator.clipboard.writeText(texte);
    bouton.textContent = '✓ Message copié : colle-le dans un texto';
  } catch { /* partage annulé */ }
}

function editeurPositions(focusId) {
  const box = h('div', { class: 'pr-positions' });
  let suivis = null; // symboles présents dans les données (null = pas encore chargé)
  chargerPrix().then((d) => { suivis = new Set(Object.keys(d.symboles || {}).filter((k) => !d.symboles[k].erreur)); dessiner(); });

  const dessiner = (focus) => {
    const enAttente = etat.positions.filter((p) => suivis && !suivis.has(p.symbole)).map((p) => TITRES[p.symbole] || { nom: p.symbole, tv: p.symbole });
    const champ = h('input', { type: 'search', id: 'pr-ajout', list: 'pr-ajout-liste', placeholder: 'Ex. Apple, Banque Royale, AAPL, RY.TO', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'done' });
    const erreur = h('p', { class: 'small baisse', hidden: true });
    const ajouter = (e) => {
      e.preventDefault();
      const t = champ.value.trim();
      const connu = Object.entries(TITRES).find(([, x]) => x.nom.toLowerCase() === t.toLowerCase());
      const choix = connu ? { nom: connu[1].nom, symbole: connu[0] } : versSymbole(t);
      if (!choix) { erreur.textContent = 'Titre introuvable. Essaie le nom (« Apple ») ou le symbole (« AAPL », « RY.TO »).'; erreur.hidden = false; return; }
      dessiner(ajouterAuPortefeuille(choix));
    };
    const noms = new Set([...Object.values(TITRES).map((t) => t.nom), ...SUGGESTIONS.map(([n]) => n)]);

    box.replaceChildren(...[
      etat.positionsExemple ? h('p', { class: 'pr-note alerte' }, 'Ce sont des quantités d’exemple. Entre les vraies pour que les montants soient exacts.') : null,
      h('ul', { class: 'pr-pos-liste' }, etat.positions.map((p, i) => {
        const t = TITRES[p.symbole] || { nom: p.symbole, tv: p.symbole, unite: 'actions' };
        const statut = !suivis ? null : suivis.has(p.symbole)
          ? null : h('span', { class: 'pr-badge', title: 'Prix en direct affiché; pas encore compté dans le total ni le calendrier' }, '⏳ pas encore dans le total');
        return h('li', { class: 'pr-pos' },
          h('div', { class: 'pr-pos-tete' },
            h('div', {}, h('strong', {}, t.nom), ' ', h('span', { class: 'tick' }, t.tv), statut ? [h('br'), statut] : null),
            h('button', { type: 'button', class: 'btn-icone', 'aria-label': 'Retirer ' + t.nom, onclick: () => retirer(i) }, '×')),
          h('div', { class: 'pr-pos-champs' },
            h('label', {}, h('span', {}, 'Quantité (' + (t.unite || 'actions') + ')'),
              h('input', { type: 'number', min: '0', step: 'any', inputmode: 'decimal', value: p.quantite || '', placeholder: '0', 'data-pos': p.symbole,
                onchange: (e) => maj(i, { quantite: Math.max(0, parseFloat(e.target.value) || 0) }) })),
            h('label', {}, h('span', {}, 'Prix moyen payé (par unité)'),
              h('input', { type: 'number', min: '0', step: 'any', inputmode: 'decimal', value: p.prixAchat || '', placeholder: 'facultatif',
                onchange: (e) => maj(i, { prixAchat: Math.max(0, parseFloat(e.target.value) || 0) || undefined }) })),
            h('label', {}, h('span', {}, 'Compte'),
              h('select', { onchange: (e) => maj(i, { compte: e.target.value }) },
                Object.entries(COMPTES).map(([k, n]) => h('option', { value: k, selected: k === (p.compte || 'non-enregistre') }, n)))),
            h('label', {}, h('span', {}, 'Prix payé en'),
              h('select', { onchange: (e) => maj(i, { deviseAchat: e.target.value }) },
                h('option', { value: 'USD', selected: (p.deviseAchat || 'USD') === 'USD' }, '$ US'),
                h('option', { value: 'CAD', selected: p.deviseAchat === 'CAD' }, '$ CA')))));
      })),
      h('form', { class: 'pr-ajout', onsubmit: ajouter },
        h('label', { for: 'pr-ajout' }, 'Ajouter une action, un fonds ou un métal'),
        h('div', { class: 'pr-ajout-ligne' }, champ, h('button', { type: 'submit', class: 'btn actif' }, 'Ajouter')),
        h('datalist', { id: 'pr-ajout-liste' }, [...noms].map((n) => h('option', { value: n }))),
        erreur),
      enAttente.length ? h('div', { class: 'pr-note alerte' },
        h('p', {}, `⏳ ${enAttente.map((t) => t.nom).join(', ')} : le prix en direct est affiché, mais pour l’historique, le calendrier et le total, le titre doit être ajouté au suivi automatique (une fois).`),
        h('button', { type: 'button', class: 'btn btn-petit', onclick: (e) => partager(demandeSuivi(enAttente), e.currentTarget) }, 'Envoyer la demande d’ajout')) : null,
      h('div', { class: 'pr-actions' },
        etat.positionsExemple ? h('button', { type: 'button', class: 'btn', onclick: () => { modifier({ positionsExemple: false }); dessiner(); } }, 'Ce sont mes vraies quantités') : null),
      h('p', { class: 'pr-note' }, 'Actions et parts : nombre détenu. Métaux : onces. Le prix moyen payé sert à calculer tes gains; entre-le en $ CA si ton relevé de courtier l’indique en $ CA (prix de base rajusté), c’est le plus exact pour l’impôt. Le compte sert à l’aperçu fiscal et aux dividendes. Sandisk se divise 8 pour 1 le 19 novembre 2026 : multiplie alors ta quantité par 8 et divise ton prix payé par 8.')
    ].filter(Boolean));
    const cible = focus && box.querySelector(`input[data-pos="${CSS.escape(focus)}"]`);
    if (cible) requestAnimationFrame(() => { cible.scrollIntoView({ block: 'center' }); cible.focus(); });
  };
  const maj = (i, ch) => { const pos = etat.positions.map((p, j) => (j === i ? { ...p, ...ch } : p)); modifier({ positions: pos, positionsExemple: false }); };
  const retirer = (i) => {
    const id = etat.positions[i].symbole;
    modifier({ positions: etat.positions.filter((_, j) => j !== i), titresPerso: (etat.titresPerso || []).filter((t) => t.id !== id), positionsExemple: false });
    dessiner();
  };
  dessiner(focusId);
  return box;
}

/** Clé Gemini gratuite. Gardée à part, seulement sur l'appareil, et jamais réaffichée. */
function reglagesIA() {
  const box = h('div', { class: 'pr-cases' });
  const dessiner = () => {
    const cle = cleGemini();
    const champCle = h('input', { type: 'password', id: 'pr-cle-gemini', autocomplete: 'off', spellcheck: 'false', placeholder: cle ? '•••••••• (déjà enregistrée)' : 'Colle ta clé ici' });
    box.replaceChildren(h('div', { class: 'pr-champ' },
      h('label', { for: 'pr-cle-gemini' }, 'Clé Google Gemini (gratuite)'),
      champCle,
      h('div', { class: 'pr-actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => { if (champCle.value.trim()) { enregistrerCleGemini(champCle.value); dessiner(); } } }, cle ? 'Remplacer' : 'Enregistrer'),
        cle ? h('button', { type: 'button', class: 'btn', onclick: () => { enregistrerCleGemini(''); dessiner(); } }, 'Effacer la clé') : null),
      h('p', { class: 'pr-note', 'aria-live': 'polite' }, cle ? '✓ Une clé est enregistrée sur cet appareil.' : 'Aucune clé : l’assistant IA est désactivé.'),
      h('p', { class: 'pr-note' }, 'Clé gratuite sur aistudio.google.com/apikey (compte Google, bouton « Create API key »). Elle reste seulement sur cet appareil.')));
  };
  dessiner();
  return box;
}

let focusPosition = null;

function contenu() {
  const m = (k) => (v) => { modifier({ [k]: v }); };
  return [
    h('section', {}, h('h3', {}, 'Personnalisation'),
      texte('pr-prenom', 'Prénom dans le message d’accueil', etat.prenom, 'Michel', m('prenom')),
      texte('pr-nom', 'Nom affiché dans le titre', etat.nomComplet, 'Michel Girard', m('nomComplet')),
      texte('pr-accueil', 'Message d’accueil personnalisé', etat.accueilPerso, 'Laisser vide pour « Bonjour / Bon après-midi / Bonsoir »', m('accueilPerso'))),
    h('section', { id: 'pr-positions' }, h('h3', {}, 'Mes positions'), editeurPositions(focusPosition)),
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
    h('section', {}, h('h3', {}, 'Assistant IA'), reglagesIA()),
    h('section', {}, h('h3', {}, 'Nombres et devise'),
      segments('devise', 'Devise du portefeuille', { CAD: 'Dollar canadien', USD: 'Dollar américain' }, etat.devise, m('devise')),
      segments('format', 'Format des nombres', { fr: '1 234,56 $', en: '$1,234.56' }, etat.formatNombre, m('formatNombre'))),
    h('section', {}, h('h3', {}, 'Alertes'),
      segments('alerte', 'M’avertir quand un titre bouge de plus de… dans la journée', { 3: '3 %', 5: '5 %', 8: '8 %', 10: '10 %', 0: 'Jamais' }, etat.alerteSeuil, (v) => modifier({ alerteSeuil: +v })),
      h('p', { class: 'pr-note' }, 'Les alertes s’affichent en haut du site à l’ouverture : gros mouvements, dividendes et événements à venir.')),
    h('div', { class: 'pr-bas' },
      h('button', { type: 'button', class: 'btn', onclick: () => { reinitialiser(); ouvrir(true); } }, 'Réinitialiser'),
      h('p', { class: 'pr-note' }, 'Les préférences sont gardées sur cet appareil. Réinitialiser garde tes positions, tes titres ajoutés et ta liste de surveillance.'))
  ];
}

function couleurAccentActuelle() {
  const c = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  return /^#[0-9a-f]{6}$/i.test(c) ? c : '#1f6b55';
}

let panneau, voile, declencheur;

/** Ouvre le panneau (ou le redessine s'il est déjà ouvert). */
export function ouvrir(redessiner = false, positionAFocus = null) {
  focusPosition = positionAFocus;
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
