"use client";

import { useMemo, useState } from "react";
import type { ApiError, PlanRequest, PlanResponse } from "@/lib/api-types";
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

const VEHICLE_FIELDS: { key: keyof Vehicle; label: string; unit: string }[] = [
  { key: "consumption", label: "Fogyasztás", unit: "l/100 km" },
  { key: "tankSize", label: "Tankméret", unit: "l" },
  { key: "startLevelPct", label: "Tankszint induláskor", unit: "%" },
  { key: "reservePct", label: "Tartalék, ami alá nem mész", unit: "%" },
];

export function Planner() {
  const [origin, setOrigin] = useState<PlaceValue>(emptyPlace);
  const [locating, setLocating] = useState(false);
  const [destination, setDestination] = useState<PlaceValue>(emptyPlace);
  const [waypoints, setWaypoints] = useState<PlaceValue[]>([]);
  const [roundTrip, setRoundTrip] = useState(false);
  const [optimize, setOptimize] = useState(false);
  const [fuelType, setFuelType] = useState<FuelType>("diesel");
  const [vehicleForm, setVehicleForm] = useState<VehicleForm>(toForm(DEFAULT_VEHICLE));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      vehicle,
    };
  }, [origin, destination, waypoints, roundTrip, optimize, fuelType, vehicle]);

  const stale = !!result && JSON.stringify(result.request) !== JSON.stringify(request);

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      setError("A böngésző nem támogatja a helymeghatározást.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        let label = "Jelenlegi pozíció";
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
          err.code === err.PERMISSION_DENIED
            ? "A helymeghatározás nincs engedélyezve."
            : "Nem sikerült meghatározni a pozíciót.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!vehicle || !request) {
      setError("Ellenőrizd a jármű adatait (számokat adj meg).");
      return;
    }
    const vehicleError = validateVehicle(vehicle);
    if (vehicleError) {
      setError(vehicleError);
      return;
    }
    if (!origin.text.trim()) {
      setError("Add meg az indulási helyet.");
      return;
    }
    if (!destination.text.trim()) {
      setError("Add meg az úti célt.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const data = (await res.json()) as PlanResponse | ApiError;
      if (!res.ok || "error" in data) {
        setError("error" in data ? data.error : "Hiba történt a tervezéskor.");
        return;
      }
      setResult({ id: Date.now(), request, response: data });
    } catch {
      setError("Nem sikerült elérni a szervert. Ellenőrizd az internetkapcsolatot.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <form className="card" onSubmit={submit} noValidate>
        <h2>Útvonal</h2>

        <AddressInput
          label="Indulás"
          value={origin}
          onChange={setOrigin}
          placeholder="pl. Budapest"
          trailing={
            <button type="button" className="btn ghost" onClick={useMyLocation} disabled={locating}>
              {locating ? "Keresés…" : "Saját pozíció"}
            </button>
          }
        />

        {waypoints.map((w, i) => (
          <AddressInput
            key={i}
            label={`${i + 1}. megálló`}
            value={w}
            onChange={(v) => setWaypoints((ws) => ws.map((x, j) => (j === i ? v : x)))}
            near={origin.location}
            trailing={
              <button
                type="button"
                className="btn ghost"
                aria-label={`${i + 1}. megálló törlése`}
                onClick={() => setWaypoints((ws) => ws.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            }
          />
        ))}

        <AddressInput
          label="Úti cél"
          value={destination}
          onChange={setDestination}
          placeholder="pl. München"
          near={origin.location}
        />

        <div className="row wrap">
          <button
            type="button"
            className="btn ghost"
            disabled={waypoints.length >= MAX_WAYPOINTS}
            onClick={() => setWaypoints((ws) => [...ws, emptyPlace])}
          >
            + Megálló
          </button>
          <label className="check">
            <input type="checkbox" checked={roundTrip} onChange={(e) => setRoundTrip(e.target.checked)} />
            Oda-vissza
          </label>
          {waypoints.length > 1 && !roundTrip && (
            <label className="check">
              <input type="checkbox" checked={optimize} onChange={(e) => setOptimize(e.target.checked)} />
              Megállók sorrendjének optimalizálása
            </label>
          )}
        </div>

        <h2>Jármű és üzemanyag</h2>
        <div className="segmented" role="radiogroup" aria-label="Üzemanyag">
          {FUEL_TYPES.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={fuelType === f.id}
              className={fuelType === f.id ? "on" : ""}
              onClick={() => setFuelType(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="grid">
          {VEHICLE_FIELDS.map(({ key, label, unit }) => (
            <div className="field" key={key}>
              <label htmlFor={`v-${key}`}>{label}</label>
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

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn primary" disabled={loading}>
          {loading ? "Tervezés…" : "Kalkuláció"}
        </button>
      </form>

      {result && (
        <Results key={result.id} request={result.request} data={result.response} stale={stale} />
      )}
    </>
  );
}
