import type { Currency } from "../lib/api-types";
import type { Locale } from "./locales";
import type { MessageKey } from "./messages/hu";

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

export function fillTemplate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

/** Locale-aware formatters for the result view. */
export function makeFormatters(locale: Locale, t: Translate) {
  const number = (digits: number, min = 0) =>
    new Intl.NumberFormat(locale, { minimumFractionDigits: min, maximumFractionDigits: digits });
  let regions: Intl.DisplayNames | null = null;
  try {
    regions = new Intl.DisplayNames([locale, "en"], { type: "region" });
  } catch {
    regions = null;
  }
  const moneyDigits = (c: Currency | string) => (c === "HUF" ? 0 : 2);
  const money = (v: number, c: Currency | string, digits = moneyDigits(c)) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: c,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(v);

  return {
    money: (v: number, c: Currency) => money(v, c),
    /** Unit prices: 3 decimals in EUR (1.789 €/l), 2 otherwise (FUEL-API rounding). */
    pricePerLitre: (v: number, c: Currency | string) => `${money(v, c, c === "EUR" ? 3 : 2)}/l`,
    km: (v: number) => `${number(1).format(v)} km`,
    litres: (v: number) => `${number(1).format(v)} l`,
    decimal: (v: number, digits: number) => number(digits).format(v),
    duration: (totalSec: number) => {
      const minutes = Math.round(totalSec / 60);
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return h > 0 ? t("durationHM", { h, m }) : t("durationM", { m });
    },
    countryName: (code: string) => {
      try {
        return regions?.of(code) ?? code;
      } catch {
        return code;
      }
    },
    currencySymbol: (c: Currency | string) =>
      new Intl.NumberFormat(locale, { style: "currency", currency: c, currencyDisplay: "narrowSymbol" })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? c,
  };
}

export type Formatters = ReturnType<typeof makeFormatters>;
