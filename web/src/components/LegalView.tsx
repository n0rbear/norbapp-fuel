"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";
import { legalTexts, type LegalTexts } from "@/i18n/legal";
import { ADS_ENABLED } from "@/lib/site";

const LINK = /(?<![@\w.])((?:[a-z0-9-]+\.)+(?:org|io|de|com)(?:\/[\w./-]*[\w/])?)/gi;

/** Plain text with bare domains (e.g. openstreetmap.org/copyright) turned into links. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(LINK);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={`https://${part}`} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function LegalView({ page }: { page: keyof Omit<LegalTexts, "onlyIn"> }) {
  const { locale, t } = useI18n();
  const { texts, fallback } = legalTexts(locale);
  const content = texts[page];
  const lang = fallback ? "en" : locale;
  return (
    <main className="page legal" lang={lang}>
      <Link href="/" className="backLink">
        ← {t("backToApp")}
      </Link>
      {fallback ? <p className="notice small">{texts.onlyIn}</p> : null}
      <h1>{content.title}</h1>
      {content.updated ? <p className="muted small">{content.updated}</p> : null}
      {content.sections
        .filter((s) => !s.adsOnly || ADS_ENABLED)
        .map((section) => (
          <section key={section.title} className="card">
            <h2>{section.title}</h2>
            {section.body.map((p) => (
              <p key={p}>
                <Linkified text={p} />
              </p>
            ))}
          </section>
        ))}
    </main>
  );
}
