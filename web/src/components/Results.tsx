"use client";

import { useEffect, useMemo, useState } from "react";
import { EURO_CLASS_LABELS, EURO_CLASSES, type ApiError, type EuroClass, type PlanRequest, type PlanResponse, type TollEstimate } from "@/lib/api-types";
import { countryName } from "@/lib/countries";
import { formatDuration, formatKm, formatLitres, formatMoney, formatPricePerLitre, currencySymbol, toInputDecimal } from "@/lib/format";
import { parseDecimal, resolvePrices } from "@/lib/pricing";
import { computeFuelCost, type PriceSource } from "@/lib/trip";

const SOURCE_LABEL: Record<PriceSource, string> = {
  manual: "kézi ár",
  station: "kiválasztott kút",
  cheapest: "legolcsóbb közeli kút",
  average: "környékbeli átlagár",
  estimate: "becslés",
  default: "alapár",
};

/** Default fallback price (EUR/l) where no price data exists, converted to the chosen currency. */
const FALLBACK_EUR = 1.7;

function attribution(source: string): string {
  // Tankerkönig data is CC BY 4.0 and must be credited this way.
  return /tankerk/i.test(source) ? "Daten: MTS-K / Tankerkönig (CC BY 4.0)" : source;
}

type Props = {
  request: PlanRequest;
  data: PlanResponse;
  stale: boolean;
  euroClass: EuroClass | null;
  onEuroClassChange: (value: EuroClass) => void;
};

export function Results({ request, data, stale, euroClass, onEuroClassChange }: Props) {
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
      {stale && <p className="notice">A beállítások megváltoztak – a frissítéshez nyomd meg újra a Kalkulációt.</p>}

      <h2>Eredmény</h2>
      <div className="stats">
        <Stat label="Távolság" value={formatKm(data.distanceKm)} />
        <Stat label="Menetidő" value={formatDuration(data.durationSec)} />
        <Stat label="Elfogyasztott üzemanyag" value={formatLitres(data.plan.totalLitres)} />
        <Stat label="Üzemanyagköltség" value={formatMoney(cost.fuelCost, currency)} />
        <Stat label="Útdíjak" value={tolls.loading ? "…" : formatMoney(tollCost, currency)} />
        <Stat label="Összesen" value={formatMoney(cost.fuelCost + tollCost, currency)} highlight />
      </div>
      <p className="hint">
        Az üzemanyagköltség az úton ténylegesen elfogyasztott mennyiséget árazza.
        {data.plan.stops.length > 0 && <> Útközbeni tankolásokra fizetendő: {formatMoney(cost.paidAtStops, currency)}.</>}
        {usesDefault && <> Ahol nincs áradat, az alapárral számolunk.</>}
      </p>

      {data.warnings.map((w) => (
        <p key={w} className="notice">
          {w}
        </p>
      ))}

      <h3>Árak</h3>
      <div className="grid">
        <div className="field">
          <label htmlFor="manual-price">Kézi ár (minden pontra)</label>
          <div className="unit-input">
            <input
              id="manual-price"
              inputMode="decimal"
              placeholder="üres = kútárak"
              value={manualPrice}
              aria-invalid={manualInvalid}
              onChange={(e) => setManualPrice(e.target.value)}
            />
            <span>{currencySymbol(currency)}/l</span>
          </div>
          {manualInvalid && <small className="error">Érvénytelen ár.</small>}
        </div>
        <div className="field">
          <label htmlFor="default-price">Alapár, ha nincs áradat</label>
          <div className="unit-input">
            <input
              id="default-price"
              inputMode="decimal"
              value={defaultPrice}
              aria-invalid={fallbackInvalid}
              onChange={(e) => setDefaultPrice(e.target.value)}
            />
            <span>{currencySymbol(currency)}/l</span>
          </div>
          {fallbackInvalid && <small className="error">Adj meg érvényes árat.</small>}
        </div>
      </div>

      <h3>Tankolás</h3>
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
                    ? `Indulás – ${formatLitres(data.plan.startLitres)} a tankban (${request.vehicle.startLevelPct}%)`
                    : point.km < 0.5
                      ? `${i}. tankolás – indulás előtt`
                      : `${i}. tankolás – ${formatKm(point.km)}-nél`}
                </strong>
                <span className="muted">{point.country ? countryName(point.country) : "ismeretlen ország"}</span>
              </div>
              <div className="point-meta">
                {stop && <span>Tankolandó: {formatLitres(stop.litres)}</span>}
                <span>
                  {formatPricePerLitre(segment.price, currency)}{" "}
                  <span className="badge">{SOURCE_LABEL[segment.source]}</span>
                </span>
              </div>

              {point.kind === "start" && (
                <p className="muted small">
                  Ez nem tankolás: a tankban lévő üzemanyagot a környékbeli átlagárral számoljuk, amíg az első
                  tankolásig elfogy.
                </p>
              )}
              {prices.fuelNote && <p className="muted small">{prices.fuelNote}</p>}
              {prices.mode === "estimate" && (
                <p className="muted small">
                  Becsült ár ({prices.estimate.location === "highway" ? "autópálya" : "város"}, átlagos márka):{" "}
                  {formatPricePerLitre(prices.estimate.low, currency)} – {formatPricePerLitre(prices.estimate.high, currency)}
                </p>
              )}
              {prices.mode === "none" && <p className="muted small">{prices.reason}</p>}
              {point.kind === "stop" && prices.stations.length > 0 && (
                <div className="stations" role="radiogroup" aria-label="Kút kiválasztása">
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
                          {s.price !== null ? formatPricePerLitre(s.price, currency) : "nincs ár"}
                        </span>
                        <span className="muted small">
                          {s.address}
                          {s.distanceKm !== null && ` · ${formatKm(s.distanceKm)}`}
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
      {sources.length > 0 && <p className="hint">Árforrás: {sources.map(attribution).join(" · ")}</p>}

      <h3>Útdíjak</h3>
      <Tolls tolls={tolls} currency={currency} euroClass={euroClass} onEuroClassChange={onEuroClassChange} data={data} />
    </section>
  );
}

