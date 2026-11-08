// Assistant IA intégré : un chat qui connaît le portefeuille (valeurs, variations, indices, devises)
// et les explications du site, pour répondre aux questions de Michel en français.
//
// Fournisseur : Google Gemini, palier gratuit (aucune carte de crédit, donc aucun frais possible).
// Il faut une clé gratuite (aistudio.google.com/apikey) entrée une fois, dans l'assistant ou dans Paramètres.
// La clé est gardée seulement sur l'appareil (localStorage) : elle n'est jamais dans le code ni sur GitHub.
//
// Confidentialité : on envoie la question et un résumé chiffré du portefeuille, sans nom ni information personnelle.
import { parametres } from './parametres.js';
import { chargerPrix, serieSymbole, seriePortefeuille, valeurActuelle } from './donnees.js';
import { TITRES, INDICES, TAUX_USDCAD } from './config.js';
import { resumeRisque } from './risque.js';
import { calculerRevenu } from './revenu.js';
import { calculerGains } from './gains.js';
import { COMPTES } from './config.js';

export const CLE_GEMINI = 'mg-ia-cle-gemini';
const CLE_CONVERSATION = 'mg-ia-conversation';
// « gemini-flash-latest » suit le modèle Flash le plus récent; repli sur une version fixe si l'alias disparaît.
const MODELES = ['gemini-flash-latest', 'gemini-2.5-flash'];
const URL_CLE = 'https://aistudio.google.com/apikey';
const DELAI_MAX = 60000;

const SUGGESTIONS = [
  'Quels sont les plus gros risques de mon portefeuille ?',
  'Résume ma journée en bourse',
  'Quel titre a le plus aidé ou nui ce mois-ci ?',
  'Mon portefeuille fait-il mieux que le S&P 500 cette année ?',
  'Pourquoi l’or monte quand il y a des tensions ?',
  'Qu’est-ce que la situation à Ormuz change pour Suncor et Cenovus ?',
  'Explique-moi le risque Chine–Taïwan pour mes titres'
];

// ---------- Outils ----------

const lireStockage = (cle, defaut) => { try { return localStorage.getItem(cle) ?? defaut; } catch { return defaut; } };
export const cleGemini = () => lireStockage(CLE_GEMINI, '');
export function enregistrerCleGemini(cle) {
  try { cle ? localStorage.setItem(CLE_GEMINI, cle.trim()) : localStorage.removeItem(CLE_GEMINI); } catch { /* navigation privée */ }
}

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

const r1 = (v) => (v == null || !isFinite(v) ? 'n.d.' : (v >= 0 ? '+' : '') + v.toFixed(1) + ' %');
const r2 = (v) => (v == null || !isFinite(v) ? 'n.d.' : v.toLocaleString('fr-CA', { maximumFractionDigits: 2 }));

/** Variation en % d'une série sur une période (premier point → dernier). */
function variationPeriode(serie) {
  if (!serie || serie.erreur || !serie.points?.length) return null;
  const fin = serie.points[serie.points.length - 1].v;
  return serie.base ? (fin / serie.base - 1) * 100 : null;
}

// ---------- Contexte envoyé à l'IA ----------

