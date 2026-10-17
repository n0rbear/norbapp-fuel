"use client";

import { useI18n } from "@/i18n/I18nProvider";
import { SITE } from "@/lib/site";

// House ad shown beside the app on wide screens until a paying advertiser
// takes the space. Hungarian, German and English; other languages get English.
const COPY = {
  hu: {
    label: "Hirdetési lehetőség",
    title: "Itt az Ön reklámjának a helye",
    body: "Érje el azokat, akik épp most tervezik európai útjukat – tankolás, útdíj, útvonal.",
    cta: "Hirdetés feladása",
    subject: "Hirdetés – Fuel by NorbApp",
  },
  de: {
    label: "Werbefläche",
    title: "Hier könnte Ihre Werbung stehen",
    body: "Erreichen Sie Autofahrer genau dann, wenn sie ihre Reise durch Europa planen – Tanken, Maut, Route.",
    cta: "Jetzt anfragen",
    subject: "Werbung – Fuel by NorbApp",
  },
  en: {
    label: "Advertising space",
    title: "Your ad could be here",
    body: "Reach drivers right when they plan their trip across Europe – fuel, tolls, route.",
    cta: "Advertise here",
    subject: "Advertising – Fuel by NorbApp",
  },
} as const;

/** Road, fuel pump and route pins, drawn to fill the banner's top half. */
function Artwork({ id }: { id: string }) {
  return (
    <svg className="sideBannerArt" viewBox="0 0 300 300" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b5f61" />
          <stop offset="1" stopColor="#0f8b8d" />
        </linearGradient>
        <linearGradient id={`${id}-road`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d3133" />
          <stop offset="1" stopColor="#13201f" />
        </linearGradient>
      </defs>
      <rect width="300" height="300" fill={`url(#${id}-sky)`} />
      <circle cx="232" cy="74" r="34" fill="#ffd36b" opacity="0.9" />
      <path d="M0 190 L70 128 L120 168 L180 108 L240 160 L300 120 L300 300 L0 300 Z" fill="#0a4f51" opacity="0.7" />
      <path d="M0 214 L90 168 L150 196 L220 150 L300 186 L300 300 L0 300 Z" fill="#083f41" />
      <path d="M128 172 L172 172 L270 300 L30 300 Z" fill={`url(#${id}-road)`} />
      <g stroke="#ffd36b" strokeWidth="5" strokeLinecap="round">
        <line x1="150" y1="182" x2="150" y2="194" />
        <line x1="150" y1="212" x2="150" y2="232" />
        <line x1="150" y1="254" x2="150" y2="284" />
      </g>
      <g transform="translate(34 150)">
        <rect width="44" height="64" rx="8" fill="#ffffff" />
        <rect x="8" y="9" width="28" height="18" rx="3" fill="#0f8b8d" />
        <path d="M44 18 h8 a6 6 0 0 1 6 6 v26 a5 5 0 0 0 10 0 V22 l-9 -9" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g fill="#ffffff">
        <path d="M206 92 a14 14 0 0 1 28 0 c0 12 -14 26 -14 26 s-14 -14 -14 -26 Z" />
        <circle cx="220" cy="92" r="5" fill="#0f8b8d" />
      </g>
      <g fill="#ffffff" opacity="0.85">
        <path d="M96 64 a10 10 0 0 1 20 0 c0 9 -10 19 -10 19 s-10 -10 -10 -19 Z" />
        <circle cx="106" cy="64" r="3.5" fill="#0f8b8d" />
      </g>
      <path d="M106 86 C 130 120, 190 70, 220 120" fill="none" stroke="#ffffff" strokeWidth="3" strokeDasharray="2 8" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

export function SideBanner({ side }: { side: "left" | "right" }) {
  const { locale } = useI18n();
  const copy = locale === "hu" || locale === "de" ? COPY[locale] : COPY.en;
  const href = `mailto:${SITE.email}?subject=${encodeURIComponent(copy.subject)}`;
  return (
    <aside className={`sideBanner sideBanner-${side}`} aria-label={copy.label}>
      <a href={href} className="sideBannerCard">
        <Artwork id={`sb-${side}`} />
        <span className="sideBannerText">
          <span className="sideBannerLabel">{copy.label}</span>
          <strong>{copy.title}</strong>
          <span>{copy.body}</span>
          <span className="sideBannerCta">{copy.cta} →</span>
          <span className="sideBannerMeta">Fuel by NorbApp · 300 × 600</span>
        </span>
      </a>
    </aside>
  );
}

/** The same house ad as a horizontal strip, for screens too narrow for the side banners. */
export function BannerStrip() {
  const { locale } = useI18n();
  const copy = locale === "hu" || locale === "de" ? COPY[locale] : COPY.en;
  const href = `mailto:${SITE.email}?subject=${encodeURIComponent(copy.subject)}`;
  return (
    <aside className="bannerStrip" aria-label={copy.label}>
      <a href={href} className="bannerStripCard">
        <Artwork id="sb-strip" />
        <span className="bannerStripText">
          <span className="sideBannerLabel">{copy.label}</span>
          <strong>{copy.title}</strong>
          <span className="bannerStripBody">{copy.body}</span>
        </span>
        <span className="sideBannerCta">{copy.cta} →</span>
      </a>
    </aside>
  );
}
