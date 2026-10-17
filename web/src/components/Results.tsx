"use client";

import { useEffect, useMemo, useState } from "react";
import { usePersistentState } from "@/hooks/usePersistentState";
import { useI18n } from "@/i18n/I18nProvider";
import { msg, type AppMessage } from "@/i18n/message";
import type { MessageKey } from "@/i18n/messages/hu";
import { EURO_CLASSES, euroClassLabel, type ApiError, type EuroClass, type PlanRequest, type PlanResponse, type TollEstimate } from "@/lib/api-types";
import { toInputDecimal } from "@/lib/format";
import { parseDecimal, resolvePrices } from "@/lib/pricing";
import { computeFuelCost, type PriceSource } from "@/lib/trip";

const SOURCE_LABEL: Record<PriceSource, MessageKey> = {
  manual: "sourceManual",
  station: "sourceStation",
  cheapest: "sourceCheapest",
  average: "sourceAverage",
  estimate: "sourceEstimate",
  default: "sourceDefault",
};

/** Default fallback price (EUR/l) where no price data exists, converted to the chosen currency. */
const FALLBACK_EUR = 1.7;

function attribution(source: string, estimateLabel: string): string {
  // Tankerkönig data is CC BY 4.0 and must be credited this way.
  if (/tankerk/i.test(source)) return "Daten: MTS-K / Tankerkönig (CC BY 4.0)";
  return source === "EU Weekly Oil Bulletin" ? estimateLabel : source;
}

type Props = {
  request: PlanRequest;
  data: PlanResponse;
  stale: boolean;
  euroClass: EuroClass | null;
  onEuroClassChange: (value: EuroClass) => void;
  /** A re-plan (e.g. a toll preference change) is running. */
  loading: boolean;
  onAvoidTollsChange: (country: string, avoidTolls: boolean) => void;
};

