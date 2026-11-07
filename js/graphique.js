// Composant graphique : boutons de période (1J | 1S | 1M | 1A), infobulle, variation de la période
// et option « Comparer » (superposition d'indices en rendement %).
// Sert au portefeuille total (symbole = null) et à chaque titre (symbole = « GOOGL », etc.).
import { parametres } from './parametres.js';
import { chargerPrix, serieSymbole, seriePortefeuille } from './donnees.js';
import { indicesSuggeres, serieIndice, tableauComparaison } from './comparaison.js';
import { argent, argentSigne, pct, sens, dateHeure, dateCourte, heure, jourMois } from './format.js';
import { PERIODES, TITRES, INDICES } from './config.js';

const LIBELLE_PERIODE = { '1J': 'aujourd’hui', '1S': 'sur 7 jours', '1M': 'sur 30 jours', '1A': 'sur 12 mois' };
const NOM_PERIODE = { '1J': '1 jour', '1S': '1 semaine', '1M': '1 mois', '1A': '1 an' };
let compteur = 0;

const css = (nom) => getComputedStyle(document.documentElement).getPropertyValue(nom).trim();

/** Dernière valeur dont t ≤ cible (points triés). Sert à aligner un indice sur l'axe du graphique. */
function valeurA(points, t) {
  let lo = 0, hi = points.length - 1, res = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (points[m].t <= t) { res = points[m].v; lo = m + 1; } else hi = m - 1; }
  return res;
}

export class Graphique {
  /**
   * @param {HTMLElement} el conteneur
   * @param {{symbole?: string|null, nom: string, repliTV?: string}} opts
   */
  constructor(el, { symbole = null, nom, repliTV = null }) {
    this.el = el;
    this.symbole = symbole;
    this.nom = nom;
    this.repliTV = repliTV;
    this.periode = parametres().periode;
    this.comparer = false;
    this.indices = new Set(parametres().indicesFavoris);
    this.chart = null;
    this.id = 'gr' + (++compteur);
    this.construire();
    window.addEventListener('mg:parametres', (e) => {
      if ('periode' in e.detail) { this.periode = parametres().periode; this.majBoutons(); }
      if ('indicesFavoris' in e.detail && !this.comparer) this.indices = new Set(parametres().indicesFavoris);
      this.dessiner();
    });
    this.dessiner();
  }