/** Texte compact décrivant le portefeuille et le marché, recalculé à chaque question (données à jour). */
async function contexte() {
  const p = parametres();
  const d = await chargerPrix();
  const l = [];
  const maintenant = new Date().toLocaleString('fr-CA', { timeZone: 'America/Toronto', dateStyle: 'full', timeStyle: 'short' });
  l.push(`Date et heure (Montréal) : ${maintenant}.`);
  if (d.etat !== 'ok') {
    l.push('Les prix détaillés ne sont pas disponibles pour le moment : ' + (d.message || '') );
  } else {
    l.push(`Prix mis à jour : ${d.genere.toLocaleString('fr-CA', { timeZone: 'America/Toronto' })}. Devise d'affichage : ${p.devise}.`);
    if (p.positionsExemple) l.push('ATTENTION : les quantités sont des EXEMPLES (pas encore les vraies). Les montants en $ sont donc illustratifs; les % par titre restent exacts.');
    const act = valeurActuelle(d, p.positions, p.devise);
    if (act) {
      const perf = (per) => r1(variationPeriode(seriePortefeuille(d, p.positions, per, p.devise)));
      l.push(`\nPORTEFEUILLE : valeur ${r2(act.total)} ${p.devise}; aujourd'hui ${r1(act.variationPct)} (${r2(act.variation)} ${p.devise}); 1 mois ${perf('1M')}; depuis le 1er janvier ${perf('AAJ')}; 1 an ${perf('1A')}.`);
      l.push('Positions (titre : quantité, valeur, poids, variation du jour) :');
      for (const x of [...act.details].sort((a, b) => b.valeur - a.valeur)) {
        const t = TITRES[x.symbole] || { nom: x.symbole, unite: '' };
        l.push(`- ${t.nom} : ${r2(x.quantite)} ${t.unite}, ${r2(x.valeur)} ${p.devise}, ${r1((x.valeur / act.total) * 100).replace('+', '')}, jour ${r1(x.varPct)}`);
      }
    }
    l.push('\nTITRES SUIVIS (prix en $ US; variations 1 jour / 1 mois / 3 mois / depuis le 1er janv. / 1 an) :');
    for (const [s, t] of Object.entries(TITRES)) {
      const e = d.symboles[s];
      if (!e || e.erreur) continue;
      const v = (per) => r1(variationPeriode(serieSymbole(d, s, per)));
      l.push(`- ${t.nom} (${t.tv}) : ${r2(e.dernier)} $ US${e.estime ? ' (estimé via un fonds)' : ''}; ${v('1J')} / ${v('1M')} / ${v('3M')} / ${v('AAJ')} / ${v('1A')}`);
    }
    l.push('\nINDICES DE RÉFÉRENCE (mêmes périodes) :');
    for (const ix of INDICES) {
      if (TITRES[ix.id] || !d.symboles[ix.id] || d.symboles[ix.id].erreur) continue;
      const v = (per) => r1(variationPeriode(serieSymbole(d, ix.id, per)));
      l.push(`- ${ix.nom} (${ix.via}) : ${v('1J')} / ${v('1M')} / ${v('3M')} / ${v('AAJ')} / ${v('1A')}`);
    }
    const fx = d.symboles[TAUX_USDCAD];
    if (fx && !fx.erreur) l.push(`\nDOLLAR : 1 $ US = ${r2(fx.dernier)} $ CA (1 mois ${r1(variationPeriode(serieSymbole(d, TAUX_USDCAD, '1M')))}).`);
  }

  if (d.etat === 'ok') {
    l.push('\n' + await resumeRisque());
    const rev = calculerRevenu(d, p);
    if (rev?.lignes.length) l.push(`DIVIDENDES : revenu annuel estimé ${r2(rev.annuel)} ${p.devise} (rendement ${r1(rev.rendement * 100).replace('+', '')}); ` + rev.lignes.map((x) => `${TITRES[x.symbole]?.court || x.symbole} ${r2(x.annuel)}`).join(', ') + '.');
    const g = calculerGains(d, p);
    if (g?.lignes.length) l.push(`GAINS DEPUIS L'ACHAT : ${r2(g.gain)} ${p.devise} au total; ` + g.lignes.map((x) => `${TITRES[x.symbole]?.court || x.symbole} ${r1(x.gainPct)} (${COMPTES[x.compte]})`).join(', ') + '.');
    const comptes = [...new Set(p.positions.map((x) => COMPTES[x.compte || 'non-enregistre']))];
    l.push(`Comptes utilisés : ${comptes.join(', ')}.`);
  }

  // Données relevées à la main (data.js)
  const D = window.DATA || {};
  if (D.ormuzPeriodes) l.push(`\nDÉTROIT D'ORMUZ (navires, observé vs normal) : ${D.ormuzPeriodes.map((o) => `${o.libelle} ${o.observe} vs ${o.normal}`).join('; ')}.`);
  if (D.exportateurs) l.push(`EXPORTATEURS DE PÉTROLE 2025 (milliers de barils/jour) : ${D.exportateurs.slice(0, 10).map(([n, v]) => `${n} ${v}`).join(', ')}.`);

  // Explications écrites du site (pourquoi), pour que l'IA parle dans le même sens que les sections.
  for (const id of ['actions', 'metaux', 'taiwan', 'ormuz', 'petrole', 'devises']) {
    const sec = document.getElementById(id);
    if (!sec) continue;
    const txt = [...sec.querySelectorAll('h2, h3, p, li')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');
    l.push(`\nSECTION « ${id} » DU SITE : ${txt.slice(0, 1600)}`);
  }
  return l.join('\n');
}

function consignes(ctx) {
  return `Tu es l'assistant intégré au site « Portefeuille de ${parametres().prenom || 'Michel'} », un investisseur québécois retraité.
Réponds TOUJOURS en français du Québec, clair et chaleureux, en tutoyant. Sois concis : 3 à 8 phrases ou une courte liste, sauf si on demande plus.
Appuie-toi d'abord sur les DONNÉES ci-dessous (chiffres réels du site) et cite les chiffres utiles. N'invente jamais un chiffre absent : dis plutôt que tu ne l'as pas.
Pour l'actualité récente que tu ne connais pas, dis-le simplement.
Explique le « pourquoi » en mots simples, sans jargon (ou explique le jargon).
Tu n'es pas un conseiller financier : ne dis jamais d'acheter ou de vendre un titre précis. Tu peux expliquer les risques, la diversification et les scénarios possibles, et suggérer d'en parler à son conseiller pour une décision.
Pas de tableaux larges : le site est souvent lu sur téléphone.

DONNÉES DU SITE :
${ctx}`;
}

// ---------- Appels aux fournisseurs ----------

class ErreurIA extends Error { constructor(msg, code) { super(msg); this.code = code; } }

async function appel(url, options) {
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), DELAI_MAX);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } catch (e) {
    throw new ErreurIA(e.name === 'AbortError' ? 'L’IA a mis trop de temps à répondre. Réessaie dans un instant.' : 'Impossible de joindre l’IA. Vérifie la connexion Internet.', 'reseau');
  } finally { clearTimeout(minuteur); }
}

