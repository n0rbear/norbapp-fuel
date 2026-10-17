"use client";

import { useI18n } from "@/i18n/I18nProvider";
import { LanguageSelect } from "./LanguageSelect";
import { Planner } from "./Planner";

export function Home() {
  const { t } = useI18n();
  const [mapBefore, mapAfter] = t("footerMapData").split("{osm}");
  return (
    <main className="page">
      <div className="topbar">
        <LanguageSelect />
      </div>
      <header className="masthead">
        <p className="brand">{t("brand")}</p>
        <h1>{t("title")}</h1>
        <p className="muted">{t("subtitle")}</p>
      </header>
      <Planner />
      <footer className="footer muted small">
        {t("footerDisclaimer")} {mapBefore}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          OpenStreetMap
        </a>
        {mapAfter} · {t("footerRouting")}: OSRM, Valhalla · {t("footerSearch")}: Photon · {t("footerPricesTolls")}: NorbApp
        FUEL-API (Tankerkönig/MTS-K CC BY 4.0, E-Control, EU Weekly Oil Bulletin, TCS, ECB).
      </footer>
    </main>
  );
}
