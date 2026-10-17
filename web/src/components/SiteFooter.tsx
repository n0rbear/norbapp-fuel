"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";
import { ADS_ENABLED, SITE } from "@/lib/site";

type GoogleFc = { callbackQueue?: (() => void)[]; showRevocationMessage?: () => void };

/** Reopens Google's consent message so the visitor can change their choice. */
function openConsent() {
  const w = window as unknown as { googlefc?: GoogleFc };
  w.googlefc = w.googlefc ?? {};
  w.googlefc.callbackQueue = w.googlefc.callbackQueue ?? [];
  w.googlefc.callbackQueue.push(() => w.googlefc?.showRevocationMessage?.());
}

export function SiteFooter() {
  const { t } = useI18n();
  const [mapBefore, mapAfter] = t("footerMapData").split("{osm}");
  return (
    <footer className="siteFooter">
      <div className="siteFooterInner">
        <div className="siteFooterBrand">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG icon */}
          <img src="/icons/icon.svg" alt="" width={32} height={32} />
          <span>{SITE.name}</span>
        </div>
        <div className="siteFooterContact">
          <a href={SITE.homeUrl} target="_blank" rel="noopener">
            norbapp.com
          </a>
          <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
        </div>
        <p className="muted small">
          {t("footerDisclaimer")} {mapBefore}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
            OpenStreetMap
          </a>
          {mapAfter}
        </p>
        <nav className="siteFooterLinks" aria-label={t("legalNav")}>
          <Link href="/impressum">{t("imprint")}</Link>
          <Link href="/privacy">{t("privacy")}</Link>
          <Link href="/sources">{t("sources")}</Link>
          {ADS_ENABLED ? (
            <button type="button" className="linkButton" onClick={openConsent}>
              {t("privacySettings")}
            </button>
          ) : null}
        </nav>
        <p className="siteFooterBuild">
          Build · {SITE.build.branch} · {SITE.build.commit}
        </p>
      </div>
    </footer>
  );
}
