// Configuration centrale : titres suivis, indices de comparaison, thèmes et paramètres par défaut.

// Titres que Michel peut détenir. Tous sont cotés en dollars US (plan gratuit de Twelve Data) :
// Suncor et Cenovus sont suivis par leur cotation à New York (même entreprise qu'au TSX),
// la Bourse de Taïwan par le fonds EWT, les métaux par leur prix au comptant à l'once.
export const TITRES = {
  'SPCX':    { nom: 'SpaceX',            court: 'SpaceX',    pays: 'US', secteur: 'techno',  unite: 'actions', tv: 'NASDAQ:SPCX' },
  'GOOGL':   { nom: 'Alphabet (Google)', court: 'Google',    pays: 'US', secteur: 'techno',  unite: 'actions', tv: 'NASDAQ:GOOGL' },
  'SU':      { nom: 'Suncor Énergie',    court: 'Suncor',    pays: 'CA', secteur: 'energie', unite: 'actions', tv: 'TSX:SU' },
  'CVE':     { nom: 'Cenovus Énergie',   court: 'Cenovus',   pays: 'CA', secteur: 'energie', unite: 'actions', tv: 'TSX:CVE' },
  'SNDK':    { nom: 'Sandisk',           court: 'Sandisk',   pays: 'US', secteur: 'techno',  unite: 'actions', tv: 'NASDAQ:SNDK' },
  'WDC':     { nom: 'Western Digital',   court: 'W. Digital',pays: 'US', secteur: 'techno',  unite: 'actions', tv: 'NASDAQ:WDC' },
  'EWT':     { nom: 'Bourse de Taïwan (fonds EWT)', court: 'Taïwan', pays: 'TW', secteur: 'techno', unite: 'parts', tv: 'AMEX:EWT' },
  'XAU/USD': { nom: 'Or',        court: 'Or',        pays: 'MONDE', secteur: 'metaux', unite: 'onces', tv: 'OANDA:XAUUSD' },
  'XAG/USD': { nom: 'Argent',    court: 'Argent',    pays: 'MONDE', secteur: 'metaux', unite: 'onces', tv: 'OANDA:XAGUSD' },
  'XPT/USD': { nom: 'Platine',   court: 'Platine',   pays: 'MONDE', secteur: 'metaux', unite: 'onces', tv: 'OANDA:XPTUSD' },
  'XPD/USD': { nom: 'Palladium', court: 'Palladium', pays: 'MONDE', secteur: 'metaux', unite: 'onces', tv: 'OANDA:XPDUSD' }
};

/**
 * Ajoute des titres « perso » (ajoutés par Michel ou suivis par le robot via suivis.json) à TITRES.
 * Un titre déjà présent n'est jamais écrasé. Identifiant = symbole TradingView (ex. « NASDAQ:AAPL », « TSX:RY »).
 */
export function ajouterTitres(liste) {
  for (const t of liste || []) {
    if (!t?.id || TITRES[t.id]) continue;
    const bourse = (t.tv || t.id).split(':')[0];
    TITRES[t.id] = {
      nom: t.nom || t.id, court: t.court || (t.nom || t.id).replace(/\s*\(.*\)$/, ''),
      pays: t.pays || (/^TSXV?$/.test(bourse) ? 'CA' : 'US'), secteur: t.secteur || 'autre',
      unite: t.unite || 'actions', tv: t.tv || t.id, perso: true
    };
  }
}

/** Trouve un titre déjà connu à partir d'un symbole (« GOOGL », « NASDAQ:GOOGL », « TSX:SU »…). */
export function trouverTitre(symbole) {
  const s = String(symbole || '').toUpperCase();
  const court = s.includes(':') ? s.split(':')[1] : s;
  if (TITRES[s]) return s;
  const e = Object.entries(TITRES).find(([id, t]) => t.tv.toUpperCase() === s || id.toUpperCase() === court || (!s.includes(':') && t.tv.toUpperCase().split(':')[1] === court));
  return e ? e[0] : null;
}

// Indices de comparaison, suivis par des fonds négociés en bourse qui les reproduisent.
export const INDICES = [
  { id: 'EWC', nom: 'S&P/TSX (Canada)', via: 'fonds EWC', theme: 'canada' },
  { id: 'SPY', nom: 'S&P 500',          via: 'fonds SPY', theme: 'usa' },
  { id: 'QQQ', nom: 'Nasdaq',           via: 'fonds QQQ', theme: 'techno' },
  { id: 'DIA', nom: 'Dow Jones',        via: 'fonds DIA', theme: 'usa' },
  { id: 'EWT', nom: 'Bourse de Taïwan', via: 'fonds EWT', theme: 'taiwan' },
  { id: 'XAU/USD', nom: 'Or',           via: 'prix au comptant', theme: 'metaux' }
];

