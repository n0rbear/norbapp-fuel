"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CURRENCIES,
  EURO_CLASSES,
  type ApiError,
  type Currency,
  euroClassLabel,
  type EuroClass,
  type PlanRequest,
  type PlanResponse,
} from "@/lib/api-types";
import { usePersistentFlag, usePersistentState } from "@/hooks/usePersistentState";
import { msg, type AppMessage } from "@/i18n/message";
import { useI18n } from "@/i18n/I18nProvider";
import { parseDecimal } from "@/lib/pricing";
import { DEFAULT_VEHICLE, FUEL_TYPES, validateVehicle, type FuelType, type Vehicle } from "@/lib/trip";
import { MAX_WAYPOINTS } from "@/lib/validate";
import { AddressInput, emptyPlace, toPlaceInput, type PlaceValue } from "./AddressInput";
import { Results } from "./Results";

type VehicleForm = Record<keyof Vehicle, string>;

const toForm = (v: Vehicle): VehicleForm => ({
  consumption: String(v.consumption).replace(".", ","),
  tankSize: String(v.tankSize),
  startLevelPct: String(v.startLevelPct),
  reservePct: String(v.reservePct),
});

const VEHICLE_FIELDS: { key: keyof Vehicle; label: "consumption" | "tankSize" | "startLevel" | "reserve"; unit: string }[] = [
  { key: "consumption", label: "consumption", unit: "l/100 km" },
  { key: "tankSize", label: "tankSize", unit: "l" },
  { key: "startLevelPct", label: "startLevel", unit: "%" },
  { key: "reservePct", label: "reserve", unit: "%" },
];

const DEFAULT_FORM = toForm(DEFAULT_VEHICLE);

/** The vehicle form as typed (strings), remembered as JSON. */
const isVehicleJson = (v: string): v is string => {
  try {
    const parsed = JSON.parse(v) as Record<string, unknown>;
    return VEHICLE_FIELDS.every(({ key }) => typeof parsed[key] === "string" && (parsed[key] as string).length <= 32);
  } catch {
    return false;
  }
};

const isFuelType = (v: string): v is FuelType => FUEL_TYPES.some((f) => f.id === v);

const isCountryList = (v: string): v is string => /^([A-Z]{2}(,[A-Z]{2})*)?$/.test(v);

const isCurrency = (v: string): v is Currency => (CURRENCIES as readonly string[]).includes(v);
const isEuroClassOrUnset = (v: string): v is EuroClass | "" => v === "" || (EURO_CLASSES as readonly string[]).includes(v);

