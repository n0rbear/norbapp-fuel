"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { advertiseCopy } from "@/i18n/advertise";
import { SITE } from "@/lib/site";

export function AdvertiseView() {
  const { locale, t } = useI18n();
  const copy = advertiseCopy(locale);
  const [copied, setCopied] = useState(false);
  const lang = locale === "hu" || locale === "de" ? locale : "en";
  const mailto = `mailto:${SITE.email}?subject=${encodeURIComponent(copy.subject)}`;

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(SITE.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the address is shown on the page anyway.
    }
  };

  return (
    <main className="page legal advertise" lang={lang}>
      <Link href="/" className="backLink">
        ← {t("backToApp")}
      </Link>
      <h1>{copy.pageTitle}</h1>
      <p className="lead">{copy.pageIntro}</p>
      <section className="card">
        <h2>{copy.placesTitle}</h2>
        <ul className="advertiseList">
          {copy.places.map((place) => (
            <li key={place}>{place}</li>
          ))}
        </ul>
      </section>
      <section className="card">
        <h2>{copy.fitTitle}</h2>
        <p>{copy.fit}</p>
      </section>
      <section className="card">
        <h2>{copy.contactTitle}</h2>
        <p>{copy.contactText}</p>
        <p className="advertiseEmail">{SITE.email}</p>
        <div className="advertiseActions">
          <a className="primary advertiseButton" href={mailto}>
            {copy.writeEmail}
          </a>
          <button type="button" className="advertiseButton secondary" onClick={copyEmail}>
            {copied ? `✓ ${copy.copied}` : copy.copyEmail}
          </button>
          <a className="advertiseButton secondary" href={SITE.telegramUrl} target="_blank" rel="noopener noreferrer">
            {copy.telegram}
          </a>
        </div>
      </section>
    </main>
  );
}
