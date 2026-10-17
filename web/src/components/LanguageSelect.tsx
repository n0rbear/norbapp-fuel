"use client";

import { useI18n } from "@/i18n/I18nProvider";
import { LOCALES, isLocale } from "@/i18n/locales";

export function LanguageSelect() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="language">
      <span className="sr-only">{t("language")}</span>
      <span aria-hidden="true">🌐</span>
      <select value={locale} aria-label={t("language")} onChange={(e) => isLocale(e.target.value) && setLocale(e.target.value)}>
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}
