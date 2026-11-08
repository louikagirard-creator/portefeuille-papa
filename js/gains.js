// Gains depuis l'achat et aperçu fiscal, pour chaque position dont le prix moyen payé est entré dans Paramètres.
// Le prix payé peut être en $ US ou en $ CA (prix de base rajusté du relevé de courtier, le plus exact).
// Un prix payé en $ US est converti au taux du jour : approximation, signalée dans la carte.
import { parametres, ouvrir } from './parametres.js';
import { chargerPrix, valeurActuelle, tauxConversion } from './donnees.js';
import { argent, argentSigne, pct, sens } from './format.js';
import { TITRES, COMPTES } from './config.js';

// Québec, taux marginal le plus élevé (environ 53,3 %), 50 % du gain en capital imposable.
const TAUX_GAIN_PARTICULIER = 0.5 * 0.533;

const h = (tag, cls, texte) => { const e = document.createElement(tag); if (cls) e.className = cls; if (texte != null) e.textContent = texte; return e; };

/** Gains par position (dans la devise d'affichage). Exporté pour l'assistant IA. */
export function calculerGains(d, p) {
  const act = d.etat === 'ok' ? valeurActuelle(d, p.positions, p.devise) : null;
  if (!act) return null;
  const pos = new Map(p.positions.map((x) => [x.symbole, x]));
  const lignes = act.details.filter((x) => pos.get(x.symbole)?.prixAchat > 0).map((x) => {
    const q = pos.get(x.symbole);
    const deviseAchat = q.deviseAchat || 'USD';
    const cout = x.quantite * q.prixAchat * (tauxConversion(d, deviseAchat, p.devise) ?? 1);
    return { symbole: x.symbole, compte: q.compte || 'non-enregistre', deviseAchat, valeur: x.valeur, cout, gain: x.valeur - cout, gainPct: cout ? (x.valeur / cout - 1) * 100 : null };
  }).sort((a, b) => b.gain - a.gain);
  return { lignes, cout: lignes.reduce((s, l) => s + l.cout, 0), gain: lignes.reduce((s, l) => s + l.gain, 0) };
}

export async function dessinerGains() {
  const el = document.getElementById('gains');
  if (!el) return;
  const p = parametres();
  const d = await chargerPrix();
  el.classList.remove('chargement');
  const g = calculerGains(d, p);

  if (!g || !g.lignes.length) {
    const b = h('button', 'btn btn-petit', 'Entrer mes prix payés');
    b.type = 'button';
    b.addEventListener('click', () => ouvrir(false, p.positions[0]?.symbole));
    el.replaceChildren(h('p', 'small', d.etat === 'ok'
      ? 'Entre le prix moyen payé de tes titres (⚙️ › Mes positions) pour voir combien chacun t’a rapporté depuis l’achat, et l’impôt à prévoir.'
      : d.message), d.etat === 'ok' ? b : '');
    return;
  }
  const dev = p.devise;
  const total = h('p', 'contrib-total');
  total.append('Gain total : ', h('strong', sens(g.gain), `${argentSigne(g.gain, dev, 0)} (${pct(g.cout ? (g.gain / g.cout) * 100 : 0, 1)})`));
  const liste = h('ul', 'gains-liste');
  for (const l of g.lignes) {
    const li = h('li');
    li.append(h('span', 'rep-nom', TITRES[l.symbole]?.court || l.symbole), h('span', 'small', COMPTES[l.compte] || ''),
      h('span', sens(l.gain), argentSigne(l.gain, dev, 0)), h('span', sens(l.gain) + ' gains-pct', pct(l.gainPct, 1)));
    liste.append(li);
  }
  const enUSD = g.lignes.some((l) => l.deviseAchat === 'USD');

  // ---- Aperçu fiscal par type de compte ----
  const parCompte = {};
  for (const l of g.lignes) (parCompte[l.compte] ??= []).push(l);
  const fisc = h('details', 'rq-details');
  fisc.append(h('summary', null, 'Aperçu fiscal (si tout était vendu aujourd’hui)'));
  const ul = h('ul', 'fisc-liste');
  const item = (t) => ul.append(h('li', null, t));
  const ne = parCompte['non-enregistre'] || [];
  if (ne.length) {
    const net = ne.reduce((s, l) => s + l.gain, 0);
    item(net > 0
      ? `Non enregistré : gain net ${argentSigne(net, dev, 0)}, impôt approximatif ${argent(net * TAUX_GAIN_PARTICULIER, dev, 0)} (50 % du gain imposable au taux marginal maximal du Québec, environ 53,3 %).`
      : `Non enregistré : perte nette de ${argent(-net, dev, 0)}, qui peut réduire l’impôt sur d’autres gains en capital (de l’année, des 3 années passées ou futures).`);
    const pertes = ne.filter((l) => l.gain < 0);
    if (pertes.length && net > 0) item(`Titres en perte dans ce compte (${pertes.map((l) => TITRES[l.symbole]?.court || l.symbole).join(', ')}) : les vendre réduirait l’impôt sur les gains. Attention à la règle des pertes apparentes (rachat dans les 30 jours).`);
  }
  if (parCompte.reer) item(`REER / FERR : aucun impôt sur les gains à la vente; les retraits sont imposés comme un revenu ordinaire (${argentSigne(parCompte.reer.reduce((s, l) => s + l.gain, 0), dev, 0)} de gain).`);
  if (parCompte.celi) item(`CELI : gains de ${argentSigne(parCompte.celi.reduce((s, l) => s + l.gain, 0), dev, 0)} à l’abri de l’impôt. Une perte dans un CELI ne peut pas être déduite.`);
  if (parCompte.societe) item(`Société de gestion : gain de ${argentSigne(parCompte.societe.reduce((s, l) => s + l.gain, 0), dev, 0)}. La moitié non imposable peut sortir de la société sans impôt (compte de dividendes en capital); le reste suit l’imposition des revenus de placement. À planifier avec le comptable.`);
  item(enUSD
    ? 'Les prix payés entrés en $ US sont convertis au taux du jour : l’impôt réel se calcule au taux de chaque achat. Entre le prix de base en $ CA de ton relevé pour plus de précision.'
    : 'Calcul basé sur les prix de base en $ CA entrés. Ordre de grandeur seulement : à valider avec ton comptable.');
  fisc.append(ul);

  el.replaceChildren(total, liste, h('p', 'small', `Sur ${g.lignes.length} titre${g.lignes.length > 1 ? 's' : ''} avec un prix payé, en ${dev === 'CAD' ? 'dollars canadiens' : 'dollars US'}.`), fisc);
}

window.addEventListener('mg:parametres', (e) => {
  if (['positions', 'formatNombre', 'discret', 'devise'].some((k) => k in e.detail)) dessinerGains();
});