type TollsState = ReturnType<typeof useTolls>;

/** Loads the toll estimate for the route; re-fetches when days or euro class change. */
function useTolls(data: PlanResponse, euroClass: EuroClass | null) {
  const [days, setDays] = useState("1");
  const [excluded, setExcluded] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState<{ key: string; result: TollEstimate | null; error: string | null } | null>(null);

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
          setLoaded({ key: query, result: null, error: "error" in body ? body.error : "Az útdíj nem kérhető le." });
        } else {
          setLoaded({ key: query, result: body, error: null });
        }
      })
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          setLoaded({ key: query, result: null, error: "Az útdíj nem kérhető le." });
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
}: {
  tolls: TollsState;
  currency: PlanResponse["currency"];
  euroClass: EuroClass | null;
  onEuroClassChange: (value: EuroClass) => void;
  data: PlanResponse;
}) {
  if (data.tollCountries.length === 0) {
    return <p className="muted">Az útvonal országaira nincs útdíjadat.</p>;
  }

  return (
    <>
      <div className="field narrow-field">
        <label htmlFor="trip-days">Utazás hossza</label>
        <div className="unit-input">
          <input
            id="trip-days"
            inputMode="numeric"
            value={tolls.days}
            aria-invalid={!tolls.daysValid}
            onChange={(e) => tolls.setDays(e.target.value)}
          />
          <span>nap</span>
        </div>
        <small className="hint">Ehhez választjuk a legolcsóbb matrica-kombinációt.</small>
        {!tolls.daysValid && <small className="error">1 és 365 közötti egész számot adj meg.</small>}
      </div>

      {tolls.loading && <p className="muted">Útdíjak lekérése…</p>}
      {tolls.error && <p className="error">{tolls.error}</p>}

      {tolls.result?.status === "euro_class_required" && (
        <div className="notice">
          <label htmlFor="euro-class-inline">
            Az útvonalon kibocsátásfüggő útdíj van (pl. Románia). Add meg az autó Euro-besorolását:
          </label>{" "}
          <select
            id="euro-class-inline"
            value={euroClass ?? ""}
            onChange={(e) => e.target.value && onEuroClassChange(e.target.value as EuroClass)}
          >
            <option value="">Válassz…</option>
            {EURO_CLASSES.map((c) => (
              <option key={c} value={c}>
                {EURO_CLASS_LABELS[c]}
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
                  <strong>{countryName(c.country)}</strong>
                </label>
                <span className="toll-amount">{c.subtotal > 0 ? formatMoney(c.subtotal, currency) : "díjmentes"}</span>
                {c.lines.length > 0 && (
                  <ul className="toll-lines muted small">
                    {c.lines.map((l, i) => (
                      <li key={i}>
                        {l.label}: {formatMoney(l.price, currency)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <p className="hint">
            Személyautó, {tolls.result.asOf} szerinti díjak. A km-alapú díj becslés; alagutak, hidak külön díja
            nincs benne. Ha egy országra már van matricád, vedd ki a pipát.
          </p>
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
