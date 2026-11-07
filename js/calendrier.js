// Calendrier mensuel de la valeur du portefeuille (lundi à dimanche).
// Chaque jour de bourse : valeur à la fermeture et variation du jour. Fins de semaine et congés : « Marché fermé ».
// Aujourd'hui : valeur « à ce jour ». Jours futurs : vides. Clic sur un jour : détail de chaque titre.
import { parametres } from './parametres.js';
import { chargerPrix, valeursQuotidiennes, valeurActuelle, aujourdhui } from './donnees.js';
import { argent, argentCompact, argentSigne, pct, sens, nombre, moisAnnee, dateLongue } from './format.js';
import { TITRES } from './config.js';

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const iso = (a, m, j) => `${a}-${String(m + 1).padStart(2, '0')}-${String(j).padStart(2, '0')}`;

export class Calendrier {
  constructor(el) {
    this.el = el;
    const [a, m] = aujourdhui().split('-').map(Number);
    this.annee = a; this.mois = m - 1;
    this.selection = null;
    this.cache = null; // { cle, quot, actuel } : recalculé seulement si positions ou devise changent
    this.construire();
    window.addEventListener('mg:parametres', (e) => {
      if ('positions' in e.detail || 'devise' in e.detail) this.cache = null;
      this.dessiner();
    });
    this.dessiner();
  }

