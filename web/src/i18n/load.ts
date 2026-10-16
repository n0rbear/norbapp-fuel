import type { Locale } from "./locales";
import { hu, type Messages } from "./messages/hu";

/** Catalogues are loaded on demand so the page ships only the chosen language. */
export async function loadMessages(locale: Locale): Promise<Messages> {
  switch (locale) {
    case "hu": return hu;
    case "bg": return (await import("./messages/bg")).bg;
    case "cs": return (await import("./messages/cs")).cs;
    case "da": return (await import("./messages/da")).da;
    case "de": return (await import("./messages/de")).de;
    case "el": return (await import("./messages/el")).el;
    case "en": return (await import("./messages/en")).en;
    case "es": return (await import("./messages/es")).es;
    case "et": return (await import("./messages/et")).et;
    case "fi": return (await import("./messages/fi")).fi;
    case "fr": return (await import("./messages/fr")).fr;
    case "ga": return (await import("./messages/ga")).ga;
    case "hr": return (await import("./messages/hr")).hr;
    case "it": return (await import("./messages/it")).it;
    case "lt": return (await import("./messages/lt")).lt;
    case "lv": return (await import("./messages/lv")).lv;
    case "mt": return (await import("./messages/mt")).mt;
    case "nl": return (await import("./messages/nl")).nl;
    case "pl": return (await import("./messages/pl")).pl;
    case "pt": return (await import("./messages/pt")).pt;
    case "ro": return (await import("./messages/ro")).ro;
    case "sk": return (await import("./messages/sk")).sk;
    case "sl": return (await import("./messages/sl")).sl;
    case "sv": return (await import("./messages/sv")).sv;
  }
}
