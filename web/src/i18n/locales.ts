/** The 24 official languages of the EU, with their own names (endonyms). */
export const LOCALES = [
  { code: "bg", name: "български" },
  { code: "cs", name: "čeština" },
  { code: "da", name: "dansk" },
  { code: "de", name: "Deutsch" },
  { code: "el", name: "Ελληνικά" },
  { code: "en", name: "English" },
  { code: "es", name: "español" },
  { code: "et", name: "eesti" },
  { code: "fi", name: "suomi" },
  { code: "fr", name: "français" },
  { code: "ga", name: "Gaeilge" },
  { code: "hr", name: "hrvatski" },
  { code: "hu", name: "magyar" },
  { code: "it", name: "italiano" },
  { code: "lt", name: "lietuvių" },
  { code: "lv", name: "latviešu" },
  { code: "mt", name: "Malti" },
  { code: "nl", name: "Nederlands" },
  { code: "pl", name: "polski" },
  { code: "pt", name: "português" },
  { code: "ro", name: "română" },
  { code: "sk", name: "slovenčina" },
  { code: "sl", name: "slovenščina" },
  { code: "sv", name: "svenska" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];

export const DEFAULT_LOCALE: Locale = "hu";

export const isLocale = (v: string): v is Locale => LOCALES.some((l) => l.code === v);

/** First supported language from the browser's preferences. */
export function detectLocale(languages: readonly string[]): Locale | null {
  for (const tag of languages) {
    const base = tag.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return null;
}