export function Results({ request, data, stale, euroClass, onEuroClassChange, loading, onAvoidTollsChange }: Props) {
  const { t, tm, fmt } = useI18n();
  const currency = data.currency;
  const [selected, setSelected] = useState<Record<number, string | undefined>>({});
  const [manualPrice, setManualPrice] = useState("");
  const [defaultPrice, setDefaultPrice] = useState(() =>
    toInputDecimal(FALLBACK_EUR * (data.rate ?? 1), currency === "HUF" ? 0 : 2),
  );

  const manual = parseDecimal(manualPrice);
  const fallback = parseDecimal(defaultPrice);
  const manualInvalid = manualPrice.trim() !== "" && (manual === null || manual <= 0);
  const fallbackInvalid = fallback === null || fallback <= 0;

  const cost = useMemo(() => {
    const prices = resolvePrices(data.points, {
      manualPrice: manualInvalid ? null : manual,
      defaultPrice: fallbackInvalid ? 0 : fallback!,
      selected,
    });
    return computeFuelCost(data.plan, request.vehicle.consumption, prices);
  }, [data, request.vehicle.consumption, manual, manualInvalid, fallback, fallbackInvalid, selected]);

  const tolls = useTolls(data, euroClass);
  const tollCost = tolls.result?.status === "ok" ? tolls.includedTotal : 0;

  const usesDefault = cost.segments.some((s) => s.source === "default");
  const sources = [...new Set(data.points.map((p) => p.prices.source).filter((s): s is string => !!s))];

  return (
    <section className="card results" aria-live="polite">
      {stale && <p className="notice">{t("stale")}</p>}

      <h2>{t("result")}</h2>
      <div className="stats">
        <Stat label={t("distance")} value={fmt.km(data.distanceKm)} />
        <Stat label={t("duration")} value={fmt.duration(data.durationSec)} />
        <Stat label={t("fuelUsed")} value={fmt.litres(data.plan.totalLitres)} />
        <Stat label={t("fuelCost")} value={fmt.money(cost.fuelCost, currency)} />
        <Stat label={t("tolls")} value={tolls.loading ? "…" : fmt.money(tollCost, currency)} />
        <Stat label={t("total")} value={fmt.money(cost.fuelCost + tollCost, currency)} highlight />
      </div>
      <p className="hint">
        {t("costNote")}
        {data.plan.stops.length > 0 && <> {t("paidAtStops", { amount: fmt.money(cost.paidAtStops, currency) })}</>}
        {usesDefault && <> {t("defaultUsedNote")}</>}
      </p>

      {data.warnings.map((w, i) => (
        <p key={i} className="notice">
          {tm(w)}
        </p>
      ))}

      <h3>{t("prices")}</h3>
      <div className="grid">
        <div className="field">
          <label htmlFor="manual-price">{t("manualPrice")}</label>
          <div className="unit-input">
            <input
              id="manual-price"
              inputMode="decimal"
              placeholder={t("manualPlaceholder")}
              value={manualPrice}
              aria-invalid={manualInvalid}
              onChange={(e) => setManualPrice(e.target.value)}
            />
            <span>{fmt.currencySymbol(currency)}/l</span>
          </div>
          {manualInvalid && <small className="error">{t("invalidPrice")}</small>}
        </div>
        <div className="field">
          <label htmlFor="default-price">{t("defaultPrice")}</label>
          <div className="unit-input">
            <input
              id="default-price"
              inputMode="decimal"
              value={defaultPrice}
              aria-invalid={fallbackInvalid}
              onChange={(e) => setDefaultPrice(e.target.value)}
            />
            <span>{fmt.currencySymbol(currency)}/l</span>
          </div>
          {fallbackInvalid && <small className="error">{t("enterValidPrice")}</small>}
        </div>
      </div>

      <h3>{t("refuelling")}</h3>
      <ol className="points">
        {data.points.map((point, i) => {
          const segment = cost.segments[i];
          const stop = i > 0 ? cost.stops[i - 1] : null;
          const { prices } = point;
          return (
            <li key={i}>
              <div className="point-head">
                <strong>
                  {point.kind === "start"
                    ? t("startTank", { litres: fmt.litres(data.plan.startLitres), pct: request.vehicle.startLevelPct })
                    : point.km < 0.5
                      ? t("stopBeforeStart", { n: i })
                      : t("stopAtKm", { n: i, km: fmt.km(point.km) })}
                </strong>
                <span className="muted">{point.country ? fmt.countryName(point.country) : t("unknownCountry")}</span>
              </div>
              <div className="point-meta">
                {stop && <span>{t("toFill", { litres: fmt.litres(stop.litres) })}</span>}
                <span>
                  {fmt.pricePerLitre(segment.price, currency)}{" "}
                  <span className="badge">{t(SOURCE_LABEL[segment.source])}</span>
                </span>
              </div>

              {point.kind === "start" && (
                <p className="muted small">{t("startNotRefuel")}</p>
              )}
              {prices.e5InsteadOfE10 && <p className="muted small">{t("e5InsteadOfE10")}</p>}
              {prices.mode === "estimate" && (
                <p className="muted small">
                  {t("estimateRange", {
                    where: t(prices.estimate.location === "highway" ? "whereHighway" : "whereCity"),
                    low: fmt.pricePerLitre(prices.estimate.low, currency),
                    high: fmt.pricePerLitre(prices.estimate.high, currency),
                  })}
                </p>
              )}
              {prices.mode === "none" && <p className="muted small">{tm(prices.reason)}</p>}
              {point.kind === "stop" && prices.stations.length > 0 && (
                <div className="stations" role="radiogroup" aria-label={t("chooseStation")}>
                  {prices.stations.map((s) => {
                    const isOn = selected[i] === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="radio"
                        aria-checked={isOn}
                        className={`station${isOn ? " on" : ""}`}
                        disabled={s.price === null}
                        onClick={() => setSelected((sel) => ({ ...sel, [i]: isOn ? undefined : s.id }))}
                      >
                        <span className="station-name">{s.name}</span>
                        <span className="station-price">
                          {s.price !== null ? fmt.pricePerLitre(s.price, currency) : t("noPrice")}
                        </span>
                        <span className="muted small">
                          {s.address}
                          {s.distanceKm !== null && ` · ${fmt.km(s.distanceKm)}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {sources.length > 0 && (
        <p className="hint">
          {t("priceSource", { sources: sources.map((s) => attribution(s, t("estimateSource"))).join(" · ") })}
        </p>
      )}

      <h3>{t("tolls")}</h3>
      <Tolls
        tolls={tolls}
        currency={currency}
        euroClass={euroClass}
        onEuroClassChange={onEuroClassChange}
        data={data}
        requestedAvoid={request.avoidTollCountries}
        loading={loading}
        onAvoidTollsChange={onAvoidTollsChange}
      />
    </section>
  );
}

type TollsState = ReturnType<typeof useTolls>;
type TollLine = Extract<TollEstimate, { status: "ok" }>["countries"][number]["lines"][number];

/** Vignette products are named from their id ("10d", "2m", "1y"); unknown ones keep the API label. */
function tollLineLabel(line: TollLine, t: ReturnType<typeof useI18n>["t"], fmt: ReturnType<typeof useI18n>["fmt"]): string {
  if (line.kind === "distance") return t("distanceToll", { km: fmt.decimal(line.km ?? 0, 0) });
  const id = line.id ?? "";
  const days = /^(\d+)d$/.exec(id);
  if (days) return days[1] === "1" ? t("vignetteDay") : t("vignetteDays", { n: Number(days[1]) });
  const months = /^(\d+)m$/.exec(id);
  if (months) return months[1] === "1" ? t("vignetteMonth") : t("vignetteMonths", { n: Number(months[1]) });
  if (id === "1y") return t("vignetteYear");
  if (id === "weekend") return t("vignetteWeekend");
  return line.label;
}

const isDaysInput = (v: string): v is string => v.length <= 8;

/** Loads the toll estimate for the route; re-fetches when days or euro class change. */
function useTolls(data: PlanResponse, euroClass: EuroClass | null) {
  // Remembered as typed; validated below.
  const [days, setDays] = usePersistentState<string>("fuel.tripDays", "1", isDaysInput);
  const [excluded, setExcluded] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState<{ key: string; result: TollEstimate | null; error: AppMessage | null } | null>(null);

  const dayCount = Number(days);
  const daysValid = Number.isInteger(dayCount) && dayCount >= 1 && dayCount <= 365;

  const query = useMemo(() => {
    if (data.tollCountries.length === 0 || !daysValid) return null;
    const params = new URLSearchParams({
      countries: data.tollCountries.join(","),
      days: String(dayCount),
      currency: data.currency,
      highway_km: Object.entries(data.motorwayKm)
        .filter(([c, km]) => data.tollCountries.includes(c) && km >= 1)
        .map(([c, km]) => `${c}:${Math.round(km)}`)
        .join(","),
    });
    if (euroClass) params.set("euro_class", euroClass);
    return params.toString();
  }, [data, dayCount, daysValid, euroClass]);

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    fetch(`/api/tolls?${query}`, { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json()) as TollEstimate | ApiError;
        if (!res.ok || "error" in body) {
          setLoaded({ key: query, result: null, error: "error" in body ? body.error : msg("tollsFailed") });
        } else {
          setLoaded({ key: query, result: body, error: null });
        }
      })
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          setLoaded({ key: query, result: null, error: msg("tollsFailed") });
        }
      });
    return () => controller.abort();
  }, [query]);

  const current = loaded && loaded.key === query ? loaded : null;
  const result = current?.result ?? null;
  const includedTotal =
    result?.status === "ok" ? result.countries.filter((c) => !excluded[c.country]).reduce((s, c) => s + c.subtotal, 0) : 0;

  return {
    days,
    setDays,
    daysValid,
    excluded,
    setExcluded,
    loading: !!query && !current,
    result,
    error: current?.error ?? null,
    includedTotal,
  };
}

function Tolls({
  tolls,
  currency,
  euroClass,
  onEuroClassChange,
  data,
  requestedAvoid,
  loading,
  onAvoidTollsChange,
}: {
  tolls: TollsState;
  currency: PlanResponse["currency"];
  euroClass: EuroClass | null;
  onEuroClassChange: (value: EuroClass) => void;
  data: PlanResponse;
  requestedAvoid: string[];
  loading: boolean;
  onAvoidTollsChange: (country: string, avoidTolls: boolean) => void;
}) {
  const { t, tm, fmt } = useI18n();
  const avoided =
    data.avoidedTollCountries.length > 0 ? (
      <ul className="tolls">
        {data.avoidedTollCountries.map((c) => (
          <li key={c}>
            <strong>{fmt.countryName(c)}</strong>
            <span className="toll-amount">{t("tollFreeRoute")}</span>
            {requestedAvoid.includes(c) ? (
              <label className="check avoid-toggle small">
                <input type="checkbox" checked disabled={loading} onChange={() => onAvoidTollsChange(c, false)} />
                {t("avoidTolls")}
              </label>
            ) : (
              <span className="avoid-toggle small">{t("detourTouches")}</span>
            )}
          </li>
        ))}
      </ul>
    ) : null;

  if (data.tollCountries.length === 0) {
    return (
      <>
        {avoided}
        {!avoided && <p className="muted">{t("noTollData")}</p>}
      </>
    );
  }

  return (
    <>
      <div className="field narrow-field">
        <label htmlFor="trip-days">{t("tripLength")}</label>
        <div className="unit-input">
          <input
            id="trip-days"
            inputMode="numeric"
            value={tolls.days}
            aria-invalid={!tolls.daysValid}
            onChange={(e) => tolls.setDays(e.target.value.slice(0, 8))}
          />
          <span>{t("days")}</span>
        </div>
        <small className="hint">{t("tripLengthHint")}</small>
        {!tolls.daysValid && <small className="error">{t("daysInvalid")}</small>}
      </div>

      {tolls.loading && <p className="muted">{t("loadingTolls")}</p>}
      {tolls.error && <p className="error">{tm(tolls.error)}</p>}

      {tolls.result?.status === "euro_class_required" && (
        <div className="notice">
          <label htmlFor="euro-class-inline">
            {t("euroClassRequired")}
          </label>{" "}
          <select
            id="euro-class-inline"
            value={euroClass ?? ""}
            onChange={(e) => e.target.value && onEuroClassChange(e.target.value as EuroClass)}
          >
            <option value="">{t("choose")}</option>
            {EURO_CLASSES.map((c) => (
              <option key={c} value={c}>
                {euroClassLabel(c, t)}
              </option>
            ))}
          </select>
        </div>
      )}

      {tolls.result?.status === "ok" && (
        <>
          <ul className="tolls">
            {tolls.result.countries.map((c) => (
              <li key={c.country}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={!tolls.excluded[c.country]}
                    disabled={c.subtotal === 0}
                    onChange={(e) => tolls.setExcluded((x) => ({ ...x, [c.country]: !e.target.checked }))}
                  />
                  <strong>{fmt.countryName(c.country)}</strong>
                </label>
                <span className="toll-amount">{c.subtotal > 0 ? fmt.money(c.subtotal, currency) : t("tollFree")}</span>
                {c.system !== "free" && (
                  <label className="check avoid-toggle small">
                    <input
                      type="checkbox"
                      checked={false}
                      disabled={loading}
                      onChange={() => onAvoidTollsChange(c.country, true)}
                    />
                    {t("avoidTolls")}
                  </label>
                )}
                {c.lines.length > 0 && (
                  <ul className="toll-lines muted small">
                    {c.lines.map((l, i) => (
                      <li key={i}>
                        {tollLineLabel(l, t, fmt)}: {fmt.money(l.price, currency)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          {avoided}
          <p className="hint">{t("tollFootnote", { asOf: tolls.result.asOf })}</p>
        </>
      )}
    </>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`stat${highlight ? " highlight" : ""}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
