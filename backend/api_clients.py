"""Clients for free, official station-level fuel price APIs.

One client per country with an official open price feed:

    DE  Tankerkoenig (MTS-K data)      free API key required
    AT  E-Control Spritpreisrechner    no key
    ES  Ministerio (Geoportal Gasolineras REST)  no key, bulk dataset
    FR  prix-carburants (data.economie.gouv.fr)  no key
    IT  MIMIT Osservaprezzi CSV export no key, bulk dataset
    PT  DGEG Precos Combustiveis       no key, bulk dataset
    SI  goriva.si                      no key

Every client returns normalised Station objects with prices in EUR/litre.
Bulk datasets are cached in memory to stay within fair-use limits.
"""

from __future__ import annotations

import asyncio
import csv
import io
import math
import os
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

import httpx

from pricing_matrix import BrandTier, Fuel, Location, classify_brand, guess_location

MAX_RADIUS_KM = 25.0
MAX_STATIONS = 50


class OfficialApiError(Exception):
    """The official API failed or returned unusable data."""


class ApiNotConfiguredError(OfficialApiError):
    """The official API needs configuration (e.g. an API key) that is missing."""


@dataclass
class Station:
    id: str
    name: str
    brand: str | None
    address: str | None
    city: str | None
    lat: float
    lng: float
    price: float
    fuel: Fuel
    distance_km: float | None = None
    updated_at: str | None = None
    brand_tier: BrandTier = field(init=False)
    location: Location | None = field(init=False)

    def __post_init__(self) -> None:
        self.brand_tier = classify_brand(self.brand or self.name)
        self.location = guess_location(self.name, self.address)

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "brand": self.brand,
            "brand_tier": self.brand_tier.value,
            "location": self.location.value if self.location else None,
            "address": self.address,
            "city": self.city,
            "lat": self.lat,
            "lng": self.lng,
            "distance_km": round(self.distance_km, 2) if self.distance_km is not None else None,
            "price": round(self.price, 3),
            "fuel": self.fuel.value,
            "updated_at": self.updated_at,
        }


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def parse_decimal(value: Any) -> float | None:
    """Parse '1,799', '1.799', '1,799 €' or numbers; empty/zero -> None."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        number = float(value)
    else:
        text = str(value).replace("€", "").replace("\xa0", "").strip().replace(",", ".")
        if not text:
            return None
        try:
            number = float(text)
        except ValueError:
            return None
    return number if number > 0 else None


def parse_coord(value: Any) -> float | None:
    """Parse a coordinate that may use a decimal comma; invalid -> None."""
    if value is None or value == "":
        return None
    try:
        return float(str(value).replace(",", ".").strip())
    except ValueError:
        return None


class TTLCache:
    """Tiny async-safe TTL cache for bulk downloads."""

    def __init__(self) -> None:
        self._data: dict[str, tuple[float, Any]] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    async def get_or_load(self, key: str, ttl: float, loader: Callable[[], Awaitable[Any]]) -> Any:
        hit = self._data.get(key)
        if hit and hit[0] > time.monotonic():
            return hit[1]
        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            hit = self._data.get(key)
            if hit and hit[0] > time.monotonic():
                return hit[1]
            value = await loader()
            self._data[key] = (time.monotonic() + ttl, value)
            return value

    def clear(self) -> None:
        self._data.clear()


cache = TTLCache()


class OfficialApiClient(ABC):
    country_code: str
    source_name: str
    source_url: str
    requires_api_key: bool = False

    @property
    def configured(self) -> bool:
        return True

    @abstractmethod
    async def fetch_stations(
        self, http: httpx.AsyncClient, lat: float, lng: float, radius_km: float, fuel: Fuel
    ) -> list[Station]:
        ...

    async def stations_near(
        self, http: httpx.AsyncClient, lat: float, lng: float, radius_km: float, fuel: Fuel
    ) -> list[Station]:
        if not self.configured:
            raise ApiNotConfiguredError(f"{self.source_name} is not configured")
        radius_km = max(1.0, min(radius_km, MAX_RADIUS_KM))
        try:
            stations = await self.fetch_stations(http, lat, lng, radius_km, fuel)
        except httpx.HTTPError as exc:
            raise OfficialApiError(f"{self.source_name}: {exc.__class__.__name__}") from exc
        except (KeyError, TypeError, ValueError) as exc:
            raise OfficialApiError(f"{self.source_name}: unexpected response format") from exc
        for station in stations:
            if station.distance_km is None:
                station.distance_km = haversine_km(lat, lng, station.lat, station.lng)
        nearby = [s for s in stations if s.distance_km is not None and s.distance_km <= radius_km]
        nearby.sort(key=lambda s: (s.distance_km, s.price))
        return nearby[:MAX_STATIONS]

    def describe(self) -> dict[str, Any]:
        return {
            "source": self.source_name,
            "source_url": self.source_url,
            "requires_api_key": self.requires_api_key,
            "configured": self.configured,
        }


async def _get_json(http: httpx.AsyncClient, url: str, **kwargs: Any) -> Any:
    response = await http.get(url, **kwargs)
    response.raise_for_status()
    return response.json()


class GermanyTankerkoenigClient(OfficialApiClient):
    country_code = "DE"
    source_name = "Tankerkoenig (MTS-K)"
    source_url = "https://creativecommons.tankerkoenig.de/json/list.php"
    requires_api_key = True

    @property
    def api_key(self) -> str | None:
        return os.getenv("TANKERKOENIG_API_KEY") or None

    @property
    def configured(self) -> bool:
        return self.api_key is not None

    async def fetch_stations(self, http, lat, lng, radius_km, fuel):
        data = await _get_json(
            http,
            self.source_url,
            params={
                "lat": lat,
                "lng": lng,
                "rad": radius_km,
                "type": "all",
                "sort": "dist",
                "apikey": self.api_key,
            },
        )
        if not data.get("ok"):
            raise OfficialApiError(f"{self.source_name}: {data.get('message', 'request rejected')}")
        stations = []
        for s in data.get("stations") or []:
            price = parse_decimal(s.get("diesel")) if fuel is Fuel.DIESEL else (
                parse_decimal(s.get("e5")) or parse_decimal(s.get("e10"))
            )
            if price is None:
                continue
            street = " ".join(p for p in (s.get("street"), s.get("houseNumber")) if p)
            stations.append(Station(
                id=str(s["id"]), name=s.get("name") or "", brand=s.get("brand"),
                address=street or None, city=s.get("place"),
                lat=float(s["lat"]), lng=float(s["lng"]), price=price, fuel=fuel,
                distance_km=parse_decimal(s.get("dist")),
            ))
        return stations


class AustriaEControlClient(OfficialApiClient):
    country_code = "AT"
    source_name = "E-Control Spritpreisrechner"
    source_url = "https://api.e-control.at/sprit/1.0/search/gas-stations/by-address"

    async def fetch_stations(self, http, lat, lng, radius_km, fuel):
        fuel_type = "DIE" if fuel is Fuel.DIESEL else "SUP"
        data = await _get_json(
            http,
            self.source_url,
            params={"latitude": lat, "longitude": lng, "fuelType": fuel_type, "includeClosed": "false"},
        )
        stations = []
        for s in data:
            price = next(
                (parse_decimal(p.get("amount")) for p in s.get("prices") or [] if p.get("fuelType") == fuel_type),
                None,
            )
            if price is None:
                continue
            loc = s.get("location") or {}
            stations.append(Station(
                id=str(s["id"]), name=s.get("name") or "", brand=None,
                address=loc.get("address"), city=loc.get("city"),
                lat=float(loc["latitude"]), lng=float(loc["longitude"]), price=price, fuel=fuel,
                distance_km=parse_decimal(s.get("distance")),
            ))
        return stations


class SpainMineturClient(OfficialApiClient):
    country_code = "ES"
    source_name = "Ministerio para la Transición Ecológica – Geoportal Gasolineras"
    source_url = (
        "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/"
        "PreciosCarburantes/EstacionesTerrestres/"
    )
    cache_ttl = 30 * 60

    async def _load(self, http: httpx.AsyncClient) -> dict[str, Any]:
        return await _get_json(http, self.source_url, headers={"Accept": "application/json"}, timeout=60)

    async def fetch_stations(self, http, lat, lng, radius_km, fuel):
        data = await cache.get_or_load("ES", self.cache_ttl, lambda: self._load(http))
        price_key = "Precio Gasoleo A" if fuel is Fuel.DIESEL else "Precio Gasolina 95 E5"
        updated = data.get("Fecha")
        stations = []
        for s in data["ListaEESSPrecio"]:
            price = parse_decimal(s.get(price_key))
            if price is None and fuel is Fuel.PETROL:
                price = parse_decimal(s.get("Precio Gasolina 95 E10"))
            s_lat, s_lng = parse_coord(s.get("Latitud")), parse_coord(s.get("Longitud (WGS84)"))
            if price is None or s_lat is None or s_lng is None:
                continue
            stations.append(Station(
                id=str(s.get("IDEESS")), name=s.get("Rótulo") or "", brand=s.get("Rótulo"),
                address=s.get("Dirección"), city=s.get("Municipio"),
                lat=s_lat, lng=s_lng, price=price, fuel=fuel, updated_at=updated,
            ))
        return stations


class FrancePrixCarburantsClient(OfficialApiClient):
    country_code = "FR"
    source_name = "prix-carburants (data.economie.gouv.fr)"
    source_url = (
        "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/"
        "prix-des-carburants-en-france-flux-instantane-v2/records"
    )

    async def fetch_stations(self, http, lat, lng, radius_km, fuel):
        data = await _get_json(
            http,
            self.source_url,
            params={
                "where": f"within_distance(geom, geom'POINT({lng} {lat})', {radius_km:g}km)",
                "limit": 100,
            },
        )
        fields = [("gazole_prix", "gazole_maj")] if fuel is Fuel.DIESEL else [
            ("sp95_prix", "sp95_maj"),
            ("e10_prix", "e10_maj"),
        ]
        stations = []
        for s in data.get("results") or []:
            geom = s.get("geom") or {}
            price, updated = None, None
            for price_field, date_field in fields:
                price = parse_decimal(s.get(price_field))
                if price is not None:
                    updated = s.get(date_field)
                    break
            if price is None or geom.get("lat") is None:
                continue
            # The open dataset does not publish brand names.
            stations.append(Station(
                id=str(s["id"]), name=s.get("adresse") or "", brand=None,
                address=s.get("adresse"), city=s.get("ville"),
                lat=float(geom["lat"]), lng=float(geom["lon"]), price=price, fuel=fuel,
                updated_at=updated,
            ))
        return stations


class ItalyMimitClient(OfficialApiClient):
    country_code = "IT"
    source_name = "MIMIT Osservaprezzi Carburanti"
    source_url = "https://www.mimit.gov.it/images/exportCSV/"
    registry_url = source_url + "anagrafica_impianti_attivi.csv"
    prices_url = source_url + "prezzo_alle_8.csv"
    cache_ttl = 60 * 60

    @staticmethod
    def _rows(text: str) -> list[dict[str, str]]:
        lines = text.splitlines()
        # The first line is an extraction note ("Estrazione del YYYY-MM-DD").
        if lines and not ("|" in lines[0] or ";" in lines[0]):
            lines = lines[1:]
        if not lines:
            return []
        delimiter = "|" if "|" in lines[0] else ";"
        reader = csv.reader(lines, delimiter=delimiter)
        header = [h.strip() for h in next(reader)]
        return [dict(zip(header, row)) for row in reader if len(row) == len(header)]

    async def _load(self, http: httpx.AsyncClient) -> list[dict[str, Any]]:
        registry_resp, prices_resp = await asyncio.gather(
            http.get(self.registry_url, timeout=90), http.get(self.prices_url, timeout=90)
        )
        registry_resp.raise_for_status()
        prices_resp.raise_for_status()
        decode = lambda r: r.content.decode("utf-8", errors="replace")  # noqa: E731

        prices: dict[str, dict[str, tuple[float, int, str]]] = {}
        for row in self._rows(decode(prices_resp)):
            desc = row.get("descCarburante", "").strip()
            fuel = {"Benzina": Fuel.PETROL.value, "Gasolio": Fuel.DIESEL.value}.get(desc)
            price = parse_decimal(row.get("prezzo"))
            if fuel is None or price is None:
                continue
            is_self = 1 if row.get("isSelf", "").strip() == "1" else 0
            current = prices.setdefault(row["idImpianto"], {}).get(fuel)
            # Prefer self-service prices, then the cheaper one.
            if current is None or (is_self, -price) > (current[1], -current[0]):
                prices[row["idImpianto"]][fuel] = (price, is_self, row.get("dtComu", ""))

        stations = []
        for row in self._rows(decode(registry_resp)):
            station_prices = prices.get(row.get("idImpianto", ""))
            s_lat, s_lng = parse_coord(row.get("Latitudine")), parse_coord(row.get("Longitudine"))
            if not station_prices or s_lat is None or s_lng is None:
                continue
            stations.append({
                "id": row["idImpianto"],
                "name": row.get("Nome Impianto", "").replace("\t", " ").strip(),
                "brand": row.get("Bandiera", "").strip() or None,
                "address": row.get("Indirizzo", "").strip() or None,
                "city": row.get("Comune", "").strip() or None,
                "highway": row.get("Tipo Impianto", "").strip().lower().startswith("autostrad"),
                "lat": s_lat,
                "lng": s_lng,
                "prices": station_prices,
            })
        return stations

    async def fetch_stations(self, http, lat, lng, radius_km, fuel):
        rows = await cache.get_or_load("IT", self.cache_ttl, lambda: self._load(http))
        stations = []
        for row in rows:
            entry = row["prices"].get(fuel.value)
            if entry is None:
                continue
            distance = haversine_km(lat, lng, row["lat"], row["lng"])
            if distance > radius_km:
                continue
            station = Station(
                id=row["id"], name=row["name"], brand=row["brand"],
                address=row["address"], city=row["city"],
                lat=row["lat"], lng=row["lng"], price=entry[0], fuel=fuel,
                distance_km=distance, updated_at=entry[2] or None,
            )
            if row["highway"]:
                station.location = Location.HIGHWAY
            stations.append(station)
        return stations


class PortugalDgegClient(OfficialApiClient):
    country_code = "PT"
    source_name = "DGEG – Preços dos Combustíveis"
    source_url = "https://precoscombustiveis.dgeg.gov.pt/api/PrecoComb/PesquisarPostos"
    cache_ttl = 30 * 60
    # DGEG fuel type ids: 2101 = Gasóleo simples, 3201 = Gasolina simples 95.
    fuel_ids = {Fuel.DIESEL: 2101, Fuel.PETROL: 3201}

    async def _load(self, http: httpx.AsyncClient, fuel: Fuel) -> list[dict[str, Any]]:
        data = await _get_json(
            http,
            self.source_url,
            params={"idsTiposComb": self.fuel_ids[fuel], "qtdPorPagina": 10000, "pagina": 1},
            timeout=60,
        )
        if not data.get("status"):
            raise OfficialApiError(f"{self.source_name}: {data.get('mensagem', 'request rejected')}")
        return data.get("resultado") or []

    async def fetch_stations(self, http, lat, lng, radius_km, fuel):
        rows = await cache.get_or_load(f"PT:{fuel.value}", self.cache_ttl, lambda: self._load(http, fuel))
        stations = []
        for s in rows:
            price = parse_decimal(s.get("Preco"))
            s_lat, s_lng = parse_coord(s.get("Latitude")), parse_coord(s.get("Longitude"))
            if price is None or s_lat is None or s_lng is None:
                continue
            stations.append(Station(
                id=str(s["Id"]), name=s.get("Nome") or "", brand=(s.get("Marca") or "").strip() or None,
                address=s.get("Morada"), city=s.get("Localidade") or s.get("Municipio"),
                lat=s_lat, lng=s_lng, price=price, fuel=fuel,
                updated_at=s.get("DataAtualizacao"),
            ))
        return stations


class SloveniaGorivaClient(OfficialApiClient):
    country_code = "SI"
    source_name = "goriva.si"
    source_url = "https://goriva.si/api/v1/search/"
    max_pages = 5

    async def fetch_stations(self, http, lat, lng, radius_km, fuel):
        price_key = "dizel" if fuel is Fuel.DIESEL else "95"
        url: str | None = self.source_url
        params: dict[str, Any] | None = {"position": f"{lat},{lng}", "radius": int(radius_km * 1000)}
        stations = []
        for _ in range(self.max_pages):
            if not url:
                break
            data = await _get_json(http, url, params=params)
            for s in data.get("results") or []:
                price = parse_decimal((s.get("prices") or {}).get(price_key))
                if price is None:
                    continue
                distance_m = parse_decimal(s.get("distance"))
                stations.append(Station(
                    id=str(s["pk"]), name=s.get("name") or "", brand=None,
                    address=s.get("address"), city=s.get("zip_code"),
                    lat=float(s["lat"]), lng=float(s["lng"]), price=price, fuel=fuel,
                    distance_km=distance_m / 1000 if distance_m is not None else None,
                ))
            url, params = data.get("next"), None
        return stations


OFFICIAL_CLIENTS: dict[str, OfficialApiClient] = {
    client.country_code: client
    for client in [
        GermanyTankerkoenigClient(),
        AustriaEControlClient(),
        SpainMineturClient(),
        FrancePrixCarburantsClient(),
        ItalyMimitClient(),
        PortugalDgegClient(),
        SloveniaGorivaClient(),
    ]
}