export const TAUX_USDCAD = 'USD/CAD';

// Types de comptes (fiscalité différente). « non-enregistre » est le défaut.
export const COMPTES = {
  'non-enregistre': 'Non enregistré',
  reer: 'REER / FERR',
  celi: 'CELI',
  societe: 'Société de gestion'
};

// Quantités d'EXEMPLE : à remplacer par les vraies dans Paramètres > Mes positions.
export const POSITIONS_EXEMPLE = [
  { symbole: 'SPCX', quantite: 100 }, { symbole: 'GOOGL', quantite: 50 },
  { symbole: 'SU', quantite: 200 }, { symbole: 'CVE', quantite: 300 },
  { symbole: 'SNDK', quantite: 10 }, { symbole: 'WDC', quantite: 40 },
  { symbole: 'EWT', quantite: 150 },
  { symbole: 'XAU/USD', quantite: 5 }, { symbole: 'XAG/USD', quantite: 100 },
  { symbole: 'XPT/USD', quantite: 5 }, { symbole: 'XPD/USD', quantite: 5 }
];

// Thèmes : les couleurs sont dans css/style.css ([data-theme=…]). « sombre » sert aux widgets TradingView.
export const THEMES = {
  auto:      { nom: 'Automatique (comme l’appareil)' },
  clair:     { nom: 'Clair', sombre: false },
  sombre:    { nom: 'Sombre', sombre: true },
  classique: { nom: 'Classique Michel (marine et or)', sombre: true },
  foret:     { nom: 'Forêt', sombre: false },
  nuit:      { nom: 'Bourse de nuit', sombre: true },
  minimal:   { nom: 'Minimaliste', sombre: false }
};

export const POLICES = {
  plex:   { nom: 'IBM Plex Sans (moderne)', css: '"IBM Plex Sans", system-ui, sans-serif' },
  serif:  { nom: 'Source Serif (classique)', css: '"Source Serif 4", Georgia, serif' },
  systeme:{ nom: 'Police de l’appareil', css: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  lisible:{ nom: 'Atkinson (très lisible)', css: '"Atkinson Hyperlegible", system-ui, sans-serif' }
};

export const TAILLES = { petit: 14, normal: 16, grand: 18, tresgrand: 20 };

export const PERIODES = ['1J', '1S', '1M', '3M', '6M', 'AAJ', '1A', '2A'];

// Outils des graphiques (valeurs par défaut, modifiables dans Paramètres et sur chaque graphique).
export const OUTILS = {
  hautBas: { nom: 'Haut / bas', defaut: true },
  depart: { nom: 'Niveau de départ', defaut: true },
  mm20: { nom: 'Moyenne 20 j', defaut: false, quotidien: true },
  mm50: { nom: 'Moyenne 50 j', defaut: false, quotidien: true }
};

export const DEFAUTS = {
  prenom: 'Michel',
  nomComplet: 'Michel Girard',
  accueilPerso: '',            // vide = message automatique selon l'heure
  theme: 'auto',
  accent: '',                  // vide = couleur du thème
  gainsPertes: 'vert-rouge',   // ou 'bleu-orange'
  police: 'plex',
  taille: 'normal',
  densite: 'confortable',      // ou 'compact'
  styleGraph: 'aire',          // ou 'ligne'
  epaisseur: 2,
  grille: true,
  periode: '1M',
  indicesFavoris: ['EWC', 'SPY'],
  outils: { hautBas: true, depart: true, mm20: false, mm50: false },
  surveillance: [],              // liste de surveillance (recherche) : [{ nom, symbole }]
  recherchesRecentes: [],
  discret: false,
  cibles: null,                 // rééquilibrage : { symbole: % cible } (null = poids actuels)
  projection: { retrait: null, horizon: 25, rendement: 5, inflation: 2.5 },
  alerteSeuil: 5,               // alerte si un titre bouge de plus de X % dans la journée               // mode discret : montants masqués
  titresPerso: [],               // titres ajoutés par Michel : [{ id, nom, tv }]
  devise: 'CAD',               // devise d'affichage du portefeuille
  formatNombre: 'fr',          // 'fr' = 1 234,56 $ ; 'en' = $1,234.56
  positions: POSITIONS_EXEMPLE,
  positionsExemple: true
};
