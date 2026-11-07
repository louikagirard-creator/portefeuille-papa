// Point d'entrée : applique les paramètres, puis démarre l'accueil, les graphiques et le calendrier.
import { appliquer, ouvrir } from './parametres.js';
import { dessinerAccueil } from './accueil.js';
import { initialiserGraphiques } from './graphique.js';
import { Calendrier } from './calendrier.js';
import { dessinerRepartition } from './repartition.js';
import { initialiserRecherche } from './recherche.js';
import { chargerPrix } from './donnees.js';
import { dateHeure } from './format.js';

appliquer();
document.querySelectorAll('[data-ouvrir-parametres]').forEach((b) => b.addEventListener('click', () => ouvrir()));

dessinerAccueil();
initialiserGraphiques();
const cal = document.getElementById('calendrier');
if (cal) new Calendrier(cal);
dessinerRepartition();
initialiserRecherche();

// Heure de la dernière mise à jour des prix, au pied de la section portefeuille.
chargerPrix().then((d) => {
  document.querySelectorAll('[data-maj-prix]').forEach((el) => {
    el.textContent = d.etat === 'ok' ? `Prix mis à jour ${dateHeure(d.genere)} (aux 15 minutes pendant la bourse).` : '';
  });
});

// Les widgets TradingView et les graphiques fixes (app.js) suivent le thème choisi.
window.addEventListener('mg:parametres', (e) => {
  if ('theme' in e.detail || 'accent' in e.detail || 'gainsPertes' in e.detail || 'police' in e.detail) window.MG_redessinerFixes?.();
});
