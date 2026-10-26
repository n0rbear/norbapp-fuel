"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { sendEvent } from "@/lib/beacon";

/** Counts page views (path, language, installed app or browser, referring site). */
export function Analytics() {
  const pathname = usePathname();
  const { locale } = useI18n();
  useEffect(() => {
    let referrer: string | undefined;
    try {
      const ref = document.referrer ? new URL(document.referrer) : null;
      if (ref && ref.host !== location.host) referrer = ref.host;
    } catch {
      referrer = undefined;
    }
    // Campaign links, e.g. ?utm_source=facebook&utm_medium=paid&utm_campaign=hazautazas
    const params = new URLSearchParams(window.location.search);
    sendEvent("pageview", {
      path: pathname,
      locale,
      standalone: window.matchMedia("(display-mode: standalone)").matches,
      referrer,
      utm_source: params.get("utm_source") ?? undefined,
      utm_medium: params.get("utm_medium") ?? undefined,
      utm_campaign: params.get("utm_campaign") ?? undefined,
      utm_content: params.get("utm_content") ?? undefined,
    });
    // Once per page, not on language changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  return null;
}
