// Cartes des titres ajoutés par Michel (section « Ses actions ») : un graphique complet si le titre est
// dans le suivi automatique, sinon le prix en direct de TradingView avec une note.
import { parametres } from './parametres.js';
import { TITRES } from './config.js';
import { creerGraphique } from './graphique.js';

/** Titres du portefeuille qui n'ont pas de carte écrite à la main dans index.html. */
function titresSansCarte() {
  const fixes = new Set([...document.querySelectorAll('article:not([data-perso]) [data-graph]')].map((el) => el.dataset.graph));
  return parametres().positions.map((p) => p.symbole).filter((s) => TITRES[s] && !fixes.has(s));
}

export function dessinerTitresPerso() {
  const grille = document.querySelector('#actions .grid');
  if (!grille) return;
  const voulus = new Set(titresSansCarte());
  // Retire les cartes des titres enlevés du portefeuille.
  grille.querySelectorAll('article[data-perso]').forEach((c) => { if (!voulus.has(c.dataset.perso)) c.remove(); });
  for (const s of voulus) {
    if (grille.querySelector(`article[data-perso="${CSS.escape(s)}"]`)) continue;
    const t = TITRES[s];
    const carte = document.createElement('article');
    carte.className = 'card';
    carte.dataset.perso = s;
    const tete = document.createElement('div'); tete.className = 'head';
    const h3 = document.createElement('h3'); h3.textContent = t.nom;
    const tick = document.createElement('span'); tick.className = 'tick'; tick.textContent = t.tv + ' · ajouté par toi';
    tete.append(h3, tick);
    const graph = document.createElement('div'); graph.dataset.graph = s;
    carte.append(tete, graph);
    grille.append(carte);
    creerGraphique(graph);
  }
}

window.addEventListener('mg:parametres', (e) => { if ('positions' in e.detail || 'titresPerso' in e.detail) dessinerTitresPerso(); });
