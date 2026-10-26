"use client";

import { useI18n } from "@/i18n/I18nProvider";
import { LOCALES, isLocale } from "@/i18n/locales";
import { sendEvent } from "@/lib/beacon";

export function LanguageSelect() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="language">
      <span className="sr-only">{t("language")}</span>
      <span aria-hidden="true">🌐</span>
      <select value={locale} aria-label={t("language")} onChange={(e) => {
          const next = e.target.value;
          if (!isLocale(next)) return;
          sendEvent("language", { from: locale, to: next });
          setLocale(next);
        }}>
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}
