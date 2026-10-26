"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { fillTemplate, makeFormatters, type Formatters, type Translate } from "./format";
import { loadMessages } from "./load";
import { DEFAULT_LOCALE, detectLocale, isLocale, type Locale } from "./locales";
import type { AppMessage } from "./message";
import { hu, type Messages } from "./messages/hu";

type I18n = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
  /** Translates a server message; `country`/`countries` params become names. */
  tm: (message: AppMessage) => string;
  fmt: Formatters;
};

const I18nContext = createContext<I18n | null>(null);

const noop = () => () => {};

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [stored, setStored] = usePersistentState<Locale | "">("fuel.locale", "", (v): v is Locale | "" => v === "" || isLocale(v));
  // Browser preference is only known on the client; the server renders Hungarian.
  const browser = useSyncExternalStore(noop, () => detectLocale(navigator.languages ?? [navigator.language]), () => null);
  // A shared link like /?lang=de opens in that language (until the visitor picks one).
  const fromUrl = useSyncExternalStore(
    noop,
    () => {
      const v = new URLSearchParams(window.location.search).get("lang");
      return v && isLocale(v) ? v : null;
    },
    () => null,
  );
  const locale: Locale = stored || fromUrl || browser || DEFAULT_LOCALE;

  const [loaded, setLoaded] = useState<{ locale: Locale; messages: Messages }>({ locale: "hu", messages: hu });
  useEffect(() => {
    let cancelled = false;
    loadMessages(locale).then((messages) => {
      if (!cancelled) setLoaded({ locale, messages });
    });
    document.documentElement.lang = locale;
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const active = loaded.locale === locale ? loaded : { locale: loaded.locale, messages: loaded.messages };
  const t = useCallback<Translate>(
    (key, params) => fillTemplate(active.messages[key] ?? hu[key], params),
    [active.messages],
  );
  const fmt = useMemo(() => makeFormatters(active.locale, t), [active.locale, t]);
  const tm = useCallback(
    (message: AppMessage) => {
      if (!(message.code in hu)) return t("unexpectedError");
      const params = { ...message.params };
      if (typeof params.country === "string") params.country = fmt.countryName(params.country);
      if (typeof params.countries === "string") {
        params.countries = params.countries.split(",").filter(Boolean).map(fmt.countryName).join(", ");
      }
      return t(message.code, params);
    },
    [t, fmt],
  );

  const value = useMemo<I18n>(
    () => ({ locale, setLocale: (l) => setStored(l), t, tm, fmt }),
    [locale, setStored, t, tm, fmt],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
