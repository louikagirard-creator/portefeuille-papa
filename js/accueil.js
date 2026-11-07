// En-tête personnalisé : titre, message d'accueil selon l'heure et résumé du portefeuille en une phrase.
import { parametres } from './parametres.js';
import { chargerPrix, valeurActuelle } from './donnees.js';
import { argent, argentSigne, pct, sens } from './format.js';

function salutation(prenom) {
  // Heure locale de l'appareil (formatToParts évite le « 4 h » du format québécois).
  const h = Number(new Intl.DateTimeFormat('en-CA', { hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date()).find((x) => x.type === 'hour').value);
  const mot = h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
  return `${mot} ${prenom}`.trim();
}

export async function dessinerAccueil() {
  const p = parametres();
  const nom = p.nomComplet || 'Michel Girard';
  document.querySelectorAll('[data-nom-complet]').forEach((el) => { el.textContent = nom; });
  document.querySelectorAll('[data-prenom]').forEach((el) => { el.textContent = p.prenom || 'Michel'; });
  document.title = `Portefeuille de ${nom}`;

  const salut = document.querySelector('[data-salut]');
  const phrase = document.querySelector('[data-resume]');
  const bandeau = document.querySelector('[data-exemple]');
  salut.textContent = p.accueilPerso || salutation(p.prenom || 'Michel');
  bandeau.hidden = !p.positionsExemple;

  const valeur = document.querySelector('[data-total]');
  const variation = document.querySelector('[data-total-var]');
  phrase.classList.add('chargement');
  const donnees = await chargerPrix();
  phrase.classList.remove('chargement');
  if (donnees.etat !== 'ok') {
    phrase.textContent = 'Les prix en direct sont plus bas. Le suivi de la valeur de ton portefeuille sera disponible dès que la source de données sera branchée.';
    valeur.textContent = '—'; variation.textContent = '';
    return;
  }
  const a = valeurActuelle(donnees, p.positions, p.devise);
  if (!a) { phrase.textContent = 'Ajoute tes positions dans Paramètres pour suivre la valeur de ton portefeuille.'; return; }

  const v = a.variationPct;
  const marcheFerme = a.session !== new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date());
  const quand = marcheFerme ? 'à la dernière séance' : 'aujourd’hui';
  phrase.textContent = Math.abs(v) < 0.05
    ? `Ton portefeuille est stable ${quand}.`
    : `Ton portefeuille est en ${v > 0 ? 'hausse' : 'baisse'} de ${pct(Math.abs(v), 1).replace(/^[+−]/, '')} ${quand}.`;
  valeur.textContent = argent(a.total, p.devise, 0);
  variation.className = 'acc-var ' + sens(a.variation);
  variation.textContent = `${argentSigne(a.variation, p.devise, 0)} (${pct(v, 1)}) ${quand}`;
}

window.addEventListener('mg:parametres', () => dessinerAccueil());
