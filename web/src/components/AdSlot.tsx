"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { ADS, ADS_ENABLED } from "@/lib/site";

type Props = { slot: keyof typeof ADS.slots };

/**
 * A responsive AdSense unit. Renders nothing until ads are configured, and
 * reserves its height so the page does not jump when the ad loads.
 */
export function AdSlot({ slot }: Props) {
  const { t } = useI18n();
  const ref = useRef<HTMLModElement>(null);
  const slotId = ADS.slots[slot];

  useEffect(() => {
    if (!ADS_ENABLED || !slotId || !ref.current || ref.current.dataset.adsbygoogleStatus) return;
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      (w.adsbygoogle = w.adsbygoogle ?? []).push({});
    } catch {
      // ad blockers or a not-yet-loaded script: leave the slot empty
    }
  }, [slotId]);

  if (!ADS_ENABLED || !slotId) return null;
  return (
    <aside className="adSlot" aria-label={t("advertisement")}>
      <span className="adLabel">{t("advertisement")}</span>
      <ins
        ref={ref}
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={ADS.client}
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
