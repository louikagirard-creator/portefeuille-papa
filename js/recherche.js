// Recherche d'actions : n'importe quel titre (États-Unis, TSX, etc.) avec prix en direct, graphique complet,
// profil de l'entreprise et données financières, par les widgets TradingView (aucune clé API dans le navigateur).
// Liste de surveillance et recherches récentes gardées sur l'appareil (paramètres).
import { parametres, modifier, estSombre } from './parametres.js';

// Suggestions : noms courants → symbole TradingView. On peut aussi taper n'importe quel symbole (ex. « AAPL », « TSX:RY »).
const SUGGESTIONS = [
  ['Apple', 'NASDAQ:AAPL'], ['Microsoft', 'NASDAQ:MSFT'], ['Nvidia', 'NASDAQ:NVDA'], ['Amazon', 'NASDAQ:AMZN'],
  ['Alphabet (Google)', 'NASDAQ:GOOGL'], ['Meta (Facebook)', 'NASDAQ:META'], ['Tesla', 'NASDAQ:TSLA'], ['Netflix', 'NASDAQ:NFLX'],
  ['Broadcom', 'NASDAQ:AVGO'], ['AMD', 'NASDAQ:AMD'], ['Intel', 'NASDAQ:INTC'], ['Micron', 'NASDAQ:MU'],
  ['TSMC', 'NYSE:TSM'], ['Berkshire Hathaway', 'NYSE:BRK.B'], ['JPMorgan Chase', 'NYSE:JPM'], ['Visa', 'NYSE:V'],
  ['Costco', 'NASDAQ:COST'], ['Walmart', 'NYSE:WMT'], ['Coca-Cola', 'NYSE:KO'], ['ExxonMobil', 'NYSE:XOM'],
  ['Chevron', 'NYSE:CVX'], ['Lockheed Martin', 'NYSE:LMT'], ['Boeing', 'NYSE:BA'], ['Palantir', 'NASDAQ:PLTR'],
  ['SpaceX', 'NASDAQ:SPCX'], ['Sandisk', 'NASDAQ:SNDK'], ['Western Digital', 'NASDAQ:WDC'],
  ['Banque Royale (RBC)', 'TSX:RY'], ['Banque TD', 'TSX:TD'], ['Banque de Montréal', 'TSX:BMO'], ['Banque Scotia', 'TSX:BNS'],
  ['Banque Nationale', 'TSX:NA'], ['CIBC', 'TSX:CM'], ['Enbridge', 'TSX:ENB'], ['TC Énergie', 'TSX:TRP'],
  ['Canadian Natural Resources', 'TSX:CNQ'], ['Suncor Énergie', 'TSX:SU'], ['Cenovus Énergie', 'TSX:CVE'], ['Imperial Oil', 'TSX:IMO'],
  ['Shopify', 'TSX:SHOP'], ['Canadien National (CN)', 'TSX:CNR'], ['Canadien Pacifique Kansas City', 'TSX:CP'], ['BCE (Bell)', 'TSX:BCE'],
  ['Telus', 'TSX:T'], ['Rogers', 'TSX:RCI.B'], ['Alimentation Couche-Tard', 'TSX:ATD'], ['Dollarama', 'TSX:DOL'],
  ['CGI', 'TSX:GIB.A'], ['Constellation Software', 'TSX:CSU'], ['Brookfield', 'TSX:BN'], ['Manuvie', 'TSX:MFC'],
  ['Sun Life', 'TSX:SLF'], ['Hydro One', 'TSX:H'], ['Barrick Gold', 'TSX:ABX'], ['Agnico Eagle', 'TSX:AEM'],
  ['Cameco (uranium)', 'TSX:CCO'], ['Nutrien', 'TSX:NTR'], ['Bombardier', 'TSX:BBD.B'], ['WSP', 'TSX:WSP'],
  ['S&P 500 (fonds SPY)', 'AMEX:SPY'], ['Nasdaq 100 (fonds QQQ)', 'NASDAQ:QQQ'], ['Indice S&P/TSX 60 (fonds XIU)', 'TSX:XIU'],
  ['Or', 'OANDA:XAUUSD'], ['Argent', 'OANDA:XAGUSD'], ['Pétrole Brent', 'TVC:UKOIL'], ['Bitcoin', 'BITSTAMP:BTCUSD']
];

