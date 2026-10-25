"use client";

import { useSyncExternalStore } from "react";
import { useI18n } from "@/i18n/I18nProvider";
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
  const ll = `${location.lat.toFixed(6)},${location.lng.toFixed(6)}`;
  const label = encodeURIComponent(name);
  const links = [
    { name: "Google Maps", href: `https://www.google.com/maps/dir/?api=1&destination=${ll}` },
    { name: "Apple Maps", href: `https://maps.apple.com/?daddr=${ll}&q=${label}` },
    { name: "Waze", href: `https://waze.com/ul?ll=${ll}&navigate=yes` },
    // Android hands geo: links to any installed map app.
    ...(android ? [{ name: t("otherMapApp"), href: `geo:${ll}?q=${ll}(${label})` }] : []),
  ];
  return (
    <details className="navMenu">
      <summary>🧭 {t("navigate")}</summary>
      <div className="navMenuList">
        {links.map((l) => (
          <a key={l.name} href={l.href} target="_blank" rel="noopener noreferrer">
            {l.name}
          </a>
        ))}
      </div>
    </details>
  );
}
