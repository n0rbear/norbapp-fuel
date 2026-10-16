import type { Currency } from "./api-types";

const num1 = new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 1 });

const SYMBOL: Partial<Record<Currency, string>> = { EUR: "€", HUF: "Ft" };

/** Unit price decimals: 3 for EUR (1,789 €/l), 2 for the rest (FUEL-API rounding). */
const unitDecimals = (c: Currency) => (c === "EUR" ? 3 : 2);

export const currencySymbol = (c: Currency) => SYMBOL[c] ?? c;

export function formatMoney(v: number, c: Currency): string {
  const decimals = c === "HUF" ? 0 : 2;
  const n = new Intl.NumberFormat("hu-HU", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${n.format(v)} ${currencySymbol(c)}`;
}

export function formatPricePerLitre(v: number, c: Currency): string {
  const d = unitDecimals(c);
  const n = new Intl.NumberFormat("hu-HU", { minimumFractionDigits: d, maximumFractionDigits: d });
  return `${n.format(v)} ${currencySymbol(c)}/l`;
}

export const formatKm = (v: number) => `${num1.format(v)} km`;
export const formatLitres = (v: number) => `${num1.format(v)} l`;

export function formatDuration(totalSec: number): string {
  const minutes = Math.round(totalSec / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} ó ${m} p` : `${m} p`;
}

/** Writes a number the way users type it in the inputs ("1,7"). */
export function toInputDecimal(v: number, decimals: number): string {
  return String(Number(v.toFixed(decimals))).replace(".", ",");
}
