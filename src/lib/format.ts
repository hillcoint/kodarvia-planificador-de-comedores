import { roundHalfUp } from '../domain/menu/rounding';

export function money(value: number | undefined | null) {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(roundHalfUp(value, 2));
}

export function number(value: number | undefined | null, decimals = 2) {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(roundHalfUp(value, decimals));
}

export function percent(value: number | undefined | null, decimals = 2) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${number(value * 100, decimals)} %`;
}

export function localDateTime(iso: string) {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function localDate(iso: string) {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(iso));
}

export function tomorrowIso() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}
