"use client";

import { useSyncExternalStore } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { sendEvent } from "@/lib/beacon";
import type { LatLng } from "@/lib/geo";

const noSubscribe = () => () => {};

/** Opens a station in a map / navigation app. */
export function NavMenu({ location, name }: { location: LatLng; name: string }) {
  const { t } = useI18n();
  const android = useSyncExternalStore(
    noSubscribe,
    () => /Android/i.test(navigator.userAgent),
    () => false,
  );
  // A Mac (not an iPad, which also reports "Macintosh" but has touch).
  const mac = useSyncExternalStore(
    noSubscribe,
    () => /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints <= 1,
    () => false,
  );
  const ll = `${location.lat.toFixed(6)},${location.lng.toFixed(6)}`;
  const label = encodeURIComponent(name);
  const links = [
    { id: "google", name: "Google Maps", href: `https://www.google.com/maps/dir/?api=1&destination=${ll}` },
    // Coordinates only: with a name (q=) Apple Maps on macOS searches for it and may route to a same-named place elsewhere.
    {
      id: mac ? "apple-mac" : "apple",
      name: "Apple Maps",
      // Maps on macOS mis-routed the classic daddr link (to Berlin); it gets Apple's newer directions URL.
      href: mac
        ? `https://maps.apple.com/directions?destination=${encodeURIComponent(ll)}&mode=driving`
        : `https://maps.apple.com/?daddr=${ll}&dirflg=d`,
    },
    { id: "waze", name: "Waze", href: `https://waze.com/ul?ll=${ll}&navigate=yes` },
    // Android hands geo: links to any installed map app.
    ...(android ? [{ id: "geo", name: t("otherMapApp"), href: `geo:${ll}?q=${ll}(${label})` }] : []),
  ];
  return (
    <details className="navMenu">
      <summary>🧭 {t("navigate")}</summary>
      <div className="navMenuList">
        {links.map((l) => (
          <a key={l.name} href={l.href} target="_blank" rel="noopener noreferrer" onClick={() => sendEvent("nav", { app: l.id })}>
            {l.name}
          </a>
        ))}
      </div>
    </details>
  );
}
