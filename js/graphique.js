// Composant graphique du portefeuille (symbole = null) et de chaque titre (symbole = « GOOGL », etc.) :
// - périodes 1J | 1S | 1M | 3M | 6M | AAJ | 1A | 2A, variation de la période au-dessus;
// - infobulle avec ligne verticale qui suit le doigt ou la souris;
// - outils : haut / bas de la période, niveau de départ, moyennes mobiles 20 et 50 jours;
// - statistiques (début, fin, haut, bas) et bouton « Agrandir » (plein écran);
// - option « Comparer » : indices superposés en rendement %, avec tableau des écarts.
import { parametres } from './parametres.js';
import { chargerPrix, serieSymbole, seriePortefeuille, positionsValides, moyenneMobile, isoDate, msDate } from './donnees.js';
import { indicesSuggeres, serieIndice, tableauComparaison } from './comparaison.js';
import { argent, argentSigne, pct, sens, dateHeure, dateCourte, heure, jourMois } from './format.js';
import { PERIODES, TITRES, INDICES, OUTILS } from './config.js';

const LIBELLE_PERIODE = { '1J': 'aujourd’hui', '1S': 'sur 7 jours', '1M': 'sur 30 jours', '3M': 'sur 3 mois', '6M': 'sur 6 mois', 'AAJ': 'depuis le 1er janvier', '1A': 'sur 12 mois', '2A': 'sur 2 ans' };
const NOM_PERIODE = { '1J': '1 jour', '1S': '1 semaine', '1M': '1 mois', '3M': '3 mois', '6M': '6 mois', 'AAJ': 'depuis le 1er janvier', '1A': '1 an', '2A': '2 ans' };
const INTRAJOUR = new Set(['1J', '1S']);
let compteur = 0;

const css = (nom) => getComputedStyle(document.documentElement).getPropertyValue(nom).trim();

/** Dernière valeur dont t ≤ cible (points triés). Sert à aligner un indice sur l'axe du graphique. */
function valeurA(points, t) {
  let lo = 0, hi = points.length - 1, res = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (points[m].t <= t) { res = points[m].v; lo = m + 1; } else hi = m - 1; }
  return res;
}