  construire() {
    this.el.innerHTML = `
      <div class="cal-tete">
        <div class="cal-nav">
          <button type="button" class="btn-icone" data-nav="-1" aria-label="Mois précédent">‹</button>
          <h3 class="cal-titre" aria-live="polite">—</h3>
          <button type="button" class="btn-icone" data-nav="1" aria-label="Mois suivant">›</button>
        </div>
        <button type="button" class="btn btn-petit" data-auj>Aujourd’hui</button>
      </div>
      <div class="cal-resume"></div>
      <div class="cal-etat" hidden></div>
      <div class="cal-grille" role="grid" aria-label="Valeur du portefeuille par jour">
        ${JOURS.map((j) => `<div class="cal-jsem" role="columnheader">${j}</div>`).join('')}
      </div>
      <div class="cal-detail" hidden></div>`;
    this.$ = (s) => this.el.querySelector(s);
    this.el.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => {
      this.mois += +b.dataset.nav;
      if (this.mois < 0) { this.mois = 11; this.annee--; }
      if (this.mois > 11) { this.mois = 0; this.annee++; }
      this.selection = null;
      this.dessiner();
    }));
    this.$('[data-auj]').addEventListener('click', () => {
      const [a, m] = aujourdhui().split('-').map(Number);
      this.annee = a; this.mois = m - 1; this.selection = aujourdhui();
      this.dessiner();
    });
  }

  async calculs(donnees) {
    const p = parametres();
    const cle = JSON.stringify([p.positions, p.devise]);
    if (!this.cache || this.cache.cle !== cle) {
      this.cache = { cle, quot: valeursQuotidiennes(donnees, p.positions, p.devise), actuel: valeurActuelle(donnees, p.positions, p.devise) };
    }
    return this.cache;
  }

  async dessiner() {
    this.$('.cal-titre').textContent = moisAnnee(this.annee, this.mois);
    const grille = this.$('.cal-grille');
    grille.querySelectorAll('.cal-jour').forEach((c) => c.remove());
    grille.classList.add('chargement');
    const donnees = await chargerPrix();
    grille.classList.remove('chargement');
    const etat = this.$('.cal-etat');
    const p = parametres();

    let quot = new Map(), actuel = null;
    if (donnees.etat === 'ok') ({ quot, actuel } = await this.calculs(donnees));
    etat.hidden = donnees.etat === 'ok' && quot.size > 0;
    etat.textContent = donnees.etat !== 'ok' ? donnees.message : 'Aucune donnée : ajoute tes positions dans Paramètres.';

    const auj = aujourdhui();
    const dates = [...quot.keys()];
    const premiere = dates[0];
    const derniere = dates[dates.length - 1];
    const nbJours = new Date(Date.UTC(this.annee, this.mois + 1, 0)).getUTCDate();
    const decalage = (new Date(Date.UTC(this.annee, this.mois, 1)).getUTCDay() + 6) % 7; // lundi = 0

    // Variation du jour = fermeture du jour vs fermeture du jour de bourse précédent.
    const precedent = (d) => { let r = null; for (const x of dates) { if (x >= d) break; r = x; } return r; };

    for (let i = 0; i < decalage; i++) grille.append(Object.assign(document.createElement('div'), { className: 'cal-jour vide', role: 'gridcell' }));

    for (let j = 1; j <= nbJours; j++) {
      const d = iso(this.annee, this.mois, j);
      const sem = (decalage + j - 1) % 7;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cal-jour';
      cell.setAttribute('role', 'gridcell');
      const num = `<span class="cal-num">${j}</span>`;
      const estAuj = d === auj;
      if (estAuj) cell.classList.add('auj');

      let info = null;
      if (d > auj) {
        cell.classList.add('futur'); cell.disabled = true; cell.innerHTML = num;
      } else if (estAuj && actuel && actuel.session === d) {
        info = { total: actuel.total, varAbs: actuel.variation, varPct: actuel.variationPct, live: true };
      } else if (quot.has(d)) {
        const v = quot.get(d), pr = precedent(d);
        const vp = pr ? quot.get(pr).total : null;
        info = { total: v.total, varAbs: vp != null ? v.total - vp : null, varPct: vp ? (v.total / vp - 1) * 100 : null };
      } else if (sem >= 5 || (premiere && d >= premiere && d < derniere)) {
        // Fin de semaine, ou jour de semaine sans aucune fermeture entre deux jours de bourse : congé boursier.
        cell.classList.add('ferme'); cell.disabled = true;
        const ferme = '<span class="cal-ferme"><span class="plein">Marché fermé</span><span class="court">Fermé</span></span>';
        cell.innerHTML = num + ferme;
        cell.setAttribute('aria-label', `${dateLongue(d)} : marché fermé`);
      } else {
        cell.classList.add('sans'); cell.disabled = true; cell.innerHTML = `${num}<span class="cal-ferme">—</span>`;
      }

      if (info) {
        cell.classList.add('ouvert', sens(info.varAbs));
        cell.innerHTML = `${num}
          <span class="cal-val"><span class="plein">${argent(info.total, p.devise, 0)}</span><span class="court">${argentCompact(info.total, p.devise)}</span></span>
          <span class="cal-var ${sens(info.varAbs)}"><span class="plein">${argentSigne(info.varAbs, p.devise, 0)}</span> <span class="cal-pct">${pct(info.varPct, 1)}</span></span>
          ${info.live ? '<span class="cal-live">à ce jour</span>' : ''}`;
        cell.setAttribute('aria-label', `${dateLongue(d)} : ${argent(info.total, p.devise)}, ${pct(info.varPct)}${info.live ? ', à ce jour' : ''}`);
        cell.setAttribute('aria-pressed', String(this.selection === d));
        cell.addEventListener('click', () => { this.selection = d; this.marquer(); this.detail(d, donnees); });
      }
      cell.dataset.date = d;
      grille.append(cell);
    }

    this.resume(quot, actuel, auj);
    if (this.selection && this.selection.startsWith(iso(this.annee, this.mois, 1).slice(0, 7))) this.detail(this.selection, donnees);
    else this.$('.cal-detail').hidden = true;
  }

  marquer() {
    this.el.querySelectorAll('.cal-jour.ouvert').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.date === this.selection)));
  }

  /** Résumé du mois : valeur au début (fermeture du mois précédent), valeur actuelle ou de fin de mois, gain/perte. */
  resume(quot, actuel, auj) {
    const p = parametres();
    const box = this.$('.cal-resume');
    const debutMois = iso(this.annee, this.mois, 1), finMois = iso(this.annee, this.mois, 31);
    const dates = [...quot.keys()];
    const avant = dates.filter((d) => d < debutMois).pop() ?? dates.find((d) => d >= debutMois);
    let finDate = dates.filter((d) => d <= finMois && d >= debutMois).pop();
    let finVal = finDate ? quot.get(finDate).total : null;
    const enCours = auj >= debutMois && auj <= finMois;
    if (enCours && actuel) { finVal = actuel.total; finDate = auj; }
    if (!avant || finVal == null) { box.innerHTML = '<p class="small">Pas de données pour ce mois.</p>'; return; }
    const debutVal = quot.get(avant).total;
    const diff = finVal - debutVal, diffPct = (finVal / debutVal - 1) * 100;
    box.innerHTML = `
      <div class="cal-res"><span class="lab">Début du mois</span><strong>${argent(debutVal, p.devise, 0)}</strong></div>
      <div class="cal-res"><span class="lab">${enCours ? 'À ce jour' : 'Fin du mois'}</span><strong>${argent(finVal, p.devise, 0)}</strong></div>
      <div class="cal-res"><span class="lab">${diff >= 0 ? 'Gain' : 'Perte'} du mois</span><strong class="${sens(diff)}">${argentSigne(diff, p.devise, 0)} <small>(${pct(diffPct)})</small></strong></div>`;
  }

  /** Détail du jour cliqué : chaque titre avec quantité, prix de fermeture, valeur et variation. */
  detail(d, donnees) {
    const p = parametres();
    const box = this.$('.cal-detail');
    const { quot, actuel } = this.cache || {};
    const jour = d === aujourdhui() && actuel && actuel.session === d ? actuel : quot?.get(d);
    if (!jour) { box.hidden = true; return; }
    box.hidden = false;
    const lignes = [...jour.details].sort((a, b) => b.valeur - a.valeur).map((x) => {
      const t = TITRES[x.symbole] || {};
      return `<tr>
        <th scope="row"><span class="sym">${x.symbole.replace('/USD', '')}</span> <span class="small">${t.court || ''}</span></th>
        <td>${nombre(x.quantite, x.quantite % 1 ? 2 : 0)} <span class="small">${t.unite || ''}</span></td>
        <td>${argent(x.prix, 'USD')}</td>
        <td>${argent(x.valeur, p.devise)}</td>
        <td class="${sens(x.varPct)}">${pct(x.varPct)}</td></tr>`;
    }).join('');
    box.innerHTML = `
      <div class="cal-detail-tete"><h4>${dateLongue(d)}${d === aujourdhui() ? ' · à ce jour' : ''}</h4>
        <button type="button" class="btn-icone" aria-label="Fermer le détail">×</button></div>
      <div class="table-defile"><table class="tableau">
        <thead><tr><th scope="col">Titre</th><th scope="col">Quantité</th><th scope="col">Prix ${d === aujourdhui() ? 'actuel' : 'de fermeture'}</th><th scope="col">Valeur (${p.devise})</th><th scope="col">Variation</th></tr></thead>
        <tbody>${lignes}</tbody>
        <tfoot><tr><th scope="row">Total</th><td></td><td></td><td><strong>${argent(jour.total, p.devise)}</strong></td><td></td></tr></tfoot>
      </table></div>`;
    box.querySelector('.btn-icone').addEventListener('click', () => { this.selection = null; this.marquer(); box.hidden = true; });
    if (window.matchMedia('(max-width: 700px)').matches) box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}