const sans = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Transforme ce que Michel tape en symbole TradingView. */
function versSymbole(texte) {
  const t = texte.trim();
  if (!t) return null;
  const exact = SUGGESTIONS.find(([nom, sym]) => sans(nom) === sans(t) || sym.toLowerCase() === t.toLowerCase() || sym.split(':')[1].toLowerCase() === t.toLowerCase());
  if (exact) return { nom: exact[0], symbole: exact[1] };
  const partiel = SUGGESTIONS.find(([nom]) => sans(nom).includes(sans(t)));
  if (partiel && t.length >= 3) return { nom: partiel[0], symbole: partiel[1] };
  // Symbole tapé directement : « ry.to » → « TSX:RY », « aapl » → « AAPL » (TradingView trouve la bourse).
  let s = t.toUpperCase().replace(/\s+/g, '');
  if (/\.TO$/.test(s)) s = 'TSX:' + s.replace(/\.TO$/, '');
  if (/\.V$/.test(s)) s = 'TSXV:' + s.replace(/\.V$/, '');
  if (!/^[A-Z0-9:._!-]{1,20}$/.test(s)) return null;
  return { nom: s, symbole: s };
}

function widget(el, fichier, config) {
  el.replaceChildren();
  const box = document.createElement('div');
  box.className = 'tradingview-widget-container';
  box.style.height = '100%';
  const inner = document.createElement('div');
  inner.className = 'tradingview-widget-container__widget';
  inner.style.height = '100%';
  const s = document.createElement('script');
  s.src = 'https://s3.tradingview.com/external-embedding/' + fichier;
  s.async = true;
  s.textContent = JSON.stringify(config);
  box.append(inner, s);
  el.append(box);
}

let courant = null;

function afficher(choix) {
  courant = choix;
  const res = document.getElementById('rech-resultat');
  res.hidden = false;
  res.querySelector('[data-rech-titre]').textContent = choix.nom === choix.symbole ? choix.symbole : `${choix.nom} · ${choix.symbole}`;
  const theme = estSombre() ? 'dark' : 'light';
  widget(res.querySelector('[data-w="info"]'), 'embed-widget-symbol-info.js', { symbol: choix.symbole, width: '100%', locale: 'fr', colorTheme: theme, isTransparent: true });
  widget(res.querySelector('[data-w="graph"]'), 'embed-widget-advanced-chart.js', {
    autosize: true, symbol: choix.symbole, interval: 'D', timezone: 'America/Toronto', theme, style: '3', locale: 'fr',
    allow_symbol_change: true, hide_volume: false, calendar: false, support_host: 'https://www.tradingview.com', backgroundColor: 'rgba(0,0,0,0)'
  });
  widget(res.querySelector('[data-w="profil"]'), 'embed-widget-symbol-profile.js', { symbol: choix.symbole, width: '100%', height: '100%', locale: 'fr', colorTheme: theme, isTransparent: true });
  widget(res.querySelector('[data-w="finances"]'), 'embed-widget-financials.js', { symbol: choix.symbole, width: '100%', height: '100%', locale: 'fr', colorTheme: theme, isTransparent: true, displayMode: matchMedia('(max-width: 640px)').matches ? 'compact' : 'regular' });
  majBoutonSurveillance();

  // Recherches récentes (8 dernières)
  const recentes = [choix, ...(parametres().recherchesRecentes || []).filter((r) => r.symbole !== choix.symbole)].slice(0, 8);
  modifier({ recherchesRecentes: recentes });
  dessinerRecentes();
}

