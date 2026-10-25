"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { CommunityStation, CommunityStationsResponse, Currency, ReportResult } from "@/lib/api-types";
import type { LatLng } from "@/lib/geo";
import { parseDecimal } from "@/lib/pricing";
import type { FuelType } from "@/lib/trip";
import { NavMenu } from "./NavMenu";

const DEVICE_KEY = "fuel.deviceId";

/** A random, anonymous id for this browser – lets several devices confirm a price. */
function deviceId(): string {
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

type Props = {
  country: string;
  location: LatLng;
  where: "city" | "highway";
  fuel: FuelType;
  currency: Currency;
  /** Stops can pick a station; the start point only shows them. */
  selectable: boolean;
  selectedId: string | undefined;
  onSelect: (id: string | undefined) => void;
  onLoaded: (stations: CommunityStation[]) => void;
};

type Feedback = { id: string; key: "reportThanks" | "reportConfirmedNow" | "reportImplausible" | "reportFailed" | "tooManyRequests" };

export function CommunityStations({ country, location, where, fuel, currency, selectable, selectedId, onSelect, onLoaded }: Props) {
  const { t, fmt, locale } = useI18n();
  const [data, setData] = useState<CommunityStationsResponse | null>(null);
  const [form, setForm] = useState<{ id: string; value: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // Bumped after a report so the list (and the cost) shows the new state.
  const [reloadKey, setReloadKey] = useState(0);
  const load = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    const q = new URLSearchParams({
      country,
      lat: location.lat.toFixed(5),
      lng: location.lng.toFixed(5),
      fuel,
      currency,
      where,
    });
    fetch(`/api/community/stations?${q}`)
      .then((res) => (res.ok ? (res.json() as Promise<CommunityStationsResponse>) : null))
      .then((body) => {
        if (cancelled || !body) return;
        setData(body);
        onLoaded(body.stations);
      })
      .catch(() => {
        // stations are an extra; the estimate stays
      });
    return () => {
      cancelled = true;
    };
  }, [country, location.lat, location.lng, fuel, currency, where, onLoaded, reloadKey]);

  if (!data || data.stations.length === 0) return null;

  const time = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

  const send = async (station: CommunityStation, price: number) => {
    setSending(true);
    try {
      const res = await fetch("/api/community/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stationId: station.id,
          country,
          fuel,
          currency,
          where,
          price,
          lat: station.location.lat,
          lng: station.location.lng,
          deviceId: deviceId(),
        }),
      });
      if (res.status === 429) {
        setFeedback({ id: station.id, key: "tooManyRequests" });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const { status } = (await res.json()) as ReportResult;
      setFeedback({
        id: station.id,
        key: status === "confirmed" ? "reportConfirmedNow" : status === "implausible" ? "reportImplausible" : "reportThanks",
      });
      if (status !== "implausible") {
        setForm(null);
        load();
      }
    } catch {
      setFeedback({ id: station.id, key: "reportFailed" });
    } finally {
      setSending(false);
    }
  };

  const formPrice = form ? parseDecimal(form.value) : null;

  return (
    <div className="community">
      <p className="community-title">
        <strong>{t("nearbyStations")}</strong>
      </p>
      {data.reportable && <p className="muted small">{t("communityNote")}</p>}
      <ul className="community-list">
        {data.stations.map((s) => {
          const isOn = selectedId === s.id;
          return (
            <li key={s.id} className={`community-station${isOn ? " on" : ""}`}>
              <div className="community-head">
                <span className="station-name">{s.name}</span>
                <span className="station-price">{fmt.pricePerLitre(s.price, currency)}</span>
              </div>
              <span className="muted small">
                {[s.address, fmt.km(s.distanceKm)].filter(Boolean).join(" · ")}
              </span>
              <span className={`small price-kind ${s.priceKind}`}>
                {s.priceKind === "confirmed" && s.confirmedAt
                  ? `✓ ${t("priceConfirmed", { time: time(s.confirmedAt), n: s.reporters })}`
                  : s.priceKind === "learned" && s.confirmedAt
                    ? t("priceLearned", { time: time(s.confirmedAt) })
                    : t("priceEstimated")}
              </span>

              {s.pending && data.reportable && (
                <div className="community-pending small">
                  <span>{t("reportedByOthers", { price: fmt.pricePerLitre(s.pending.price, currency) })}</span>
                  <span className="community-actions">
                    <button type="button" className="secondary small-btn" disabled={sending} onClick={() => send(s, s.pending!.price)}>
                      {t("confirmPrice")}
                    </button>
                    <button type="button" className="secondary small-btn" onClick={() => setForm({ id: s.id, value: "" })}>
                      {t("correctPrice")}
                    </button>
                  </span>
                </div>
              )}

              {form?.id === s.id ? (
                <form
                  className="community-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (formPrice !== null && formPrice > 0) void send(s, formPrice);
                  }}
                >
                  <label>
                    <span className="small">{t("yourPrice", { currency: fmt.currencySymbol(currency) })}</span>
                    <input
                      inputMode="decimal"
                      autoFocus
                      value={form.value}
                      onChange={(e) => setForm({ id: s.id, value: e.target.value.slice(0, 10) })}
                    />
                  </label>
                  <span className="community-actions">
                    <button type="submit" className="small-btn" disabled={sending || formPrice === null || formPrice <= 0}>
                      {t("send")}
                    </button>
                    <button type="button" className="secondary small-btn" onClick={() => setForm(null)}>
                      {t("cancel")}
                    </button>
                  </span>
                </form>
              ) : null}

              {feedback?.id === s.id && <p className="small community-feedback">{t(feedback.key)}</p>}

              <div className="community-actions">
                {selectable && (
                  <button type="button" className={`small-btn${isOn ? "" : " secondary"}`} aria-pressed={isOn} onClick={() => onSelect(isOn ? undefined : s.id)}>
                    {isOn ? `✓ ${t("stationSelected")}` : t("useStation")}
                  </button>
                )}
                {data.reportable && form?.id !== s.id && (
                  <button type="button" className="secondary small-btn" onClick={() => setForm({ id: s.id, value: "" })}>
                    {t("reportPrice")}
                  </button>
                )}
                <NavMenu location={s.location} name={s.name} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
