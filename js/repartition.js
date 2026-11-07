// Deux graphiques du portefeuille : la répartition par titre (anneau) et
// la contribution de chaque titre à la variation du jour (barres).
import { parametres } from './parametres.js';
import { chargerPrix, contributions } from './donnees.js';
import { argent, argentSigne, pct, sens } from './format.js';
import { TITRES } from './config.js';

const css = (nom) => getComputedStyle(document.documentElement).getPropertyValue(nom).trim();
let anneau = null, barres = null;

function message(el, texte) {
  el.replaceChildren(Object.assign(document.createElement('p'), { className: 'small', textContent: texte }));
}

export async function dessinerRepartition() {
  const elA = document.getElementById('repartition');
  const elB = document.getElementById('contribution');
  if (!elA || !elB) return;
  const p = parametres();
  const donnees = await chargerPrix();
  elA.classList.remove('chargement'); elB.classList.remove('chargement');
  anneau?.destroy(); barres?.destroy(); anneau = barres = null;
  if (donnees.etat !== 'ok') { message(elA, donnees.message); message(elB, donnees.message); return; }
  const c = contributions(donnees, p.positions, p.devise);
  if (!c || !c.lignes.length) { message(elA, 'Ajoute tes positions dans Paramètres.'); message(elB, 'Ajoute tes positions dans Paramètres.'); return; }

  // 7 couleurs du thème + 5 teintes fixes, pour que chaque titre ait sa propre couleur (jusqu'à 12).
  const palette = [...['--accent', '--serie-1', '--serie-2', '--serie-3', '--serie-4', '--serie-5', '--serie-6'].map(css), '#9c6b3f', '#6f7fd8', '#c2a83e', '#b2506b', '#4f9a8f'];
  const nom = (s) => TITRES[s]?.court || s;

  // ---- Répartition (anneau + liste lisible) ----
  const parValeur = [...c.lignes].sort((a, b) => b.valeur - a.valeur);
  elA.innerHTML = `
    <div class="rep">
      <div class="rep-anneau"><canvas role="img" aria-label="Répartition du portefeuille par titre"></canvas>
        <div class="rep-centre"><span class="small">Total</span><strong>${argent(c.total, p.devise, 0)}</strong></div></div>
      <ul class="rep-liste">${parValeur.map((l, i) => `
        <li><span class="rep-pastille" style="background:${palette[i % palette.length]}"></span>
          <span class="rep-nom">${nom(l.symbole)}</span>
          <span class="rep-poids">${pct(l.poids * 100, 1).replace('+', '')}</span>
          <span class="rep-val">${argent(l.valeur, p.devise, 0)}</span></li>`).join('')}
      </ul>
    </div>`;
  anneau = new window.Chart(elA.querySelector('canvas'), {
    type: 'doughnut',
    data: { labels: parValeur.map((l) => nom(l.symbole)), datasets: [{ data: parValeur.map((l) => l.valeur),
      backgroundColor: parValeur.map((_, i) => palette[i % palette.length]), borderColor: css('--panel'), borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '68%',
      plugins: { legend: { display: false }, tooltip: { backgroundColor: css('--panel'), titleColor: css('--muted'), bodyColor: css('--fg'), borderColor: css('--line'), borderWidth: 1,
        callbacks: { label: (x) => ` ${argent(x.raw, p.devise, 0)} · ${pct((x.raw / c.total) * 100, 1).replace('+', '')}` } } } }
  });

  // ---- Contribution du jour ----
  const parContribution = [...c.lignes].sort((a, b) => b.variation - a.variation);
  elB.innerHTML = `
    <p class="contrib-total">Variation du jour : <strong class="${sens(c.variation)}">${argentSigne(c.variation, p.devise, 0)}</strong></p>
    <div class="chart" style="height:${Math.max(180, parContribution.length * 30 + 30)}px"><canvas role="img" aria-label="Contribution de chaque titre à la variation du jour"></canvas></div>`;
  barres = new window.Chart(elB.querySelector('canvas'), {
    type: 'bar',
    data: { labels: parContribution.map((l) => nom(l.symbole)), datasets: [{ data: parContribution.map((l) => l.variation),
      backgroundColor: parContribution.map((l) => (l.variation >= 0 ? css('--up') : css('--down'))), borderRadius: 3, barThickness: 16 }] },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      scales: { x: { grid: { color: css('--line') }, ticks: { color: css('--muted'), maxTicksLimit: 5, callback: (v) => argentSigne(v, p.devise, 0) } },
        y: { grid: { display: false }, ticks: { color: css('--fg') } } },
      plugins: { legend: { display: false }, tooltip: { backgroundColor: css('--panel'), titleColor: css('--muted'), bodyColor: css('--fg'), borderColor: css('--line'), borderWidth: 1,
        callbacks: { label: (x) => { const l = parContribution[x.dataIndex]; return ` ${argentSigne(l.variation, p.devise, 0)} · titre ${pct(l.varPct, 2)}`; } } } } }
  });
}

window.addEventListener('mg:parametres', () => dessinerRepartition());