function majBoutonSurveillance() {
  const b = document.querySelector('[data-surveiller]');
  if (!b || !courant) return;
  const dedans = (parametres().surveillance || []).some((x) => x.symbole === courant.symbole);
  b.textContent = dedans ? '✓ Dans ma liste' : '+ Ajouter à ma liste';
  b.setAttribute('aria-pressed', String(dedans));
}

function dessinerRecentes() {
  const box = document.getElementById('rech-recentes');
  const r = parametres().recherchesRecentes || [];
  box.hidden = !r.length;
  box.querySelector('div').replaceChildren(...r.map((x) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'puce-btn';
    b.textContent = x.nom === x.symbole ? x.symbole : x.nom;
    b.addEventListener('click', () => afficher(x));
    return b;
  }));
}

function dessinerSurveillance() {
  const box = document.getElementById('surveillance');
  const liste = parametres().surveillance || [];
  const grille = box.querySelector('.grid');
  box.querySelector('[data-vide]').hidden = liste.length > 0;
  grille.replaceChildren(...liste.map((x) => {
    const carte = document.createElement('article');
    carte.className = 'card';
    const tete = document.createElement('div'); tete.className = 'head';
    const h = document.createElement('h3'); h.textContent = x.nom === x.symbole ? x.symbole : x.nom;
    const actions = document.createElement('div'); actions.className = 'surv-actions';
    const voir = document.createElement('button'); voir.type = 'button'; voir.className = 'btn btn-petit'; voir.textContent = 'Détails';
    voir.addEventListener('click', () => { afficher(x); document.getElementById('recherche').scrollIntoView({ behavior: 'smooth' }); });
    const ret = document.createElement('button'); ret.type = 'button'; ret.className = 'btn-icone'; ret.textContent = '×';
    ret.setAttribute('aria-label', 'Retirer ' + h.textContent + ' de ma liste');
    ret.addEventListener('click', () => { modifier({ surveillance: liste.filter((y) => y.symbole !== x.symbole) }); dessinerSurveillance(); majBoutonSurveillance(); });
    actions.append(voir, ret); tete.append(h, actions);
    const tv = document.createElement('div'); tv.className = 'tv';
    carte.append(tete, tv);
    widget(tv, 'embed-widget-mini-symbol-overview.js', { symbol: x.symbole, width: '100%', height: '100%', locale: 'fr', dateRange: '12M',
      colorTheme: estSombre() ? 'dark' : 'light', isTransparent: true, autosize: true, chartOnly: false });
    return carte;
  }));
}

export function initialiserRecherche() {
  const form = document.getElementById('rech-form');
  if (!form) return;
  const champ = document.getElementById('rech-champ');
  const liste = document.getElementById('rech-suggestions');
  liste.replaceChildren(...SUGGESTIONS.map(([nom, sym]) => Object.assign(document.createElement('option'), { value: nom, label: sym })));
  const erreur = document.getElementById('rech-erreur');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const choix = versSymbole(champ.value);
    erreur.hidden = !!choix;
    if (!choix) { erreur.textContent = 'Tape un nom d’entreprise (ex. « Apple », « Banque Royale ») ou un symbole (ex. « AAPL », « RY.TO », « TSX:SHOP »).'; return; }
    afficher(choix);
    champ.blur();
  });
  document.querySelector('[data-surveiller]').addEventListener('click', () => {
    if (!courant) return;
    const l = parametres().surveillance || [];
    const dedans = l.some((x) => x.symbole === courant.symbole);
    modifier({ surveillance: dedans ? l.filter((x) => x.symbole !== courant.symbole) : [...l, courant] });
    majBoutonSurveillance();
    dessinerSurveillance();
  });
  dessinerRecentes();
  dessinerSurveillance();

  // Les widgets suivent le thème.
  window.addEventListener('mg:parametres', (e) => {
    if ('theme' in e.detail) { if (courant) afficher(courant); dessinerSurveillance(); }
  });
}
