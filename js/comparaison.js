// Comparaison avec des indices : suggestions selon le contenu du portefeuille,
// séries en rendement % (base 0 % au début de la période) et tableau des écarts.
import { INDICES, TITRES } from './config.js';
import { repartition, serieSymbole } from './donnees.js';
import { pct, sens, nombre } from './format.js';

/**
 * Indices triés du plus semblable au moins semblable.
 * Surtout canadien → TSX d'abord; surtout techno → Nasdaq d'abord; beaucoup de métaux → Or; etc.
 * Pour un titre seul : son pays et son secteur décident.
 */
export function indicesSuggeres(donnees, positions, symbole) {
  let pays = {}, secteur = {};
  if (symbole) {
    const t = TITRES[symbole] || {};
    pays = { [t.pays]: 1 }; secteur = { [t.secteur]: 1 };
  } else {
    ({ pays, secteur } = repartition(donnees, positions, TITRES));
  }
  const score = {
    EWC: (pays.CA || 0) * 1.2 + (secteur.energie || 0) * 0.6,
    QQQ: (secteur.techno || 0) * 1.2,
    SPY: 0.35 + (pays.US || 0) * 0.5,
    DIA: 0.2 + (pays.US || 0) * 0.3,
    EWT: (pays.TW || 0) * 1.5 + (secteur.techno || 0) * 0.3,
    'XAU/USD': (secteur.metaux || 0) * 1.3
  };
  const tries = [...INDICES].filter((ix) => ix.id !== symbole).sort((a, b) => (score[b.id] || 0) - (score[a.id] || 0));
  return { suggeres: tries.slice(0, 2), autres: tries.slice(2) };
}

/** Série d'un indice en rendement % depuis le début de la période. */
export function serieIndice(donnees, id, periode) {
  const s = serieSymbole(donnees, id, periode);
  if (s.erreur || !s.points.length || !s.base) return { erreur: s.erreur || 'Pas de données' };
  return { points: s.points.map((p) => ({ t: p.t, v: (p.v / s.base - 1) * 100 })), final: (s.points[s.points.length - 1].v / s.base - 1) * 100 };
}

/** Tableau sous le graphique : rendement de chaque courbe et écart avec la courbe principale. */
export function tableauComparaison(conteneur, principal, indices) {
  conteneur.replaceChildren();
  const ligne = document.createElement('div');
  ligne.className = 'cmp-ligne';
  const item = (nom, v, ecart) => {
    const d = document.createElement('div');
    d.className = 'cmp-item';
    const n = document.createElement('span'); n.className = 'cmp-nom'; n.textContent = nom;
    const val = document.createElement('strong'); val.className = 'cmp-val ' + sens(v); val.textContent = pct(v, 1);
    d.append(n, val);
    if (ecart != null) {
      const e = document.createElement('span'); e.className = 'cmp-ecart ' + sens(ecart);
      e.textContent = 'écart ' + (ecart >= 0 ? '+' : '−') + nombre(Math.abs(ecart), 1) + ' pts';
      e.title = 'Différence entre ' + principal.nom + ' et ' + nom + ', en points de pourcentage';
      d.append(e);
    }
    return d;
  };
  ligne.append(item(principal.nom, principal.final, null));
  for (const ix of indices) {
    if (ix.erreur) {
      const d = document.createElement('div'); d.className = 'cmp-item'; d.textContent = ix.nom + ' : indisponible (' + ix.erreur + ')';
      ligne.append(d);
    } else ligne.append(item(ix.nom, ix.final, principal.final - ix.final));
  }
  conteneur.append(ligne);
}
