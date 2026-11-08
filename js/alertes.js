// Alertes affichées en haut du site à l'ouverture : gros mouvements du jour (seuil réglable),
// dividendes à venir dans les 14 jours, événements (evenements.json) et titres en attente de suivi.
// Chaque alerte peut être fermée; elle reste fermée pour la journée (localStorage).
import { parametres } from './parametres.js';
import { chargerPrix, chargerEvenements, valeurActuelle, msDate } from './donnees.js';
import { calculerRevenu, prochainsVersements } from './revenu.js';
import { pct, argent, argentSigne, dateCourte } from './format.js';
import { TITRES } from './config.js';

const CLE = 'mg-alertes-fermees';
const auj = () => new Date().toISOString().slice(0, 10);
const dansJours = (iso) => Math.round((msDate(iso) - msDate(auj())) / 86400000);

function fermees() {
  try { const f = JSON.parse(localStorage.getItem(CLE) || '{}'); return f.jour === auj() ? new Set(f.ids) : new Set(); } catch { return new Set(); }
}
function fermer(id) {
  const ids = [...fermees(), id];
  try { localStorage.setItem(CLE, JSON.stringify({ jour: auj(), ids })); } catch { /* sans gravité */ }
}

export async function dessinerAlertes() {
  const box = document.getElementById('alertes');
  if (!box) return;
  const p = parametres();
  const [d, ev] = await Promise.all([chargerPrix(), chargerEvenements()]);
  const nom = (s) => TITRES[s]?.court || s;
  const liste = [];

  if (d.etat === 'ok') {
    const act = valeurActuelle(d, p.positions, p.devise);
    const seuil = +p.alerteSeuil || 0;
    const quand = act && act.session === new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date()) ? 'aujourd’hui' : 'à la dernière séance';
    if (act && seuil > 0) {
      for (const x of act.details) {
        if (x.varPct == null || Math.abs(x.varPct) < seuil) continue;
        liste.push({ id: 'mvt-' + x.symbole + '-' + act.session, type: x.varPct > 0 ? 'hausse' : 'baisse',
          texte: `${nom(x.symbole)} ${x.varPct > 0 ? 'monte' : 'baisse'} de ${pct(Math.abs(x.varPct), 1).replace('+', '')} ${quand} (${argentSigne(x.valeur - x.valeur / (1 + x.varPct / 100), p.devise, 0)} sur ta position).`,
          action: { texte: 'Voir', lien: '#actions' } });
      }
    }
    for (const v of prochainsVersements(calculerRevenu(d, p))) {
      const j = dansJours(v.registre || v.date);
      if (j < 0 || j > 14) continue;
      liste.push({ id: 'div-' + v.symbole + '-' + v.date, type: 'info',
        texte: v.registre && dansJours(v.registre) >= 0
          ? `Dividende ${nom(v.symbole)} : il faut détenir le titre au ${dateCourte(msDate(v.registre))} pour recevoir environ ${argent(v.versement, p.devise, 0)} le ${dateCourte(msDate(v.date))}.`
          : `Dividende ${nom(v.symbole)} : environ ${argent(v.versement, p.devise, 0)} versé le ${dateCourte(msDate(v.date))}.` });
    }
  }
  const detenus = new Set(p.positions.filter((x) => x.quantite > 0).map((x) => x.symbole));
  for (const e of ev.evenements || []) {
    const j = dansJours(e.date);
    if (j < -1 || j > 21 || (e.symbole && !detenus.has(e.symbole))) continue;
    liste.push({ id: 'evt-' + e.date + '-' + (e.symbole || ''), type: 'evenement',
      texte: `${j === 0 ? 'Aujourd’hui' : j === 1 ? 'Demain' : j < 0 ? 'Hier' : 'Le ' + dateCourte(msDate(e.date))} : ${e.texte}` });
  }

  const deja = fermees();
  const visibles = liste.filter((a) => !deja.has(a.id));
  box.hidden = !visibles.length;
  box.replaceChildren(...visibles.map((a) => {
    const li = document.createElement('li');
    li.className = 'alerte alerte-' + a.type;
    const icone = { hausse: '▲', baisse: '▼', info: '💵', evenement: '📅' }[a.type] || '•';
    const t = document.createElement('span');
    t.textContent = `${icone} ${a.texte}`;
    li.append(t);
    if (a.action) { const l = document.createElement('a'); l.href = a.action.lien; l.textContent = a.action.texte; l.className = 'btn btn-petit'; li.append(l); }
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'btn-icone'; x.textContent = '×'; x.setAttribute('aria-label', 'Masquer cette alerte pour aujourd’hui');
    x.addEventListener('click', () => { fermer(a.id); li.remove(); box.hidden = !box.children.length; });
    li.append(x);
    return li;
  }));
}

window.addEventListener('mg:parametres', (e) => {
  if (['positions', 'alerteSeuil', 'discret', 'devise', 'formatNombre'].some((k) => k in e.detail)) dessinerAlertes();
});