async function demanderGemini(cle, systeme, historique, i = 0) {
  const rep = await appel(`https://generativelanguage.googleapis.com/v1beta/models/${MODELES[i]}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cle },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systeme }] },
      contents: historique.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { temperature: 0.5, maxOutputTokens: 4096 }
    })
  });
  if (rep.status === 404 && i + 1 < MODELES.length) return demanderGemini(cle, systeme, historique, i + 1);
  const d = await rep.json().catch(() => null);
  if (!rep.ok) {
    const raison = d?.error?.details?.find((x) => x.reason)?.reason || d?.error?.status || '';
    if (/API_KEY|PERMISSION|UNAUTHENTICATED/i.test(raison) || rep.status === 401 || rep.status === 403)
      throw new ErreurIA('La clé Gemini est refusée. Vérifie-la dans ⚙️ Paramètres › Assistant IA (copie-la au complet).', 'cle');
    if (rep.status === 429) throw new ErreurIA('Limite gratuite de Gemini atteinte pour le moment. Attends une minute (ou jusqu’à demain si c’était beaucoup de questions), puis réessaie.', 'limite');
    throw new ErreurIA('Gemini ne répond pas pour le moment (erreur ' + rep.status + '). Réessaie dans un instant.', 'serveur');
  }
  const cand = d?.candidates?.[0];
  const texte = cand?.content?.parts?.filter((x) => !x.thought).map((x) => x.text || '').join('').trim();
  if (!texte) throw new ErreurIA(cand?.finishReason === 'SAFETY' ? 'Gemini a refusé de répondre à cette question. Reformule-la.' : 'Réponse vide de Gemini. Reformule ta question.', 'vide');
  return texte;
}

/** Envoie la conversation à Gemini avec le contexte à jour du site. */
async function repondre(historique) {
  const cle = cleGemini();
  if (!cle) throw new ErreurIA('Il faut d’abord entrer une clé Gemini gratuite.', 'sans-cle');
  const systeme = consignes(await contexte());
  return { texte: await demanderGemini(cle, systeme, historique.slice(-10)), source: 'Gemini (Google)' };
}

// ---------- Affichage du texte (mini-Markdown, sans HTML injecté) ----------

/** Gras **…** et code `…` à l'intérieur d'une ligne, construits en nœuds DOM (aucun innerHTML). */
function enLigne(texte) {
  const frag = document.createDocumentFragment();
  for (const morceau of texte.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)) {
    if (!morceau) continue;
    if (/^\*\*.+\*\*$/.test(morceau)) frag.append(h('strong', {}, morceau.slice(2, -2)));
    else if (/^`.+`$/.test(morceau)) frag.append(h('code', {}, morceau.slice(1, -1)));
    else frag.append(morceau.replace(/(^|\s)\*(\S[^*]*)\*/g, '$1$2'));
  }
  return frag;
}

function rendre(texte) {
  const box = h('div', { class: 'ia-texte' });
  const lignes = texte.replace(/\r/g, '').split('\n');
  let liste = null, para = [];
  const viderPara = () => { if (para.length) { box.append(h('p', {}, enLigne(para.join(' ')))); para = []; } };
  for (let i = 0; i < lignes.length; i++) {
    const brut = lignes[i];
    const ligne = brut.trim();
    if (!ligne) { viderPara(); liste = null; continue; }
    // Tableau Markdown : affiché en lignes simples, plus lisibles sur téléphone.
    if (ligne.startsWith('|')) {
      viderPara(); liste = null;
      const rangees = [];
      while (i < lignes.length && lignes[i].trim().startsWith('|')) { rangees.push(lignes[i].trim()); i++; }
      i--;
      const cell = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const [tete, ...corps] = rangees.filter((r) => !/^\|?\s*:?-{2,}/.test(r)).map(cell);
      const ul = h('ul', { class: 'ia-tableau' });
      for (const r of corps) ul.append(h('li', {}, r.flatMap((c, j) => [j ? ' · ' : '', j && tete?.[j] ? tete[j] + ' : ' : '', enLigne(c)])));
      box.append(ul);
      continue;
    }
    const titre = ligne.match(/^#{1,6}\s+(.*)/);
    if (titre) { viderPara(); liste = null; box.append(h('p', { class: 'ia-titre' }, enLigne(titre[1]))); continue; }
    const puce = ligne.match(/^([-*•]|\d+[.)])\s+(.*)/);
    if (puce) {
      viderPara();
      const ordonnee = /\d/.test(puce[1]);
      if (!liste || (liste.tagName === 'OL') !== ordonnee) { liste = h(ordonnee ? 'ol' : 'ul'); box.append(liste); }
      liste.append(h('li', {}, enLigne(puce[2])));
      continue;
    }
    if (/^-{3,}$/.test(ligne)) { viderPara(); liste = null; continue; }
    liste = null;
    para.push(ligne);
  }
  viderPara();
  return box;
}

// ---------- Panneau de discussion ----------

let panneau, voile, fil, champ, envoyer, declencheur, enCours = false;
let conversation = (() => { try { return JSON.parse(sessionStorage.getItem(CLE_CONVERSATION) || '[]'); } catch { return []; } })();

function sauver() { try { sessionStorage.setItem(CLE_CONVERSATION, JSON.stringify(conversation.slice(-30))); } catch { /* sans gravité */ } }

function bulle(m) {
  if (m.role === 'user') return h('div', { class: 'ia-msg ia-moi' }, h('p', {}, m.content));
  return h('div', { class: 'ia-msg ia-elle' }, rendre(m.content),
    m.avis ? h('p', { class: 'ia-avis' }, m.avis) : null,
    m.source ? h('p', { class: 'ia-source' }, m.source) : null);
}

/** Carte d'installation : comment obtenir la clé gratuite, et un champ pour la coller. */
function carteCle(message) {
  const champCle = h('input', { type: 'password', id: 'ia-cle', autocomplete: 'off', spellcheck: 'false', placeholder: 'Colle la clé ici (commence par AIza…)' });
  const erreur = h('p', { class: 'small baisse', hidden: true });
  return h('div', { class: 'ia-msg ia-elle ia-cle' },
    h('p', { class: 'ia-titre' }, 'Activer l’IA (gratuit, une seule fois)'),
    message ? h('p', { class: 'small' }, message) : null,
    h('ol', {},
      h('li', {}, 'Ouvre ', h('a', { href: URL_CLE, target: '_blank', rel: 'noopener noreferrer' }, 'aistudio.google.com/apikey'), ' et connecte-toi avec un compte Google.'),
      h('li', {}, 'Appuie sur « Create API key » (Créer une clé), puis copie la clé.'),
      h('li', {}, 'Colle-la ci-dessous et appuie sur Enregistrer.')),
    h('form', { class: 'ia-form', onsubmit: (e) => {
      e.preventDefault();
      const v = champCle.value.trim();
      if (!/^[\w-]{20,}$/.test(v)) { erreur.textContent = 'Cette clé ne semble pas complète. Copie-la de nouveau.'; erreur.hidden = false; return; }
      enregistrerCleGemini(v); dessinerFil(); champ.focus();
    } }, h('label', { for: 'ia-cle', class: 'sr' }, 'Clé Gemini'), champCle, h('button', { type: 'submit', class: 'btn actif' }, 'Enregistrer')),
    erreur,
    h('p', { class: 'pr-note' }, 'Sans carte de crédit, le palier gratuit ne peut rien coûter. La clé reste seulement sur cet appareil.'));
}

function dessinerFil() {
  fil.replaceChildren();
  if (!cleGemini()) { fil.append(carteCle()); return; }
  if (!conversation.length) {
    fil.append(h('div', { class: 'ia-vide' },
      h('p', {}, `Bonjour ${parametres().prenom || ''} ! Pose-moi une question sur ton portefeuille, un titre, l’or, le pétrole ou l’actualité des marchés.`),
      h('div', { class: 'ia-suggestions' }, SUGGESTIONS.map((s) => h('button', { type: 'button', class: 'puce-btn', onclick: () => demander(s) }, s)))));
    return;
  }
  for (const m of conversation) fil.append(bulle(m));
  fil.scrollTop = fil.scrollHeight;
}

function construire() {
  voile = h('div', { class: 'pr-voile', hidden: true, onclick: fermerIA });
  fil = h('div', { class: 'ia-fil', 'aria-live': 'polite' });
  champ = h('textarea', { id: 'ia-champ', rows: '1', placeholder: 'Écris ta question…', 'aria-label': 'Ta question à l’IA', enterkeyhint: 'send',
    oninput: () => { champ.style.height = 'auto'; champ.style.height = Math.min(champ.scrollHeight, 140) + 'px'; },
    onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } } });
  envoyer = h('button', { type: 'submit', class: 'btn actif ia-envoyer' }, 'Envoyer');
  const form = h('form', { class: 'ia-form', onsubmit: (e) => { e.preventDefault(); demander(champ.value); } }, champ, envoyer);
  panneau = h('aside', { class: 'pr-panneau ia-panneau', id: 'assistant-ia', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ia-titre', hidden: true },
    h('div', { class: 'pr-tete' },
      h('h2', { id: 'ia-titre' }, '✨ Assistant IA'),
      h('div', { class: 'ia-tete-actions' },
        h('button', { type: 'button', class: 'btn btn-petit', onclick: () => { conversation = []; sauver(); dessinerFil(); champ.focus(); } }, 'Nouvelle conversation'),
        h('button', { type: 'button', class: 'btn-icone', 'aria-label': 'Fermer l’assistant', onclick: fermerIA }, '×'))),
    fil,
    h('div', { class: 'ia-bas' }, form,
      h('p', { class: 'pr-note' }, 'Gemini (gratuit) peut se tromper et ne remplace pas un conseiller. Ta question et un résumé chiffré du portefeuille (sans ton nom) sont envoyés à Google, qui peut s’en servir pour améliorer ses produits.')));
  document.body.append(voile, panneau);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panneau.hidden) fermerIA(); });
}

export function ouvrirIA() {
  if (!panneau) construire();
  dessinerFil();
  if (panneau.hidden) {
    declencheur = document.activeElement;
    voile.hidden = false; panneau.hidden = false;
    document.body.classList.add('sans-defilement');
    requestAnimationFrame(() => { panneau.classList.add('ouvert'); voile.classList.add('ouvert'); });
  }
  if (!matchMedia('(pointer: coarse)').matches) champ.focus(); // évite d'ouvrir le clavier d'office sur téléphone
}

export function fermerIA() {
  if (!panneau || panneau.hidden) return;
  panneau.classList.remove('ouvert'); voile.classList.remove('ouvert');
  document.body.classList.remove('sans-defilement');
  setTimeout(() => { panneau.hidden = true; voile.hidden = true; }, 220);
  declencheur?.focus?.();
}

/** Pose une question (depuis le champ, une suggestion ou un bouton « Expliquer » ailleurs sur le site). */
export async function demander(question) {
  const q = (question || '').trim();
  if (!q || enCours) return;
  ouvrirIA();
  enCours = true; envoyer.disabled = true; champ.value = ''; champ.style.height = 'auto';
  conversation.push({ role: 'user', content: q.slice(0, 2000) });
  sauver(); dessinerFil();
  const attente = h('div', { class: 'ia-msg ia-elle ia-attente' }, h('span', { class: 'ia-points', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), h('span', {}, 'Je regarde tes données et je réfléchis…'));
  fil.append(attente); fil.scrollTop = fil.scrollHeight;
  try {
    const r = await repondre(conversation.map(({ role, content }) => ({ role, content })));
    conversation.push({ role: 'assistant', content: r.texte, source: r.source, avis: r.avis });
  } catch (e) {
    conversation.pop(); sauver(); // la question pourra être renvoyée
    attente.remove();
    if (e.code === 'cle' || e.code === 'sans-cle') {
      if (e.code === 'cle') enregistrerCleGemini('');
      fil.append(carteCle(e.message)); fil.scrollTop = fil.scrollHeight; return;
    }
    fil.append(h('div', { class: 'ia-msg ia-erreur', role: 'alert' }, h('p', {}, e.message || 'Erreur inattendue.'),
      h('button', { type: 'button', class: 'btn btn-petit', onclick: () => demander(q) }, 'Réessayer')));
    fil.scrollTop = fil.scrollHeight;
    return;
  } finally { enCours = false; envoyer.disabled = false; }
  sauver(); dessinerFil();
}

/** Bouton flottant + liens « Demande à l'IA » + demandes venant des graphiques et de la recherche. */
export function initialiserIA() {
  const bouton = h('button', { type: 'button', class: 'ia-bouton', 'aria-label': 'Ouvrir l’assistant IA', onclick: ouvrirIA },
    h('span', { 'aria-hidden': 'true' }, '✨'), h('span', { class: 'ia-bouton-texte' }, 'Demande à l’IA'));
  document.body.append(bouton);
  document.querySelectorAll('[data-ouvrir-ia]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); ouvrirIA(); }));
  window.addEventListener('mg:demander-ia', (e) => demander(e.detail?.question));
}