export function Planner() {
  const { t, tm, locale } = useI18n();
  const currencyLabel = (code: Currency) => {
    try {
      const name = new Intl.DisplayNames([locale], { type: "currency" }).of(code);
      return name && name !== code ? `${code} – ${name}` : code;
    } catch {
      return code;
    }
  };
  const [origin, setOrigin] = useState<PlaceValue>(emptyPlace);
  const [locating, setLocating] = useState(false);
  const [destination, setDestination] = useState<PlaceValue>(emptyPlace);
  const [waypoints, setWaypoints] = useState<PlaceValue[]>([]);
  // Trip and vehicle settings are remembered in this browser between visits.
  const [roundTrip, setRoundTrip] = usePersistentFlag("fuel.roundTrip", false);
  const [optimize, setOptimize] = usePersistentFlag("fuel.optimizeStops", false);
  const [fuelType, setFuelType] = usePersistentState<FuelType>("fuel.fuelType", "diesel", isFuelType);
  const [vehicleJson, setVehicleJson] = usePersistentState<string>("fuel.vehicle", JSON.stringify(DEFAULT_FORM), isVehicleJson);
  const vehicleForm = useMemo(() => JSON.parse(vehicleJson) as VehicleForm, [vehicleJson]);
  const setVehicleForm = (update: (f: VehicleForm) => VehicleForm) => {
    const next = update(vehicleForm);
    setVehicleJson(JSON.stringify(Object.fromEntries(Object.entries(next).map(([k, v]) => [k, v.slice(0, 32)]))));
  };
  const [fillAtStart, setFillAtStart] = usePersistentFlag("fuel.fillAtStart", false);
  const [currency, setCurrency] = usePersistentState<Currency>("fuel.currency", "HUF", isCurrency);
  const [euroClass, setEuroClass] = usePersistentState<EuroClass | "">("fuel.euroClass", "", isEuroClassOrUnset);
  // Countries where the user drives toll-free; remembered across visits.
  const [avoidList, setAvoidList] = usePersistentState<string>("fuel.avoidTolls", "", isCountryList);
  const avoidTollCountries = useMemo(() => avoidList.split(",").filter(Boolean).sort(), [avoidList]);

  useEffect(() => {
    // Wake the sleeping price service early.
    fetch("/api/warmup", { method: "POST" }).catch(() => {});
  }, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AppMessage | null>(null);
  const [result, setResult] = useState<{ id: number; request: PlanRequest; response: PlanResponse } | null>(null);

  const vehicle: Vehicle | null = useMemo(() => {
    const parsed = {
      consumption: parseDecimal(vehicleForm.consumption),
      tankSize: parseDecimal(vehicleForm.tankSize),
      startLevelPct: parseDecimal(vehicleForm.startLevelPct),
      reservePct: parseDecimal(vehicleForm.reservePct),
    };
    if (Object.values(parsed).some((v) => v === null)) return null;
    return parsed as Vehicle;
  }, [vehicleForm]);

  const request: PlanRequest | null = useMemo(() => {
    if (!vehicle) return null;
    return {
      origin: toPlaceInput(origin),
      destination: toPlaceInput(destination),
      waypoints: waypoints.filter((w) => w.text.trim()).map(toPlaceInput),
      roundTrip,
      optimizeWaypoints: optimize,
      fuelType,
      currency,
      vehicle,
      fillAtStart: fillAtStart && vehicle.startLevelPct < 100,
      avoidTollCountries,
    };
  }, [origin, destination, waypoints, roundTrip, optimize, fuelType, currency, vehicle, fillAtStart, avoidTollCountries]);

  const stale = !!result && JSON.stringify(result.request) !== JSON.stringify(request);

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      setError(msg("geoUnsupported"));
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        let label = t("currentPosition");
        try {
          const res = await fetch(`/api/reverse?lat=${location.lat}&lng=${location.lng}`);
          if (res.ok) label = ((await res.json()) as { address: string | null }).address ?? label;
        } catch {
          // Keep the generic label.
        }
        setOrigin({ text: label, location });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setError(
          err.code === err.PERMISSION_DENIED ? msg("geoDenied") : msg("geoFailed"),
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!vehicle || !request) {
      setError(msg("checkVehicle"));
      return;
    }
    const vehicleError = validateVehicle(vehicle);
    if (vehicleError) {
      setError(msg(vehicleError));
      return;
    }
    if (!origin.text.trim()) {
      setError(msg("originMissing"));
      return;
    }
    if (!destination.text.trim()) {
      setError(msg("destinationMissing"));
      return;
    }

    await runPlan(request);
  };

  const runPlan = async (planRequest: PlanRequest) => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(planRequest),
      });
      const data = (await res.json()) as PlanResponse | ApiError;
      if (!res.ok || "error" in data) {
        setError("error" in data ? data.error : msg("planFailed"));
        return;
      }
      setResult({ id: Date.now(), request: planRequest, response: data });
    } catch {
      setError(msg("serverUnreachable"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <form className="card" onSubmit={submit} noValidate>
        <h2>{t("route")}</h2>

        <AddressInput
          label={t("origin")}
          value={origin}
          onChange={setOrigin}
          placeholder={t("originPlaceholder")}
          trailing={
            <button type="button" className="btn ghost" onClick={useMyLocation} disabled={locating}>
              {locating ? t("locating") : t("myLocation")}
            </button>
          }
        />

        {waypoints.map((w, i) => (
          <AddressInput
            key={i}
            label={t("stopN", { n: i + 1 })}
            value={w}
            onChange={(v) => setWaypoints((ws) => ws.map((x, j) => (j === i ? v : x)))}
            near={origin.location}
            trailing={
              <button
                type="button"
                className="btn ghost"
                aria-label={t("removeStopN", { n: i + 1 })}
                onClick={() => setWaypoints((ws) => ws.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            }
          />
        ))}

        <AddressInput
          label={t("destination")}
          value={destination}
          onChange={setDestination}
          placeholder={t("destinationPlaceholder")}
          near={origin.location}
        />

        <div className="row wrap">
          <button
            type="button"
            className="btn ghost"
            disabled={waypoints.length >= MAX_WAYPOINTS}
            onClick={() => setWaypoints((ws) => [...ws, emptyPlace])}
          >
            {t("addStop")}
          </button>
          <label className="check">
            <input type="checkbox" checked={roundTrip} onChange={(e) => setRoundTrip(e.target.checked)} />
            {t("roundTrip")}
          </label>
          {waypoints.length > 1 && !roundTrip && (
            <label className="check">
              <input type="checkbox" checked={optimize} onChange={(e) => setOptimize(e.target.checked)} />
              {t("optimizeStops")}
            </label>
          )}
        </div>

        <h2>{t("vehicleAndFuel")}</h2>
        <div className="segmented" role="radiogroup" aria-label={t("fuel")}>
          {FUEL_TYPES.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={fuelType === f.id}
              className={fuelType === f.id ? "on" : ""}
              onClick={() => setFuelType(f.id)}
            >
              {t(f.label)}
            </button>
          ))}
        </div>

        <div className="grid">
          {VEHICLE_FIELDS.map(({ key, label, unit }) => (
            <div className="field" key={key}>
              <label htmlFor={`v-${key}`}>{t(label)}</label>
              <div className="unit-input">
                <input
                  id={`v-${key}`}
                  inputMode="decimal"
                  value={vehicleForm[key]}
                  onChange={(e) => setVehicleForm((f) => ({ ...f, [key]: e.target.value }))}
                />
                <span>{unit}</span>
              </div>
            </div>
          ))}
        </div>

        {vehicle && vehicle.startLevelPct < 100 && (
          <label className="check">
            <input type="checkbox" checked={fillAtStart} onChange={(e) => setFillAtStart(e.target.checked)} />
            {t("fillAtStart")}
          </label>
        )}

        <div className="grid">
          <div className="field">
            <label htmlFor="euro-class">{t("euroClass")}</label>
            <select id="euro-class" value={euroClass} onChange={(e) => setEuroClass(e.target.value as EuroClass | "")}>
              <option value="">{t("euroClassUnset")}</option>
              {EURO_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {euroClassLabel(c, t)}
                </option>
              ))}
            </select>
            <small className="hint">{t("euroClassHint")}</small>
          </div>
          <div className="field">
            <label htmlFor="currency">{t("currency")}</label>
            <select id="currency" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {currencyLabel(code)}
                </option>
              ))}
            </select>
            <small className="hint">{t("currencyHint")}</small>
          </div>
        </div>

        {error && (
          <p className="error" role="alert">
            {tm(error)}
          </p>
        )}

        <button type="submit" className="btn primary" disabled={loading}>
          {loading ? t("planning") : t("calculate")}
        </button>
        {loading && (
          <p className="hint" role="status">
            {t("coldStartHint")}
          </p>
        )}
      </form>

      {result && (
        <Results
          key={result.id}
          request={result.request}
          data={result.response}
          stale={stale}
          euroClass={euroClass || null}
          onEuroClassChange={setEuroClass}
          loading={loading}
          onAvoidTollsChange={(country, avoidTolls) => {
            // Re-plan the shown trip with the new toll preference right away.
            const next = new Set(avoidTollCountries);
            if (avoidTolls) next.add(country);
            else next.delete(country);
            const list = [...next].sort();
            setAvoidList(list.join(","));
            void runPlan({ ...result.request, avoidTollCountries: list });
          }}
        />
      )}
    </>
  );
}
