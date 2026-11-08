// Gains depuis l'achat : pour chaque position dont le prix moyen payé est entré dans Paramètres.
// Calcul en $ US (prix actuel − prix payé) × quantité : l'effet du taux de change n'est pas inclus.
import { parametres, ouvrir } from './parametres.js';
import { chargerPrix, valeurActuelle } from './donnees.js';
import { TAUX_USDCAD } from './config.js';
import { argent, argentSigne, pct, sens } from './format.js';
import { TITRES } from './config.js';

const h = (tag, cls, texte) => { const e = document.createElement(tag); if (cls) e.className = cls; if (texte != null) e.textContent = texte; return e; };

export async function dessinerGains() {
  const el = document.getElementById('gains');
  if (!el) return;
  const p = parametres();
  const d = await chargerPrix();
  el.classList.remove('chargement');
  const act = d.etat === 'ok' ? valeurActuelle(d, p.positions, 'USD') : null;
  const prixPaye = new Map(p.positions.filter((x) => x.prixAchat > 0).map((x) => [x.symbole, x.prixAchat]));
  const lignes = (act?.details || []).filter((x) => prixPaye.has(x.symbole)).map((x) => {
    const cout = x.quantite * prixPaye.get(x.symbole);
    return { symbole: x.symbole, cout, gain: x.valeur - cout, gainPct: cout ? (x.valeur / cout - 1) * 100 : null };
  }).sort((a, b) => b.gain - a.gain);

  if (!lignes.length) {
    const b = h('button', 'btn btn-petit', 'Entrer mes prix payés');
    b.type = 'button';
    b.addEventListener('click', () => ouvrir(false, p.positions[0]?.symbole));
    el.replaceChildren(h('p', 'small', d.etat === 'ok'
      ? 'Entre le prix moyen payé de tes titres (⚙️ › Mes positions) pour voir combien chacun t’a rapporté depuis l’achat.'
      : d.message), d.etat === 'ok' ? b : '');
    return;
  }
  const cout = lignes.reduce((a, l) => a + l.cout, 0);
  const gain = lignes.reduce((a, l) => a + l.gain, 0);
  const total = h('p', 'contrib-total');
  total.append('Gain total : ', Object.assign(h('strong', sens(gain), `${argentSigne(gain, 'USD', 0)} (${pct(cout ? (gain / cout) * 100 : 0, 1)})`)));
  const liste = h('ul', 'gains-liste');
  for (const l of lignes) {
    const li = h('li');
    li.append(h('span', 'rep-nom', TITRES[l.symbole]?.court || l.symbole), h('span', 'small', 'payé ' + argent(l.cout, 'USD', 0)),
      h('span', sens(l.gain), argentSigne(l.gain, 'USD', 0)), h('span', sens(l.gain) + ' gains-pct', pct(l.gainPct, 1)));
    liste.append(li);
  }
  // Aperçu fiscal (compte non enregistré) : au Québec, 50 % du gain en capital est imposable,
  // au taux marginal le plus élevé (environ 53,3 %), soit environ 26,7 % du gain. Ordre de grandeur seulement.
  const TAUX_EFFECTIF = 0.5 * 0.5331;
  const usdcad = d.symboles[TAUX_USDCAD]?.dernier || 1.4;
  const gains = lignes.filter((l) => l.gain > 0), pertes = lignes.filter((l) => l.gain < 0);
  const gainNetCAD = Math.max(0, gain) * usdcad;
  const fisc = h('details', 'rq-details');
  fisc.append(h('summary', null, 'Aperçu fiscal (si tout était vendu aujourd’hui)'));
  const ul = h('ul', 'fisc-liste');
  const item = (t) => ul.append(h('li', null, t));
  item(`Gain net : ${argentSigne(gain, 'USD', 0)}, soit environ ${argentSigne(gain * usdcad, 'CAD', 0)} au taux du jour.`);
  item(gain > 0 ? `Impôt approximatif au taux marginal maximal du Québec : ${argent(gainNetCAD * TAUX_EFFECTIF, 'CAD', 0)} (50 % du gain imposable × environ 53,3 %).` : 'Pas d’impôt sur le gain net : le portefeuille est en perte sur ces titres.');
  if (pertes.length && gains.length) item(`Titres en perte (${pertes.map((l) => TITRES[l.symbole]?.court || l.symbole).join(', ')}) : vendre une perte peut réduire l’impôt sur d’autres gains (attention à la règle des 30 jours sur les pertes apparentes).`);
  item('Seulement pour un compte non enregistré (pas REER ni CELI). Le vrai prix de base se calcule en $ CA au taux de chaque achat : à valider avec ton comptable.');
  fisc.append(ul);
  el.replaceChildren(total, liste, h('p', 'small', `Sur ${lignes.length} titre${lignes.length > 1 ? 's' : ''} avec un prix payé. En $ US, sans l’effet du taux de change.`), fisc);
}

window.addEventListener('mg:parametres', (e) => { if ('positions' in e.detail || 'formatNombre' in e.detail || 'discret' in e.detail || 'devise' in e.detail) dessinerGains(); });
