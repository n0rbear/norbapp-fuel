"use client";

import { useI18n } from "@/i18n/I18nProvider";
import { AdSlot } from "./AdSlot";
import { Planner } from "./Planner";

export function Home() {
  const { t } = useI18n();
  return (
    <main className="page">
      <header className="masthead">
        <h1>{t("title")}</h1>
        <p className="muted">{t("subtitle")}</p>
      </header>
      <AdSlot slot="top" />
      <Planner />
      <AdSlot slot="bottom" />
    </main>
  );
}