  construire() {
    this.el.classList.add('gr');
    this.el.innerHTML = `
      <div class="gr-tete">
        <div class="gr-chiffres" aria-live="polite">
          <span class="gr-valeur">—</span>
          <span class="gr-variation">—</span>
        </div>
        <div class="gr-ctrl">
          <div class="seg" role="group" aria-label="Période du graphique">
            ${PERIODES.map((p) => `<button type="button" class="seg-btn" data-p="${p}" aria-label="${NOM_PERIODE[p]}">${p}</button>`).join('')}
          </div>
          <button type="button" class="btn btn-comp" aria-expanded="false" aria-controls="${this.id}-menu">Comparer</button>
        </div>
      </div>
      <div class="gr-menu" id="${this.id}-menu" hidden></div>
      <div class="gr-zone"><canvas role="img" aria-label="Graphique de ${this.nom}"></canvas><div class="gr-etat" hidden></div></div>
      <div class="gr-cmp" hidden></div>`;
    this.$ = (s) => this.el.querySelector(s);
    this.el.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { this.periode = b.dataset.p; this.majBoutons(); this.dessiner(); }));
    this.$('.btn-comp').addEventListener('click', () => this.basculerComparaison());
    this.majBoutons();
  }

  majBoutons() {
    this.el.querySelectorAll('[data-p]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.p === this.periode)));
    const c = this.$('.btn-comp');
    c.setAttribute('aria-expanded', String(this.comparer));
    c.classList.toggle('actif', this.comparer);
    c.textContent = this.comparer ? 'Comparer ✓' : 'Comparer';
  }

  async basculerComparaison() {
    this.comparer = !this.comparer;
    if (this.comparer && !this.indices.size) this.indices = new Set(parametres().indicesFavoris);
    this.majBoutons();
    await this.dessinerMenu();
    this.dessiner();
  }

  async dessinerMenu() {
    const menu = this.$('.gr-menu');
    menu.hidden = !this.comparer;
    if (!this.comparer) return;
    const donnees = await chargerPrix();
    if (donnees.etat !== 'ok') { menu.textContent = 'Comparaison indisponible pour le moment.'; return; }
    const { suggeres, autres } = indicesSuggeres(donnees, parametres().positions, this.symbole);
    const groupe = (titre, liste) => `
      <p class="gr-menu-titre">${titre}</p>
      <div class="gr-menu-cases">${liste.map((ix) => `
        <label class="puce"><input type="checkbox" value="${ix.id}" ${this.indices.has(ix.id) ? 'checked' : ''}>
          <span>${ix.nom} <small>${ix.via}</small></span></label>`).join('')}
      </div>`;
    menu.innerHTML = groupe(this.symbole ? 'Suggérés pour ce titre' : 'Suggérés pour ce portefeuille', suggeres) + groupe('Autres indices', autres);
    menu.querySelectorAll('input').forEach((i) => i.addEventListener('change', () => {
      if (i.checked) this.indices.add(i.value); else this.indices.delete(i.value);
      this.dessiner();
    }));
  }

  etat(message, type = 'info') {
    const e = this.$('.gr-etat');
    e.hidden = !message;
    e.className = 'gr-etat ' + type;
    e.textContent = message || '';
  }

  async dessiner() {
    const zone = this.$('.gr-zone');
    zone.classList.add('chargement');
    const donnees = await chargerPrix();
    zone.classList.remove('chargement');
    const p = parametres();
    const devise = this.symbole ? 'USD' : p.devise;

    // Panne générale : le graphique du portefeuille l'explique; les titres montrent simplement le widget en direct.
    if (donnees.etat !== 'ok') return this.repli(this.symbole ? null : donnees.message);
    const serie = this.symbole ? serieSymbole(donnees, this.symbole, this.periode) : seriePortefeuille(donnees, p.positions, this.periode, devise);
    if (serie.erreur || !serie.points?.length) return this.repli(this.symbole ? `${this.nom} : ${serie.erreur || 'aucune donnée pour cette période'}.` : (serie.erreur || 'Aucune donnée pour cette période.'));
    this.etat(null);
    this.$('canvas').hidden = false;

    const pts = serie.points;
    const base = serie.base || pts[0].v;
    const fin = pts[pts.length - 1].v;
    const varAbs = fin - base, varPct = (fin / base - 1) * 100;

    // En-tête : valeur et variation de la période
    this.$('.gr-valeur').textContent = argent(fin, devise);
    const v = this.$('.gr-variation');
    v.className = 'gr-variation ' + sens(varAbs);
    v.textContent = `${argentSigne(varAbs, devise)} (${pct(varPct)}) ${LIBELLE_PERIODE[this.periode]}`;

    // Axe x par index (pas de trous la nuit et les fins de semaine), étiquettes tirées des dates.
    const temps = pts.map((q) => q.t);
    const etiquette = (i, long) => {
      const t = temps[Math.round(i)];
      if (t == null) return '';
      if (this.periode === '1J') return long ? dateHeure(t) : heure(t);
      if (this.periode === '1S') return long ? dateHeure(t) : jourMois(t);
      return long ? dateCourte(t) : jourMois(t, this.periode === '1A');
    };

    const accent = css('--accent'), grille = css('--line'), texte = css('--muted');
    const palette = [css('--serie-1'), css('--serie-2'), css('--serie-3'), css('--serie-4'), css('--serie-5'), css('--serie-6')];
    const enPct = this.comparer && this.indices.size > 0;
    const nomPrincipal = this.symbole ? this.nom : `Portefeuille de ${p.prenom || 'Michel'}`;

    const principal = {
      label: nomPrincipal,
      data: pts.map((q, i) => ({ x: i, y: enPct ? (q.v / base - 1) * 100 : q.v })),
      borderColor: accent,
      borderWidth: p.epaisseur + (enPct ? 0.5 : 0),
      pointRadius: 0, pointHoverRadius: 4, pointHitRadius: 8, tension: 0,
      fill: p.styleGraph === 'aire' && !enPct ? 'start' : false,
      backgroundColor: (ctx) => {
        const { chart } = ctx; const a = chart.chartArea;
        if (!a) return 'transparent';
        const g = chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
        g.addColorStop(0, accent + '55'); g.addColorStop(1, accent + '00');
        return g;
      }
    };
    const datasets = [principal];
    const lignesIndices = [];
    if (enPct) {
      let k = 0;
      for (const id of this.indices) {
        const ix = serieIndice(donnees, id, this.periode);
        const meta = INDICES.find((x) => x.id === id);
        const nom = meta ? meta.nom : id;
        if (ix.erreur) { lignesIndices.push({ nom, erreur: ix.erreur }); continue; }
        const couleur = palette[k++ % palette.length];
        datasets.push({ label: nom, data: temps.map((t, i) => ({ x: i, y: valeurA(ix.points, t) ?? (i === 0 ? 0 : null) })),
          borderColor: couleur, backgroundColor: couleur, borderWidth: Math.max(1.5, p.epaisseur - 0.5), pointRadius: 0, pointHoverRadius: 3, tension: 0, spanGaps: true });
        lignesIndices.push({ nom, final: ix.final });
      }
    }

    // Tableau des écarts
    const cmp = this.$('.gr-cmp');
    cmp.hidden = !enPct;
    if (enPct) tableauComparaison(cmp, { nom: nomPrincipal, final: varPct }, lignesIndices);

    const options = {
      responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 6, right: 4 } },
      scales: {
        x: { type: 'linear', min: 0, max: pts.length - 1, grid: { display: p.grille, color: grille }, border: { color: grille },
          ticks: { color: texte, maxTicksLimit: 5, maxRotation: 0, callback: (val) => etiquette(val, false) } },
        y: { grid: { display: p.grille, color: grille }, border: { display: false },
          ticks: { color: texte, maxTicksLimit: 5, callback: (val) => (enPct ? pct(val, 0) : argent(val, devise, Math.abs(val) >= 100 ? 0 : 2)) } }
      },
      plugins: {
        legend: { display: enPct, position: 'bottom', labels: { color: css('--fg'), boxWidth: 12, boxHeight: 3, usePointStyle: false } },
        tooltip: {
          backgroundColor: css('--panel'), titleColor: texte, bodyColor: css('--fg'), borderColor: grille, borderWidth: 1, padding: 10,
          displayColors: enPct,
          callbacks: {
            title: (items) => etiquette(items[0].parsed.x, true),
            label: (item) => {
              if (enPct) return ` ${item.dataset.label} : ${pct(item.parsed.y)}`;
              const val = item.parsed.y;
              return [` ${argent(val, devise)}`, ` ${argentSigne(val - base, devise)} (${pct((val / base - 1) * 100)}) depuis le début`];
            }
          }
        }
      }
    };

    if (this.chart) this.chart.destroy();
    this.chart = new window.Chart(this.$('canvas'), { type: 'line', data: { datasets }, options });
    if (donnees.avis && !this.symbole) this.etat(donnees.avis, 'avis');
  }

  /** Données indisponibles : message clair et, pour un titre, le widget TradingView en direct à la place. */
  repli(message) {
    if (this.chart) { this.chart.destroy(); this.chart = null; }
    this.$('.gr-valeur').textContent = '—';
    this.$('.gr-variation').textContent = '';
    this.$('.gr-cmp').hidden = true;
    this.etat(message, 'erreur');
    if (this.repliTV && window.MG_widget) {
      this.$('.gr-zone').classList.add('repli');
      this.$('canvas').hidden = true;
      const z = this.$('.gr-zone');
      let tv = z.querySelector('.tv');
      if (!tv) { tv = document.createElement('div'); tv.className = 'tv'; z.prepend(tv); window.MG_widget(tv, this.repliTV); }
      this.el.querySelector('.gr-tete').hidden = true;
      this.$('.gr-etat').classList.add('discret');
    }
  }
}

/** Crée un graphique dans chaque élément [data-graph] de la page. */
export function initialiserGraphiques() {
  document.querySelectorAll('[data-graph]').forEach((el) => {
    const symbole = el.dataset.graph === 'portefeuille' ? null : el.dataset.graph;
    new Graphique(el, { symbole, nom: symbole ? (TITRES[symbole]?.nom || symbole) : 'Portefeuille', repliTV: symbole ? TITRES[symbole]?.tv : null });
  });
}
