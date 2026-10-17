import type { Locale } from "./locales";

// House-ad banners and the /advertise page: Hungarian, German and English;
// every other interface language shows English.
const COPY = {
  hu: {
    label: "Hirdetési lehetőség",
    title: "Itt az Ön reklámjának a helye",
    body: "Érje el azokat, akik épp most tervezik európai útjukat – tankolás, útdíj, útvonal.",
    cta: "Hirdetés feladása",
    subject: "Hirdetés – Fuel by NorbApp",
    pageTitle: "Hirdessen a Fuel by NorbAppon",
    pageIntro:
      "A Fuel by NorbApp útiköltség-kalkulátor: az autósok itt tervezik meg az útvonalukat, a tankolásokat és az útdíjakat, mielőtt elindulnak Európában. A hirdetése pont akkor jelenik meg, amikor az utazásról döntenek.",
    placesTitle: "Hirdetési helyek",
    places: [
      "Két álló banner az alkalmazás két oldalán, széles képernyőn (300 × 600 px), görgetéskor is látható.",
      "Vízszintes banner a kalkulátor alatt telefonon és tableten.",
      "A felület 24 uniós nyelven érhető el, a hirdetés nyelvenként is eltérhet.",
    ],
    fitTitle: "Kiknek ajánljuk",
    fit: "Benzinkutaknak, autópálya-matricát és útdíjat árusítóknak, szállásoknak és éttermeknek útvonal mentén, autós szolgáltatóknak, biztosítóknak, utazási irodáknak.",
    contactTitle: "Kapcsolat",
    contactText: "Írjon nekünk, és elküldjük az árakat és a részleteket.",
    writeEmail: "E-mail írása",
    copyEmail: "Cím másolása",
    copied: "Másolva",
    telegram: "Telegram",
  },
  de: {
    label: "Werbefläche",
    title: "Hier könnte Ihre Werbung stehen",
    body: "Erreichen Sie Autofahrer genau dann, wenn sie ihre Reise durch Europa planen – Tanken, Maut, Route.",
    cta: "Jetzt anfragen",
    subject: "Werbung – Fuel by NorbApp",
    pageTitle: "Werben auf Fuel by NorbApp",
    pageIntro:
      "Fuel by NorbApp ist ein Reisekostenrechner: Autofahrer planen hier Route, Tankstopps und Maut, bevor sie durch Europa fahren. Ihre Anzeige erscheint genau dann, wenn über die Reise entschieden wird.",
    placesTitle: "Werbeflächen",
    places: [
      "Zwei Hochformat-Banner links und rechts der App auf breiten Bildschirmen (300 × 600 px), auch beim Scrollen sichtbar.",
      "Ein Querbanner unter dem Rechner auf Smartphone und Tablet.",
      "Die Oberfläche gibt es in 24 EU-Sprachen; die Anzeige kann je Sprache unterschiedlich sein.",
    ],
    fitTitle: "Für wen es passt",
    fit: "Tankstellen, Vignetten- und Mautanbieter, Unterkünfte und Restaurants entlang der Route, Werkstätten und Autoservices, Versicherungen, Reiseveranstalter.",
    contactTitle: "Kontakt",
    contactText: "Schreiben Sie uns – wir schicken Ihnen Preise und Details.",
    writeEmail: "E-Mail schreiben",
    copyEmail: "Adresse kopieren",
    copied: "Kopiert",
    telegram: "Telegram",
  },
  en: {
    label: "Advertising space",
    title: "Your ad could be here",
    body: "Reach drivers right when they plan their trip across Europe – fuel, tolls, route.",
    cta: "Advertise here",
    subject: "Advertising – Fuel by NorbApp",
    pageTitle: "Advertise on Fuel by NorbApp",
    pageIntro:
      "Fuel by NorbApp is a trip cost calculator: drivers plan their route, refuelling stops and tolls here before they set off across Europe. Your ad appears exactly when they are deciding about the trip.",
    placesTitle: "Ad placements",
    places: [
      "Two tall banners on both sides of the app on wide screens (300 × 600 px), visible while scrolling.",
      "A horizontal banner below the calculator on phones and tablets.",
      "The interface is available in 24 EU languages; your ad can differ per language.",
    ],
    fitTitle: "A good fit for",
    fit: "Fuel stations, vignette and toll sellers, hotels and restaurants along the way, garages and car services, insurers, travel agencies.",
    contactTitle: "Contact",
    contactText: "Write to us and we will send you prices and details.",
    writeEmail: "Write an e-mail",
    copyEmail: "Copy address",
    copied: "Copied",
    telegram: "Telegram",
  },
} as const;

export type AdvertiseCopy = (typeof COPY)[keyof typeof COPY];

export function advertiseCopy(locale: Locale): AdvertiseCopy {
  return locale === "hu" || locale === "de" ? COPY[locale] : COPY.en;
}
