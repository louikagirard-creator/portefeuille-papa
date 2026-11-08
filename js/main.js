// Point d'entrée : applique les paramètres, puis démarre l'accueil, les graphiques et le calendrier.
import { appliquer, ouvrir, parametres, modifier } from './parametres.js';
import { dessinerAccueil } from './accueil.js';
import { initialiserGraphiques } from './graphique.js';
import { Calendrier } from './calendrier.js';
import { dessinerRepartition } from './repartition.js';
import { initialiserRecherche } from './recherche.js';
import { initialiserIA } from './ia.js';
import { dessinerTitresPerso } from './titres-perso.js';
import { dessinerGains } from './gains.js';
import { dessinerRisque } from './risque.js';
import { dessinerRevenu } from './revenu.js';
import { dessinerAlertes } from './alertes.js';
import { dessinerReequilibrage } from './reequilibrage.js';
import { dessinerProjection } from './projection.js';
import { dessinerScenarios } from './scenarios.js';
import { chargerPrix } from './donnees.js';
import { dateHeure } from './format.js';

appliquer();
document.querySelectorAll('[data-ouvrir-parametres]').forEach((b) => b.addEventListener('click', () => ouvrir()));

dessinerAccueil();
dessinerTitresPerso(); // avant les graphiques : les cartes ajoutées en ont un aussi
initialiserGraphiques();
const cal = document.getElementById('calendrier');
if (cal) new Calendrier(cal);
dessinerRepartition();
dessinerGains();
dessinerRisque();
dessinerRevenu();
dessinerAlertes();
dessinerReequilibrage();
dessinerProjection();
dessinerScenarios();

// Mode discret : masque tous les montants (pratique pour montrer l'écran à quelqu'un).
const boutonDiscret = document.querySelector('[data-discret]');
const majDiscret = () => {
  const on = !!parametres().discret;
  boutonDiscret.setAttribute('aria-pressed', String(on));
  boutonDiscret.textContent = on ? '🙈 Afficher les montants' : '👁 Masquer les montants';
};
boutonDiscret.addEventListener('click', () => { modifier({ discret: !parametres().discret }); majDiscret(); });
majDiscret();

// Rapport : version imprimable de la page (sur téléphone : Imprimer › Enregistrer en PDF).
document.querySelector('[data-rapport]').addEventListener('click', () => {
  document.querySelector('[data-rapport-date]').textContent = new Date().toLocaleString('fr-CA', { dateStyle: 'long', timeStyle: 'short' });
  document.querySelectorAll('details').forEach((d) => { d.dataset.etaitOuvert = d.open ? '1' : ''; d.open = true; });
  window.print();
});
window.addEventListener('afterprint', () => document.querySelectorAll('details').forEach((d) => { d.open = d.dataset.etaitOuvert === '1'; }));
initialiserRecherche();
initialiserIA();

// Heure de la dernière mise à jour des prix, au pied de la section portefeuille.
chargerPrix().then((d) => {
  document.querySelectorAll('[data-maj-prix]').forEach((el) => {
    el.textContent = d.etat === 'ok' ? `Prix mis à jour ${dateHeure(d.genere)} (aux 20 minutes pendant la bourse).` : '';
  });
});

// Les widgets TradingView et les graphiques fixes (app.js) suivent le thème choisi.
window.addEventListener('mg:parametres', (e) => {
  if ('theme' in e.detail || 'accent' in e.detail || 'gainsPertes' in e.detail || 'police' in e.detail) window.MG_redessinerFixes?.();
});

// ---------- Application installable (écran d'accueil) et hors ligne ----------
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { /* sans gravité */ });

(function invitationInstaller() {
  const box = document.getElementById('installer');
  const installe = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  let refuse = false;
  try { refuse = localStorage.getItem('mg-installer-ferme') === '1'; } catch { /* navigation privée */ }
  if (!box || installe || refuse) return;
  const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const mobile = iOS || /Android/.test(navigator.userAgent);
  let invite = null; // Android / Chrome : invitation d'installation native
  const afficher = () => {
    box.replaceChildren();
    const t = document.createElement('span');
    t.textContent = iOS
      ? '📱 Mets le portefeuille sur ton écran d’accueil : touche le bouton Partager (carré avec une flèche ⬆️), puis « Sur l’écran d’accueil ». Il s’ouvrira comme une application, même sans Internet.'
      : '📱 Installe le portefeuille comme une application : il s’ouvrira d’un seul toucher, même sans Internet.';
    box.append(t);
    if (invite) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn btn-petit actif'; b.textContent = 'Installer';
      b.addEventListener('click', async () => { invite.prompt(); await invite.userChoice.catch(() => null); box.hidden = true; });
      box.append(b);
    }
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'btn-icone'; x.textContent = '×'; x.setAttribute('aria-label', 'Ne plus afficher');
    x.addEventListener('click', () => { box.hidden = true; try { localStorage.setItem('mg-installer-ferme', '1'); } catch { /* */ } });
    box.append(x);
    box.hidden = false;
  };
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); invite = e; afficher(); });
  if (iOS || (mobile && !('onbeforeinstallprompt' in window))) afficher();
})();
