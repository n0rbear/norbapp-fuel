export type VignetteInfo = {
  country: string;
  name: string;
  /** Approximate price of the shortest passenger-car vignette, in EUR. */
  priceEur: number;
  validity: string;
};

/**
 * Approximate, user-editable defaults. Prices change yearly and some are set in
 * local currency — the UI tells users to verify them.
 */
export const VIGNETTES: Record<string, VignetteInfo> = {
  AT: { country: "AT", name: "Ausztria", priceEur: 12.8, validity: "10 napos" },
  HU: { country: "HU", name: "Magyarország", priceEur: 14, validity: "10 napos (D1)" },
  SK: { country: "SK", name: "Szlovákia", priceEur: 12, validity: "10 napos" },
  CZ: { country: "CZ", name: "Csehország", priceEur: 11, validity: "10 napos" },
  SI: { country: "SI", name: "Szlovénia", priceEur: 16, validity: "7 napos" },
  CH: { country: "CH", name: "Svájc", priceEur: 43, validity: "éves" },
  RO: { country: "RO", name: "Románia", priceEur: 6, validity: "7 napos" },
  BG: { country: "BG", name: "Bulgária", priceEur: 8, validity: "hétvégi/heti" },
};

const COUNTRY_NAMES: Record<string, string> = {
  DE: "Németország",
  IT: "Olaszország",
  HR: "Horvátország",
  RS: "Szerbia",
  PL: "Lengyelország",
  FR: "Franciaország",
  NL: "Hollandia",
  BE: "Belgium",
  UA: "Ukrajna",
  ...Object.fromEntries(Object.values(VIGNETTES).map((v) => [v.country, v.name])),
};

export function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}

export function vignetteFor(code: string): VignetteInfo | null {
  return VIGNETTES[code] ?? null;
}
