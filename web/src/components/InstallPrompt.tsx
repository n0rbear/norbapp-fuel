"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";

// Chromium's install event (not in the TS DOM types).
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "fuel.installDismissedAt";
const DISMISS_DAYS = 30;
const SHOW_AFTER_MS = 4000;

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support tells them apart.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function recentlyDismissed(): boolean {
  try {
    const at = Number(window.localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(at) && Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/** Invites the visitor to install the PWA: a native prompt where the browser offers one, steps on iOS. */
export function InstallPrompt() {
  const { t } = useI18n();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<"native" | "ios" | null>(null);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      timer = setTimeout(() => setMode("native"), SHOW_AFTER_MS);
    };
    const onInstalled = () => setMode(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (isIos()) timer = setTimeout(() => setMode("ios"), SHOW_AFTER_MS);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!mode) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // storage blocked: it just shows again next time
    }
    setMode(null);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "dismissed") dismiss();
    else setMode(null);
    setInstallEvent(null);
  };

  return (
    <div className="installPrompt" role="dialog" aria-labelledby="install-title">
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG icon */}
      <img src="/icons/icon.svg" alt="" width={44} height={44} />
      <div className="installText">
        <strong id="install-title">{t("installTitle")}</strong>
        <span>{mode === "ios" ? t("installIosSteps") : t("installBody")}</span>
      </div>
      <div className="installActions">
        {mode === "native" ? (
          <button type="button" className="installPrimary" onClick={install}>
            {t("installButton")}
          </button>
        ) : null}
        <button type="button" className="installLater" onClick={dismiss}>
          {t("installLater")}
        </button>
      </div>
    </div>
  );
}
