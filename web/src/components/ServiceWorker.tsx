"use client";

import { useEffect } from "react";

/** Registers the service worker (production only, so dev builds are never cached). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Installability is a nice-to-have; the app works without it.
    });
  }, []);
  return null;
}
