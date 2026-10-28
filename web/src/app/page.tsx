import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Home } from "@/components/Home";

// Link previews (Facebook, Messenger, WhatsApp…) per language: share
// https://fuel.norbapp.com/?lang=de for German, ?lang=en for English.
const SHARE = {
  hu: {
    title: "Fuel by NorbApp – Mennyibe kerül az út?",
    description:
      "Útvonal, tankolás a legolcsóbb kutaknál, matricák és útdíjak – egy kattintással. 36 európai ország a Balkánnal és Törökországgal, ingyenes, regisztráció nélkül.",
    locale: "hu_HU",
  },
  de: {
    title: "Fuel by NorbApp – Was kostet die Fahrt?",
    description:
      "Route, Tankstopps an den günstigsten Tankstellen, Vignetten und Maut – mit einem Klick. 36 europäische Länder inkl. Balkan und Türkei, kostenlos, ohne Anmeldung.",
    locale: "de_DE",
  },
  en: {
    title: "Fuel by NorbApp – What will the trip cost?",
    description:
      "Route, fuel stops at the cheapest stations, vignettes and tolls – in one click. 36 European countries incl. the Balkans and Turkey, free, no sign-up.",
    locale: "en_GB",
  },
} as const;

type Props = { searchParams: Promise<{ lang?: string | string[] }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const raw = (await searchParams).lang;
  const lang = typeof raw === "string" && raw in SHARE ? (raw as keyof typeof SHARE) : "hu";
  const share = SHARE[lang];
  const url = lang === "hu" ? "/" : `/?lang=${lang}`;
  return {
    title: share.title,
    description: share.description,
    alternates: { canonical: url, languages: { hu: "/?lang=hu", de: "/?lang=de", en: "/?lang=en", "x-default": "/" } },
    openGraph: {
      type: "website",
      siteName: "Fuel by NorbApp",
      url,
      title: share.title,
      description: share.description,
      locale: share.locale,
      images: [{ url: `/og/${lang}.png`, width: 1200, height: 630, alt: share.title }],
    },
    twitter: { card: "summary_large_image", title: share.title, description: share.description, images: [`/og/${lang}.png`] },
  };
}

/** Marks the request as dynamic, so the per-language metadata is computed per request; the page itself stays prerendered. */
async function RequestTime() {
  await connection();
  return null;
}

export default function Page() {
  return (
    <>
      <Home />
      <Suspense fallback={null}>
        <RequestTime />
      </Suspense>
    </>
  );
}
