// Mise en forme des nombres, montants, pourcentages et dates selon les paramètres (format fr ou en).
import { parametres } from './parametres.js';

const cache = new Map();
function nf(opts) {
  const locale = parametres().formatNombre === 'en' ? 'en-US' : 'fr-CA';
  const cle = locale + JSON.stringify(opts);
  if (!cache.has(cle)) cache.set(cle, new Intl.NumberFormat(locale, opts));
  return cache.get(cle);
}

// Mode discret : les montants en dollars sont masqués (les pourcentages restent visibles).
const masque = () => !!parametres().discret;
const MASQUE = '•••••';

/** Montant dans une devise : « 1 234,56 $ » ou « $1,234.56 ». Ajoute « US » ou « CA » pour lever l'ambiguïté. */
export function argent(v, devise = 'CAD', decimales = 2) {
  if (v == null || !Number.isFinite(v)) return '—';
  if (masque()) return MASQUE + (devise === 'USD' ? ' $ US' : ' $');
  const s = nf({ style: 'currency', currency: devise, currencyDisplay: 'narrowSymbol', minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(v);
  return devise === 'USD' ? s + ' US' : s;
}

/** Montant compact pour le calendrier : « 123,4 k$ ». */
export function argentCompact(v, devise = 'CAD') {
  if (v == null || !Number.isFinite(v)) return '—';
  if (masque()) return '•• $';
  return nf({ style: 'currency', currency: devise, currencyDisplay: 'narrowSymbol', notation: 'compact', maximumFractionDigits: 1 }).format(v);
}

/** Variation signée en argent : « +1 234,56 $ ». */
export function argentSigne(v, devise = 'CAD', decimales = 2) {
  if (v == null || !Number.isFinite(v)) return '—';
  return (v > 0 ? '+' : v < 0 ? '−' : '') + argent(Math.abs(v), devise, decimales);
}

/** Pourcentage signé : « +1,23 % ». */
export function pct(v, decimales = 2) {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = nf({ minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(Math.abs(v));
  const signe = v > 0 ? '+' : v < 0 ? '−' : '';
  return parametres().formatNombre === 'en' ? `${signe}${s}%` : `${signe}${s} %`;
}

export function nombre(v, decimales = 2) {
  if (v == null || !Number.isFinite(v)) return '—';
  return nf({ minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(v);
}

/** Classe CSS « hausse » / « baisse » selon le signe. */
export const sens = (v) => (v > 0 ? 'hausse' : v < 0 ? 'baisse' : '');

const locDate = () => (parametres().formatNombre === 'en' ? 'en-CA' : 'fr-CA');
const TZ = 'America/Toronto';

export function dateHeure(t) {
  return new Intl.DateTimeFormat(locDate(), { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(t);
}
export function dateCourte(t) {
  return new Intl.DateTimeFormat(locDate(), { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(t);
}
export function heure(t) {
  return new Intl.DateTimeFormat(locDate(), { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(t);
}
export function jourMois(t, avecAnnee = false) {
  return new Intl.DateTimeFormat(locDate(), { timeZone: 'UTC', day: 'numeric', month: 'short', ...(avecAnnee ? { year: '2-digit' } : {}) }).format(t);
}
export function moisAnnee(annee, mois) {
  const s = new Intl.DateTimeFormat('fr-CA', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(Date.UTC(annee, mois, 15));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export function dateLongue(iso) {
  const [a, m, j] = iso.split('-').map(Number);
  const s = new Intl.DateTimeFormat('fr-CA', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(Date.UTC(a, m - 1, j));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
