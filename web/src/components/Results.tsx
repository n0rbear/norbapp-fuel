"use client";

import { useMemo, useState } from "react";
import type { PlanRequest, PlanResponse } from "@/lib/api-types";
import { formatDuration, formatEur, formatKm, formatLitres, formatPricePerLitre } from "@/lib/format";
import { parseDecimal, resolvePrices } from "@/lib/pricing";
import { computeFuelCost, type PriceSource } from "@/lib/trip";
import { countryName, vignetteFor } from "@/lib/vignette";

const SOURCE_LABEL: Record<PriceSource, string> = {
  manual: "kézi ár",
  station: "kiválasztott kút",
  cheapest: "legolcsóbb közeli kút",
  default: "alapár (becsült)",
};

type Props = { request: PlanRequest; data: PlanResponse; stale: boolean };

export function Results({ request, data, stale }: Props) {
  const [selected, setSelected] = useState<Record<number, string | undefined>>({});
  const [manualPrice, setManualPrice] = useState("");
  const [defaultPrice, setDefaultPrice] = useState("1,70");
  const [vignettes, setVignettes] = useState(() =>
    Object.fromEntries(
      data.countries
        .map(vignetteFor)
        .filter((v) => v !== null)
        .map((v) => [v.country, { include: true, price: String(v.priceEur).replace(".", ",") }]),
    ),
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

  const vignetteCost = Object.values(vignettes)
    .filter((v) => v.include)
    .reduce((sum, v) => sum + (parseDecimal(v.price) ?? 0), 0);

  const usesDefault = cost.segments.some((s) => s.source === "default");

  return (
    <section className="card results" aria-live="polite">
      {stale && <p className="notice">A beállítások megváltoztak – a frissítéshez nyomd meg újra a Kalkulációt.</p>}

      <h2>Eredmény</h2>
      <div className="stats">
        <Stat label="Távolság" value={formatKm(data.distanceKm)} />
        <Stat label="Menetidő" value={formatDuration(data.durationSec)} />
        <Stat label="Elfogyasztott üzemanyag" value={formatLitres(data.plan.totalLitres)} />
        <Stat label="Üzemanyagköltség" value={formatEur(cost.fuelCost)} />
        <Stat label="Matricák" value={formatEur(vignetteCost)} />
        <Stat label="Összesen" value={formatEur(cost.fuelCost + vignetteCost)} highlight />
      </div>
      <p className="hint">
        Az üzemanyagköltség az úton ténylegesen elfogyasztott mennyiséget árazza.
        {data.plan.stops.length > 0 && <> Útközbeni tankolásokra fizetendő: {formatEur(cost.paidAtStops)}.</>}
        {usesDefault && <> Ahol nincs kútár, az alapárral számolunk.</>}
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
            <span>€/l</span>
          </div>
          {manualInvalid && <small className="error">Érvénytelen ár.</small>}
        </div>
        <div className="field">
          <label htmlFor="default-price">Alapár, ha nincs kútadat</label>
          <div className="unit-input">
            <input
              id="default-price"
              inputMode="decimal"
              value={defaultPrice}
              aria-invalid={fallbackInvalid}
              onChange={(e) => setDefaultPrice(e.target.value)}
            />
            <span>€/l</span>
          </div>
          {fallbackInvalid && <small className="error">Adj meg érvényes árat.</small>}
        </div>
      </div>

      <h3>Tankolás</h3>
      <ol className="points">
        {data.points.map((point, i) => {
          const segment = cost.segments[i];
          const stop = i > 0 ? cost.stops[i - 1] : null;
          return (
            <li key={i}>
              <div className="point-head">
                <strong>{point.kind === "start" ? "Indulás" : `${i}. tankolás – ${formatKm(point.km)}-nél`}</strong>
                <span className="muted">{point.country ? countryName(point.country) : "ismeretlen ország"}</span>
              </div>
              <div className="point-meta">
                {stop && <span>Tankolandó: {formatLitres(stop.litres)}</span>}
                <span>
                  {formatPricePerLitre(segment.price)} <span className="badge">{SOURCE_LABEL[segment.source]}</span>
                </span>
              </div>

              {point.stationsError && <p className="muted">{point.stationsError}</p>}
              {point.stations.length > 0 && (
                <div className="stations" role="radiogroup" aria-label="Kút kiválasztása">
                  {point.stations.map((s) => {
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
                        <span className="station-price">{s.price !== null ? formatPricePerLitre(s.price) : "nincs ár"}</span>
                        <span className="muted small">
                          {s.address}
                          {s.distanceKm !== null && ` · ${formatKm(s.distanceKm)}`}
                          {s.isOpen === false && " · zárva"}
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

      <h3>Matricák</h3>
      {Object.keys(vignettes).length === 0 ? (
        <p className="muted">
          {data.countries.length > 0
            ? `Érintett országok: ${data.countries.map(countryName).join(", ")} – matricás országot nem találtunk.`
            : "Nincs matricás ország az útvonalon."}
        </p>
      ) : (
        <>
          <ul className="vignettes">
            {Object.entries(vignettes).map(([code, v]) => {
              const info = vignetteFor(code)!;
              return (
                <li key={code}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={v.include}
                      onChange={(e) =>
                        setVignettes((all) => ({ ...all, [code]: { ...v, include: e.target.checked } }))
                      }
                    />
                    {info.name} <span className="muted">({info.validity})</span>
                  </label>
                  <div className="unit-input narrow">
                    <input
                      inputMode="decimal"
                      aria-label={`${info.name} matrica ára`}
                      value={v.price}
                      onChange={(e) =>
                        setVignettes((all) => ({ ...all, [code]: { ...v, price: e.target.value } }))
                      }
                    />
                    <span>€</span>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="hint">A matricaárak tájékoztató jellegűek, indulás előtt ellenőrizd őket.</p>
        </>
      )}
    </section>
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
