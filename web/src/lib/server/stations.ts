import "server-only";
import type { Station, StationProvider } from "../api-types";
import type { LatLng } from "../geo";
import type { FuelType } from "../trip";
import { tankerkoenigApiKey } from "./env";
import { fetchJson } from "./http";

export function providerFor(country: string | null): StationProvider | null {
  // Without a key German stops fall back to the user's price like any other country.
  if (country === "DE") return tankerkoenigApiKey() ? "tankerkoenig" : null;
  if (country === "AT") return "e-control";
  return null;
}

const MAX_STATIONS = 8;

type TankerkoenigResponse = {
  ok: boolean;
  message?: string;
  stations?: {
    id: string;
    name: string;
    brand?: string;
    street?: string;
    houseNumber?: string;
    place?: string;
    dist?: number;
    price?: number | false | null;
    diesel?: number | false | null;
    e5?: number | false | null;
    e10?: number | false | null;
    isOpen?: boolean;
  }[];
};

async function fetchTankerkoenig(point: LatLng, fuelType: FuelType): Promise<Station[]> {
  const apiKey = tankerkoenigApiKey();
  if (!apiKey) throw new Error("Tankerkönig API kulcs nincs beállítva");

  const params = new URLSearchParams({
    lat: point.lat.toFixed(5),
    lng: point.lng.toFixed(5),
    rad: "10",
    type: fuelType,
    sort: "price",
    apikey: apiKey,
  });
  const data = await fetchJson<TankerkoenigResponse>(
    "tankerkoenig",
    `https://creativecommons.tankerkoenig.de/json/list.php?${params}`,
  );
  if (!data.ok) throw new Error("Tankerkönig hiba");

  return (data.stations ?? [])
    .map((s): Station => {
      // With a single fuel type the API returns the value as `price`; fall back
      // to the per-type field for robustness.
      const raw = s.price ?? s[fuelType];
      return {
        id: `tk-${s.id}`,
        name: s.brand?.trim() || s.name,
        address: [s.street, s.houseNumber].filter(Boolean).join(" ") + (s.place ? `, ${s.place}` : ""),
        distanceKm: typeof s.dist === "number" ? s.dist : null,
        price: typeof raw === "number" && raw > 0 ? raw : null,
        isOpen: typeof s.isOpen === "boolean" ? s.isOpen : null,
      };
    })
    .slice(0, MAX_STATIONS);
}

type EControlStation = {
  id: number;
  name: string;
  location?: { address?: string; postalCode?: string; city?: string };
  distance?: number;
  open?: boolean;
  prices?: { fuelType: string; amount: number }[];
};

async function fetchEControl(point: LatLng, fuelType: FuelType): Promise<Station[]> {
  const eFuel = fuelType === "diesel" ? "DIE" : "SUP";
  const params = new URLSearchParams({
    latitude: point.lat.toFixed(5),
    longitude: point.lng.toFixed(5),
    fuelType: eFuel,
    includeClosed: "false",
  });
  const data = await fetchJson<EControlStation[]>(
    "e-control",
    `https://api.e-control.at/sprit/1.0/search/gas-stations/by-address?${params}`,
  );

  return data
    .map((s): Station => {
      const price = s.prices?.find((p) => p.fuelType === eFuel)?.amount;
      return {
        id: `ec-${s.id}`,
        name: s.name,
        address: [s.location?.address, [s.location?.postalCode, s.location?.city].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(", "),
        distanceKm: typeof s.distance === "number" ? s.distance : null,
        price: typeof price === "number" && price > 0 ? price : null,
        isOpen: typeof s.open === "boolean" ? s.open : null,
      };
    })
    .slice(0, MAX_STATIONS);
}

export async function fetchStations(
  provider: StationProvider,
  point: LatLng,
  fuelType: FuelType,
): Promise<Station[]> {
  const stations =
    provider === "tankerkoenig" ? await fetchTankerkoenig(point, fuelType) : await fetchEControl(point, fuelType);
  // Priced stations first, cheapest first; stable for unpriced ones.
  return stations.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
}