/** Couleur hexadécimale + transparence (« #1f6b55 » → « #1f6b5555 »). */
const alpha = (hex, a) => (/^#[0-9a-f]{6}$/i.test(hex) ? hex + a : hex);

// Extension Chart.js (dessin seulement, aucune dépendance) : ligne verticale au point survolé,
// pastilles haut / bas et ligne pointillée du niveau de départ.
const extension = {
  id: 'mgOutils',
  afterDatasetsDraw(chart, _args, o) {
    const { ctx, chartArea: a, scales: { x, y } } = chart;
    if (!a) return;
    ctx.save();
    if (o.depart != null) {
      const py = y.getPixelForValue(o.depart);
      if (py >= a.top && py <= a.bottom) {
        ctx.setLineDash([4, 4]); ctx.strokeStyle = o.couleurTexte; ctx.globalAlpha = 0.7; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(a.left, py); ctx.lineTo(a.right, py); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
    }
    if (o.extremes) {
      ctx.font = `600 11px ${o.police}`;
      for (const e of o.extremes) {
        const px = x.getPixelForValue(e.i), py = y.getPixelForValue(e.v);
        ctx.fillStyle = e.couleur; ctx.strokeStyle = o.fond; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        const w = ctx.measureText(e.texte).width;
        let tx = Math.min(Math.max(px - w / 2, a.left), a.right - w);
        const ty = e.haut ? Math.max(py - 9, a.top + 10) : Math.min(py + 17, a.bottom - 3);
        ctx.fillStyle = o.fond; ctx.globalAlpha = 0.85; ctx.fillRect(tx - 3, ty - 11, w + 6, 14); ctx.globalAlpha = 1;
        ctx.fillStyle = e.couleur; ctx.fillText(e.texte, tx, ty);
      }
    }
    const actif = chart.tooltip?.getActiveElements?.()[0];
    if (actif) {
      const px = actif.element.x;
      ctx.strokeStyle = o.couleurTexte; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, a.top); ctx.lineTo(px, a.bottom); ctx.stroke();
    }
    ctx.restore();
  }
};

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
    this.outils = { ...parametres().outils };
    this.chart = null;
    this.id = 'gr' + (++compteur);
    this.construire();
    window.addEventListener('mg:parametres', (e) => {
      if ('periode' in e.detail) { this.periode = parametres().periode; this.majBoutons(); }
      if ('outils' in e.detail) { this.outils = { ...parametres().outils }; this.majBoutons(); }
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
        <button type="button" class="btn-icone gr-agrandir" aria-label="Agrandir le graphique" title="Agrandir">⤢</button>
      </div>
      <div class="gr-ctrl">
        <div class="seg seg-defile" role="group" aria-label="Période du graphique">
          ${PERIODES.map((p) => `<button type="button" class="seg-btn" data-p="${p}" aria-label="${NOM_PERIODE[p]}">${p}</button>`).join('')}
        </div>
      </div>
      <div class="gr-outils" role="group" aria-label="Outils du graphique">
        ${Object.entries(OUTILS).map(([k, o]) => `<button type="button" class="puce-btn" data-outil="${k}">${o.nom}</button>`).join('')}
        <button type="button" class="puce-btn btn-comp" aria-expanded="false" aria-controls="${this.id}-menu">Comparer</button>
      </div>
      <div class="gr-menu" id="${this.id}-menu" hidden></div>
      <div class="gr-zone"><canvas role="img" aria-label="Graphique de ${this.nom}"></canvas><div class="gr-etat" hidden></div></div>
      <p class="gr-notes small" hidden></p>
      <dl class="gr-stats" hidden></dl>
      <div class="gr-cmp" hidden></div>`;
    this.$ = (s) => this.el.querySelector(s);
    this.el.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { this.periode = b.dataset.p; this.majBoutons(); this.dessiner(); }));
    this.el.querySelectorAll('[data-outil]').forEach((b) => b.addEventListener('click', () => {
      this.outils[b.dataset.outil] = !this.outils[b.dataset.outil];
      this.majBoutons(); this.dessiner();
    }));
    this.$('.btn-comp').addEventListener('click', () => this.basculerComparaison());
    this.$('.gr-agrandir').addEventListener('click', () => this.basculerPleinEcran());
    this.majBoutons();
  }

  majBoutons() {
    this.el.querySelectorAll('[data-p]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.p === this.periode)));
    const quotidien = !INTRAJOUR.has(this.periode);
    this.el.querySelectorAll('[data-outil]').forEach((b) => {
      const o = OUTILS[b.dataset.outil];
      b.setAttribute('aria-pressed', String(!!this.outils[b.dataset.outil]));
      // Les moyennes mobiles se calculent sur des fermetures quotidiennes : pas en 1J / 1S.
      b.disabled = !!o.quotidien && !quotidien;
      b.title = b.disabled ? 'Disponible à partir de 1M' : '';
    });
    const c = this.$('.btn-comp');
    c.setAttribute('aria-expanded', String(this.comparer));
    c.setAttribute('aria-pressed', String(this.comparer));
  }

  /** Agrandit la carte du graphique sur tout l'écran (Échap ou le bouton pour revenir). */
  basculerPleinEcran() {
    const carte = this.el.closest('.card') || this.el;
    const plein = !carte.classList.contains('plein-ecran');
    carte.classList.toggle('plein-ecran', plein);
    document.body.classList.toggle('sans-defilement', plein);
    const b = this.$('.gr-agrandir');
    b.textContent = plein ? '×' : '⤢';
    b.setAttribute('aria-label', plein ? 'Réduire le graphique' : 'Agrandir le graphique');
    if (plein) {
      this.echap = (e) => { if (e.key === 'Escape') this.basculerPleinEcran(); };
      document.addEventListener('keydown', this.echap);
      b.focus();
    } else document.removeEventListener('keydown', this.echap);
    requestAnimationFrame(() => this.chart?.resize());
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
    // Les notes (avis) vont sous le graphique; les erreurs s'affichent dans la zone du graphique.
    const n = this.$('.gr-notes');
    n.hidden = type !== 'avis' || !message;
    n.textContent = type === 'avis' ? message || '' : '';
    if (type === 'avis') message = null;
    const e = this.$('.gr-etat');
    e.hidden = !message;
    e.className = 'gr-etat ' + type;
    e.textContent = message || '';
  }

  /** Rangée de statistiques sous le graphique : début, fin, haut et bas de la période, avec leur date. */
  statistiques(pts, base, devise, etiquette) {
    const dl = this.$('.gr-stats');
    let iMax = 0, iMin = 0;
    pts.forEach((q, i) => { if (q.v > pts[iMax].v) iMax = i; if (q.v < pts[iMin].v) iMin = i; });
    const ecart = pts[iMax].v / pts[iMin].v - 1;
    const items = [
      ['Début', argent(base, devise), this.periode === '1J' ? 'fermeture de la veille' : etiquette(0, true)],
      ['Fin', argent(pts[pts.length - 1].v, devise), etiquette(pts.length - 1, true)],
      ['Haut', argent(pts[iMax].v, devise), etiquette(iMax, true)],
      ['Bas', argent(pts[iMin].v, devise), etiquette(iMin, true)],
      ['Écart haut-bas', pct(ecart * 100, 1).replace('+', ''), 'amplitude de la période']
    ];
    dl.innerHTML = items.map(([k, v, d]) => `<div><dt>${k}</dt><dd>${v}<small>${d}</small></dd></div>`).join('');
    dl.hidden = false;
    return { iMax, iMin };
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
      return long ? dateCourte(t) : jourMois(t, ['1A', '2A', 'AAJ', '6M'].includes(this.periode));
    };

    const accent = css('--accent'), grille = css('--line'), texte = css('--muted');
    const palette = [css('--serie-1'), css('--serie-2'), css('--serie-3'), css('--serie-4'), css('--serie-5'), css('--serie-6')];
    const enPct = this.comparer && this.indices.size > 0;
    const quotidien = !INTRAJOUR.has(this.periode);
    const nomPrincipal = this.symbole ? this.nom : `Portefeuille de ${p.prenom || 'Michel'}`;
    const y = (val) => (enPct ? (val / base - 1) * 100 : val);

    const datasets = [{
      label: nomPrincipal,
      data: pts.map((q, i) => ({ x: i, y: y(q.v) })),
      borderColor: accent,
      borderWidth: p.epaisseur + (enPct ? 0.5 : 0),
      pointRadius: 0, pointHoverRadius: 4, pointHitRadius: 8, tension: 0,
      fill: p.styleGraph === 'aire' && !enPct ? 'start' : false,
      backgroundColor: (ctx) => {
        const { chart } = ctx; const a = chart.chartArea;
        if (!a) return 'transparent';
        const g = chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
        g.addColorStop(0, alpha(accent, '55')); g.addColorStop(1, alpha(accent, '00'));
        return g;
      }
    }];

    // Moyennes mobiles (calculées sur tout l'historique, puis coupées à la période).
    if (quotidien && serie.complet) {
      for (const [cle, n, couleur] of [['mm20', 20, palette[1]], ['mm50', 50, palette[2]]]) {
        if (!this.outils[cle]) continue;
        const mm = moyenneMobile(serie.complet, n);
        datasets.push({ label: `Moyenne ${n} jours`, data: pts.map((q, i) => ({ x: i, y: mm.has(q.t) ? y(mm.get(q.t)) : null })),
          borderColor: couleur, borderWidth: 1.5, borderDash: [6, 3], pointRadius: 0, pointHoverRadius: 0, tension: 0, spanGaps: true, fill: false, mg: 'mm' });
      }
    }

    const lignesIndices = [];
    if (enPct) {
      let k = 3;
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

    // Statistiques et pastilles haut / bas
    const { iMax, iMin } = this.statistiques(pts, base, devise, etiquette);
    const extremes = this.outils.hautBas && pts.length > 2 ? [
      { i: iMax, v: y(pts[iMax].v), haut: true, couleur: css('--up'), texte: 'Haut ' + (enPct ? pct(y(pts[iMax].v), 1) : argent(pts[iMax].v, devise, pts[iMax].v >= 100 ? 0 : 2)) },
      { i: iMin, v: y(pts[iMin].v), haut: false, couleur: css('--down'), texte: 'Bas ' + (enPct ? pct(y(pts[iMin].v), 1) : argent(pts[iMin].v, devise, pts[iMin].v >= 100 ? 0 : 2)) }
    ] : null;

    const montrerLegende = datasets.length > 1;
    const options = {
      responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 14, right: 4, bottom: 4 } },
      scales: {
        x: { type: 'linear', min: 0, max: pts.length - 1, grid: { display: p.grille, color: grille }, border: { color: grille },
          // 4 étiquettes réparties également, toujours le premier et le dernier point, sans chevauchement.
          afterBuildTicks: (axe) => {
            const n = pts.length - 1;
            const etroit = axe.chart.width < 460; // téléphone : 3 étiquettes seulement
            const reperes = etroit ? [0, Math.round(n / 2), n] : [0, Math.round(n / 3), Math.round((2 * n) / 3), n];
            axe.ticks = [...new Set(reperes)].map((value) => ({ value }));
          },
          ticks: { color: texte, maxRotation: 0, autoSkip: false, align: 'inner', callback: (val) => etiquette(val, false) } },
        y: { grid: { display: p.grille, color: grille }, border: { display: false }, grace: '6%',
          ticks: { color: texte, maxTicksLimit: 5, callback: (val) => (enPct ? pct(val, 0) : argent(val, devise, Math.abs(val) >= 100 ? 0 : 2)) } }
      },
      plugins: {
        mgOutils: { depart: this.outils.depart ? y(base) : null, extremes, couleurTexte: texte, fond: css('--panel'), police: css('--police') || 'sans-serif' },
        legend: { display: montrerLegende, position: 'bottom', labels: { color: css('--fg'), boxWidth: 12, boxHeight: 3 } },
        tooltip: {
          backgroundColor: css('--panel'), titleColor: texte, bodyColor: css('--fg'), borderColor: grille, borderWidth: 1, padding: 10,
          displayColors: montrerLegende,
          filter: (item) => item.parsed.y != null,
          callbacks: {
            title: (items) => etiquette(items[0].parsed.x, true),
            label: (item) => {
              if (enPct) return ` ${item.dataset.label} : ${pct(item.parsed.y)}`;
              const val = item.parsed.y;
              if (item.dataset.mg === 'mm') return ` ${item.dataset.label} : ${argent(val, devise)}`;
              return [` ${argent(val, devise)}`, ` ${argentSigne(val - base, devise)} (${pct((val / base - 1) * 100)}) depuis le début`];
            }
          }
        }
      }
    };

    if (this.chart) this.chart.destroy();
    this.chart = new window.Chart(this.$('canvas'), { type: 'line', data: { datasets }, options, plugins: [extension] });

    // Notes sous le graphique : métal estimé via un fonds, titres exclus du total faute de données.
    const notes = [];
    if (this.symbole && donnees.symboles[this.symbole]?.estime) notes.push(`Prix à l’once estimé à partir du fonds ${donnees.symboles[this.symbole].estime} (le prix au comptant n’est pas offert gratuitement).`);
    if (!this.symbole) {
      const { erreurs } = positionsValides(donnees, p.positions);
      if (erreurs.length) notes.push('Non inclus dans le total faute de données : ' + erreurs.map((x) => TITRES[x.symbole]?.nom || x.symbole).join(', ') + '.');
      if (quotidien) {
        const debutPeriode = isoDate(pts[0].t);
        for (const pos of positionsValides(donnees, p.positions).ok) {
          const premier = donnees.symboles[pos.symbole].quotidien[0]?.[0];
          if (premier && premier > debutPeriode) notes.push(`${TITRES[pos.symbole]?.court || pos.symbole} : cours disponible depuis le ${dateCourte(msDate(premier))}; avant, compté à ce premier cours.`);
        }
      }
      if (donnees.avis) notes.push(donnees.avis);
    }
    if (quotidien && (this.outils.mm20 || this.outils.mm50) && serie.complet && serie.complet.length < 50) notes.push('Historique trop court pour une moyenne complète sur toute la période.');
    this.etat(notes.join(' ') || null, 'avis');
  }

  /** Données indisponibles : message clair et, pour un titre, le widget TradingView en direct à la place. */
  repli(message) {
    if (this.chart) { this.chart.destroy(); this.chart = null; }
    this.$('.gr-valeur').textContent = '—';
    this.$('.gr-variation').textContent = '';
    this.$('.gr-cmp').hidden = true;
    this.$('.gr-stats').hidden = true;
    this.etat(message, 'erreur');
    if (this.repliTV && window.MG_widget) {
      this.$('.gr-zone').classList.add('repli');
      this.$('canvas').hidden = true;
      const z = this.$('.gr-zone');
      let tv = z.querySelector('.tv');
      if (!tv) { tv = document.createElement('div'); tv.className = 'tv'; z.prepend(tv); window.MG_widget(tv, this.repliTV); }
      this.el.querySelector('.gr-tete').hidden = true;
      this.el.querySelector('.gr-ctrl').hidden = true;
      this.el.querySelector('.gr-outils').hidden = true;
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
