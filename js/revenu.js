// Revenu de dividendes : revenu annuel estimé (dernier dividende × versements par année × quantité),
// rendement du portefeuille, prochains versements et remarques fiscales selon le compte.
// Sources : API Nasdaq (actions américaines, via le robot) et evenements.json (titres canadiens, fonds).
import { parametres } from './parametres.js';
import { chargerPrix, valeurActuelle, tauxConversion, msDate } from './donnees.js';
import { argent, pct, dateCourte } from './format.js';
import { TITRES } from './config.js';

const h = (tag, cls, texte) => { const e = document.createElement(tag); if (cls) e.className = cls; if (texte != null) e.textContent = texte; return e; };

/** Revenu annuel par position, dans la devise d'affichage. Exporté pour les alertes et l'IA. */
export function calculerRevenu(d, p) {
  const act = d.etat === 'ok' ? valeurActuelle(d, p.positions, p.devise) : null;
  if (!act) return null;
  const pos = new Map(p.positions.map((x) => [x.symbole, x]));
  const lignes = [];
  for (const x of act.details) {
    const div = d.dividendes?.[x.symbole];
    if (!div?.montant) continue;
    const taux = tauxConversion(d, div.devise || 'USD', p.devise) ?? 1;
    const annuel = x.quantite * div.montant * (div.parAn || 4) * taux;
    lignes.push({ symbole: x.symbole, compte: pos.get(x.symbole)?.compte || 'non-enregistre', div, annuel,
      versement: x.quantite * div.montant * taux, rendement: x.valeur ? annuel / x.valeur : 0 });
  }
  lignes.sort((a, b) => b.annuel - a.annuel);
  const annuel = lignes.reduce((s, l) => s + l.annuel, 0);
  return { lignes, annuel, rendement: act.total ? annuel / act.total : 0, total: act.total };
}

/** Versements à venir (date de paiement ≥ aujourd'hui), triés par date. */
export function prochainsVersements(r) {
  const auj = new Date().toISOString().slice(0, 10);
  return (r?.lignes || []).filter((l) => l.div.prochain?.datePaiement >= auj)
    .map((l) => ({ ...l, date: l.div.prochain.datePaiement, registre: l.div.prochain.dateRegistre }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export async function dessinerRevenu() {
  const el = document.getElementById('revenu');
  if (!el) return;
  const p = parametres();
  const d = await chargerPrix();
  el.classList.remove('chargement');
  const r = calculerRevenu(d, p);
  if (!r) { el.replaceChildren(h('p', 'small', d.etat === 'ok' ? 'Ajoute tes positions dans Paramètres.' : d.message)); return; }
  if (!r.lignes.length) { el.replaceChildren(h('p', 'small', 'Aucun des titres détenus ne verse de dividende pour le moment (ou les données de dividendes ne sont pas encore publiées par le robot).')); return; }
  const dev = p.devise;
  const nom = (s) => TITRES[s]?.court || s;

  const tete = h('div', 'rev-tete');
  const t1 = h('div', 'rev-chiffre');
  tete.append(t1);
  t1.append(h('span', 'small', 'Revenu annuel estimé'), h('strong', null, argent(r.annuel, dev, 0)), h('span', 'small', `${argent(r.annuel / 12, dev, 0)} par mois en moyenne`));
  const t2 = h('div', 'rev-chiffre');
  t2.append(h('span', 'small', 'Rendement du portefeuille'), h('strong', null, pct(r.rendement * 100, 2).replace('+', '')), h('span', 'small', 'S&P 500 : environ 1,2 %'));
  tete.append(t2);

  const liste = h('ul', 'gains-liste');
  for (const l of r.lignes) {
    const li = h('li');
    li.append(h('span', 'rep-nom', nom(l.symbole) + (l.div.approximatif ? ' *' : '')),
      h('span', 'small', `${l.div.montant.toLocaleString('fr-CA')} ${l.div.devise === 'CAD' ? '$ CA' : '$ US'} × ${l.div.parAn}/an`),
      h('span', null, argent(l.annuel, dev, 0)), h('span', 'gains-pct', pct(l.rendement * 100, 1).replace('+', '')));
    liste.append(li);
  }

  const prochains = prochainsVersements(r);
  const blocProchains = h('div', 'rev-prochains');
  if (prochains.length) {
    blocProchains.append(h('p', 'gr-menu-titre', 'Prochains versements'));
    const ul = h('ul', 'fisc-liste');
    for (const v of prochains) ul.append(h('li', null, `${dateCourte(msDate(v.date))} — ${nom(v.symbole)} : environ ${argent(v.versement, dev, 0)}` + (v.registre ? ` (il faut détenir le titre au ${dateCourte(msDate(v.registre))})` : '')));
    blocProchains.append(ul);
  }

  // Remarques fiscales selon les comptes et l'origine des dividendes
  const notes = [];
  const americains = (l) => (l.div.devise || 'USD') === 'USD';
  if (r.lignes.some((l) => americains(l) && l.compte === 'celi')) notes.push('Dividendes américains dans un CELI : 15 % sont retenus par les États-Unis et ne sont pas récupérables. Mieux vaut les garder dans le REER (aucune retenue) ou en non enregistré (retenue récupérable en crédit d’impôt).');
  if (r.lignes.some((l) => americains(l) && l.compte === 'non-enregistre')) notes.push('Dividendes américains en non enregistré : 15 % retenus à la source, récupérés comme crédit pour impôt étranger dans ta déclaration.');
  const canadiens = r.lignes.filter((l) => !americains(l) && l.compte === 'non-enregistre');
  if (canadiens.length) notes.push(`Dividendes canadiens (${canadiens.map((l) => nom(l.symbole)).join(', ')}) en non enregistré : ce sont des dividendes « déterminés », imposés moins lourdement grâce au crédit d’impôt pour dividendes.`);
  const blocNotes = h('div');
  if (notes.length) { const ul = h('ul', 'fisc-liste'); notes.forEach((n) => ul.append(h('li', null, n))); blocNotes.append(ul); }

  el.replaceChildren(tete, liste, blocProchains, blocNotes,
    h('p', 'small', 'Estimation : dernier dividende annoncé × nombre de versements par année. Les sociétés peuvent changer leur dividende.' + (r.lignes.some((l) => l.div.approximatif) ? ' * Montant approximatif (distribution annuelle variable).' : '')));
}

window.addEventListener('mg:parametres', (e) => {
  if (['positions', 'formatNombre', 'discret', 'devise'].some((k) => k in e.detail)) dessinerRevenu();
});
