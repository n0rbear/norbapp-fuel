"""NorbApp Fuel – fuel price backend (FastAPI).

Run locally:
    uvicorn main:app --reload
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from statistics import mean, median
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

import pricing_matrix as pm
from api_clients import MAX_RADIUS_KM, OFFICIAL_CLIENTS, ApiNotConfiguredError, OfficialApiError
import tolls as tl
from base_price_updater import updater
from fx import EU_CURRENCIES, UnknownCurrencyError, fx
from pricing_matrix import BrandTier, Fuel, Location

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("norbapp-fuel")

APP_VERSION = "1.0.0"


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(20.0, connect=10.0),
        headers={"User-Agent": f"NorbAppFuel/{APP_VERSION} (+https://github.com/n0rbear/norbapp-fuel)"},
        follow_redirects=True,
    ) as client:
        app.state.http = client
        updater.start(client)
        yield
        await updater.stop()


app = FastAPI(
    title="NorbApp Fuel API",
    version=APP_VERSION,
    description=(
        "EU fuel prices: live station prices from official open APIs (DE, AT, ES, FR, IT, PT, SI), "
        "heuristic brand x location estimates for the other EU countries, and motorway tolls. "
        "Every price endpoint accepts `currency` (EU currencies, default EUR)."
    ),
    lifespan=lifespan,
)

_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["GET"],
    allow_headers=["*"],
)


CurrencyQuery = Query("EUR", min_length=3, max_length=3, description="Display currency: EUR, CZK, DKK, HUF, PLN, RON or SEK")
EuroClassQuery = Query(
    None, max_length=10,
    description="Car emission class: electric, 6, 5, 4, 3, 2, 1, 0 (or 'euro6'). Required for routes through "
                "countries with emission-based tolls (RO).",
)

# Response keys holding EUR amounts that are converted to the display currency.
_PRICE_KEYS = {"price", "price_low", "price_high", "base_price", "min", "max", "avg", "median"}


def _require_currency(currency: str) -> str:
    try:
        fx.rate(currency)
    except UnknownCurrencyError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return currency.upper()


def _convert(value: Any, currency: str) -> Any:
    if isinstance(value, dict):
        return {
            k: fx.convert(v, currency) if k in _PRICE_KEYS and isinstance(v, (int, float)) and not isinstance(v, bool)
            else _convert(v, currency)
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [_convert(v, currency) for v in value]
    return value


def _localize(payload: dict[str, Any], currency: str, per_litre: bool = True) -> dict[str, Any]:
    """Convert every EUR amount in `payload` to `currency` and label it."""
    out = _convert(payload, currency)
    out["currency"] = currency
    if per_litre:
        out["unit"] = f"{currency}/l"
    out["exchange_rate"] = fx.describe(currency)
    return out


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _require_country(code: str) -> pm.Country:
    country = pm.get_country(code)
    if country is None:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown or non-EU country code '{code}'. See GET /api/countries.",
        )
    return country


def _country_dict(country: pm.Country) -> dict[str, Any]:
    data: dict[str, Any] = {
        "code": country.code,
        "name": country.name,
        "name_hu": country.name_hu,
        "mode": "official" if country.official_api else "estimate",
        "local_currency": country.local_currency,
    }
    client = OFFICIAL_CLIENTS.get(country.code)
    if client:
        data["official_api"] = client.describe()
    return data


def _estimate_payload(
    country: pm.Country, fuel: Fuel, brand_tier: BrandTier | None, location: Location | None
) -> dict[str, Any]:
    if brand_tier is None and location is None:
        estimates = pm.estimate_matrix(country.code, fuel)
    else:
        tiers = [brand_tier] if brand_tier else list(BrandTier)
        locations = [location] if location else list(Location)
        estimates = [pm.estimate_price(country.code, fuel, t, loc) for loc in locations for t in tiers]
    return {
        "base_price": pm.base_price(country.code, fuel),
        "base_prices_as_of": pm.BASE_PRICES_AS_OF,
        "formula": "price = base_price * brand_multiplier * location_multiplier",
        "estimates": [e.as_dict() for e in estimates],
    }


def _fuel_basis(requested: Fuel, priced: Fuel) -> dict[str, Any]:
    """Which fuel the prices are for, with a note when it differs from the request."""
    data: dict[str, Any] = {"price_fuel": priced.value}
    if priced is not requested:
        data["fuel_note"] = (
            f"No separate {requested.value.upper()} price here; Euro-Super 95 ({priced.value}) price shown."
        )
    return data


def _summary(prices: list[float]) -> dict[str, float] | None:
    if not prices:
        return None
    return {
        "min": round(min(prices), 3),
        "max": round(max(prices), 3),
        "avg": round(mean(prices), 3),
        "median": round(median(prices), 3),
        "count": len(prices),
    }


@app.get("/", include_in_schema=False)
async def root() -> dict[str, str]:
    return {"service": "NorbApp Fuel API", "version": APP_VERSION, "docs": "/docs"}


@app.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    return {"status": "ok", "time": _now(), "base_prices_as_of": pm.BASE_PRICES_AS_OF}


@app.get("/api/base-prices", tags=["prices"])
async def get_base_prices(currency: str = CurrencyQuery) -> dict[str, Any]:
    """Current national averages (P_base) and the daily refresh status."""
    currency = _require_currency(currency)
    updater.ensure_fresh(app.state.http)
    status = updater.status()
    prices = {
        code: {f.value: fx.convert(p, currency) for f, p in values.items()}
        for code, values in pm.BASE_PRICES.items()
    }
    return {**status, "currency": currency, "unit": f"{currency}/l",
            "exchange_rate": fx.describe(currency), "prices": prices}


@app.get("/api/currencies", tags=["meta"])
async def list_currencies() -> dict[str, Any]:
    """The EU currencies that can be chosen for display, with ECB rates (1 EUR = rate)."""
    updater.ensure_fresh(app.state.http)
    return {
        "base": "EUR",
        "as_of": fx.as_of,
        "source": fx.source,
        "currencies": [
            {"code": code, "name_hu": name, "rate": fx.rate(code),
             "countries": sorted(c.code for c in pm.COUNTRIES.values() if c.local_currency == code)}
            for code, name in EU_CURRENCIES.items()
        ],
    }


@app.get("/api/countries", tags=["prices"])
async def list_countries() -> dict[str, Any]:
    """All 27 EU countries with their pricing mode (official API or estimate)."""
    return {"countries": [_country_dict(c) for c in pm.COUNTRIES.values()]}


@app.get("/api/prices", tags=["prices"])
async def get_prices(
    country: str = Query(..., min_length=2, max_length=2, description="ISO 3166-1 alpha-2 EU country code"),
    fuel: Fuel = Query(Fuel.PETROL),
    location: Location | None = Query(None, description="highway | city | suburb"),
    brand_tier: BrandTier | None = Query(None, description="discount | mainstream | premium"),
    brand: str | None = Query(None, max_length=64, description="Brand name, mapped to a tier"),
    lat: float | None = Query(None, ge=-90, le=90),
    lng: float | None = Query(None, ge=-180, le=180),
    radius_km: float = Query(10.0, gt=0, le=MAX_RADIUS_KM),
    currency: str = CurrencyQuery,
) -> dict[str, Any]:
    """Main frontend endpoint.

    * Official-API countries + lat/lng: live nearby station prices.
    * Otherwise (or if the live API fails): heuristic estimate(s).
      With neither `location` nor `brand_tier`/`brand` the full 3x3 matrix is returned.
    """
    c = _require_country(country)
    currency = _require_currency(currency)
    updater.ensure_fresh(app.state.http)
    if (lat is None) != (lng is None):
        raise HTTPException(status_code=422, detail="lat and lng must be given together")
    if brand and brand_tier is None:
        brand_tier = pm.classify_brand(brand)

    response: dict[str, Any] = {
        "country": c.code,
        "country_name": c.name,
        "country_name_hu": c.name_hu,
        "fuel": fuel.value,
        "generated_at": _now(),
    }

    client = OFFICIAL_CLIENTS.get(c.code)
    # E10 is only priced separately where the official source publishes it;
    # elsewhere the Super 95 price stands in and the response says so.
    live_fuel = fuel if fuel is not Fuel.E10 or (client and client.supports_e10) else Fuel.PETROL
    fallback_reason: str | None = None
    if client is None:
        fallback_reason = None
    elif lat is None:
        fallback_reason = "lat/lng not provided; live station prices need coordinates"
    else:
        try:
            stations = await client.stations_near(app.state.http, lat, lng, radius_km, live_fuel)
        except ApiNotConfiguredError as exc:
            fallback_reason = str(exc)
        except OfficialApiError as exc:
            logger.warning("Official API failed for %s: %s", c.code, exc)
            fallback_reason = f"official API unavailable ({exc})"
        else:
            if brand_tier:
                stations = [s for s in stations if s.brand_tier is brand_tier]
            if location:
                stations = [s for s in stations if (s.location or Location.CITY) is location]
            response.update({
                "mode": "official",
                "source": client.source_name,
                "source_url": client.source_url,
                "radius_km": radius_km,
                "summary": _summary([s.price for s in stations]),
                "stations": [s.as_dict() for s in stations],
                **_fuel_basis(fuel, live_fuel),
            })
            return _localize(response, currency)

    response.update({
        "mode": "estimate",
        "source": "heuristic pricing matrix",
        **_estimate_payload(c, fuel, brand_tier, location),
        **_fuel_basis(fuel, fuel.price_basis),
    })
    if fallback_reason:
        response["fallback_reason"] = fallback_reason
    return _localize(response, currency)


@app.get("/api/estimate", tags=["prices"])
async def get_estimate(
    country: str = Query(..., min_length=2, max_length=2),
    fuel: Fuel = Query(Fuel.PETROL),
    location: Location = Query(Location.CITY),
    brand_tier: BrandTier | None = Query(None),
    brand: str | None = Query(None, max_length=64),
    currency: str = CurrencyQuery,
) -> dict[str, Any]:
    """Single heuristic estimate for any EU country (also for official-API countries)."""
    c = _require_country(country)
    currency = _require_currency(currency)
    updater.ensure_fresh(app.state.http)
    tier = brand_tier or pm.classify_brand(brand)
    estimate = pm.estimate_price(c.code, fuel, tier, location)
    return _localize({"base_prices_as_of": pm.BASE_PRICES_AS_OF, **estimate.as_dict()}, currency)


@app.get("/api/matrix", tags=["prices"])
async def get_matrix(
    country: str = Query(..., min_length=2, max_length=2),
    fuel: Fuel = Query(Fuel.PETROL),
    currency: str = CurrencyQuery,
) -> dict[str, Any]:
    """Full 3x3 brand x location estimate matrix for a country."""
    c = _require_country(country)
    currency = _require_currency(currency)
    updater.ensure_fresh(app.state.http)
    return _localize({
        "country": c.code,
        "fuel": fuel.value,
        "brand_multipliers": {k.value: v for k, v in pm.BRAND_MULTIPLIERS.items()},
        "location_multipliers": {loc.value: pm.location_multiplier(c.code, loc) for loc in Location},
        **_estimate_payload(c, fuel, None, None),
    }, currency)


@app.get("/api/brands/classify", tags=["prices"])
async def classify_brand(name: str = Query(..., min_length=1, max_length=64)) -> dict[str, str]:
    """Map a brand or station name to its price tier."""
    return {"name": name, "brand_tier": pm.classify_brand(name).value}


# --- Motorway tolls ---------------------------------------------------------


def _money(amount: float, from_currency: str, currency: str) -> float:
    return fx.convert(fx.to_eur(amount, from_currency), currency)


def _emission_group(euro_class: str | None) -> str | None:
    try:
        return tl.emission_group(euro_class)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _vignette_dict(v: tl.VignetteOption, t: tl.CountryTolls, currency: str, group: str | None) -> dict[str, Any]:
    known = v.price_by_group is None or group is not None
    data: dict[str, Any] = {
        "id": v.id, "label": v.label, "days": v.days,
        "price": _money(v.price_for(group), t.currency, currency) if known else None,
        "price_local": v.price_for(group) if known else None,
        "note": v.note, "for_trips": v.for_trips,
    }
    if v.price_by_group:
        data["price_by_emission_group"] = {
            g: {"label": tl.EMISSION_GROUP_LABELS[g], "price": _money(p, t.currency, currency), "price_local": p}
            for g, p in v.price_by_group.items()
        }
    return data


def _tolls_dict(t: tl.CountryTolls, currency: str, group: str | None = None) -> dict[str, Any]:
    country = pm.COUNTRIES[t.code]
    return {
        "country": t.code,
        "country_name": country.name,
        "country_name_hu": country.name_hu,
        "system": t.system,
        "summary_hu": t.summary_hu,
        "sold_in_currency": t.currency,
        "requires_euro_class": t.emission_based,
        "vignettes": [_vignette_dict(v, t, currency, group) for v in t.vignettes],
        "per_km": _money(t.per_km, t.currency, currency) if t.per_km is not None else None,
        "special_tolls": [
            {
                "id": s.id, "name": s.name, "road": s.road, "note": s.note,
                "price": _money(s.price, s.currency or t.currency, currency),
                "price_local": s.price, "local_currency": s.currency or t.currency,
            }
            for s in t.special
        ],
        "sources": list(t.sources) + [tl.GENERAL_SOURCE],
    }


def _require_tolls(code: str) -> tl.CountryTolls:
    _require_country(code)
    return tl.TOLLS[code.upper()]


@app.get("/api/tolls", tags=["tolls"])
async def list_tolls(currency: str = CurrencyQuery, euro_class: str | None = EuroClassQuery) -> dict[str, Any]:
    """Passenger-car motorway tolls of all 27 EU countries."""
    currency = _require_currency(currency)
    group = _emission_group(euro_class)
    return {
        "as_of": tl.TOLLS_AS_OF,
        "vehicle": "passenger car <= 3.5 t (class 1)",
        "currency": currency,
        "exchange_rate": fx.describe(currency),
        "euro_classes": list(tl.EURO_CLASSES),
        "countries": [_tolls_dict(t, currency, group) for t in sorted(tl.TOLLS.values(), key=lambda t: t.code)],
    }


def _parse_km(raw: str | None) -> dict[str, float]:
    """Parse 'AT:120,FR:500' into {'AT': 120.0, 'FR': 500.0}."""
    result: dict[str, float] = {}
    for part in (raw or "").split(","):
        if not part.strip():
            continue
        code, _, km = part.partition(":")
        try:
            result[code.strip().upper()] = float(km)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=f"Invalid highway_km entry '{part}'") from exc
        if result[code.strip().upper()] < 0:
            raise HTTPException(status_code=422, detail=f"Negative distance in '{part}'")
    return result


@app.get("/api/tolls/estimate", tags=["tolls"])
async def estimate_tolls(
    countries: str = Query(..., description="Comma-separated country codes on the route, e.g. AT,HU"),
    days: int = Query(1, ge=1, le=365, description="Trip length in days (vignette validity needed)"),
    highway_km: str | None = Query(None, description="Tolled motorway km per distance-based country, e.g. FR:500,IT:120"),
    special: str | None = Query(None, description="Comma-separated special toll ids to include, e.g. a13-brenner"),
    euro_class: str | None = EuroClassQuery,
    currency: str = CurrencyQuery,
) -> dict[str, Any]:
    """Estimated toll cost of a trip: cheapest vignette combination per country,
    per-km estimate for distance-based countries, plus selected special tolls."""
    currency = _require_currency(currency)
    codes = list(dict.fromkeys(c.strip().upper() for c in countries.split(",") if c.strip()))
    if not codes:
        raise HTTPException(status_code=422, detail="countries is empty")
    group = _emission_group(euro_class)
    route = [_require_tolls(code) for code in codes]
    needs_class = [t.code for t in route if t.emission_based]
    if needs_class and group is None:
        raise HTTPException(status_code=422, detail={
            "error": "euro_class_required",
            "message": f"The route includes countries with emission-based tolls ({', '.join(needs_class)}); "
                       f"pass euro_class ({', '.join(tl.EURO_CLASSES)}).",
            "countries": needs_class,
        })
    km = _parse_km(highway_km)
    wanted = {s.strip() for s in (special or "").split(",") if s.strip()}

    items, total_eur = [], 0.0
    for t in route:
        code = t.code
        item: dict[str, Any] = {"country": code, "system": t.system, "lines": []}
        if t.system == "vignette":
            cost, combo = tl.cheapest_vignettes(t.vignettes, days, group)
            for v in combo:
                item["lines"].append({"type": "vignette", "id": v.id, "label": v.label,
                                      "eur": fx.to_eur(v.price_for(group), t.currency)})
            if t.emission_based:
                item["emission_group"] = group
        elif t.system == "distance" and t.per_km is not None and code in km:
            item["lines"].append({"type": "distance", "km": km[code], "estimate": True,
                                  "eur": fx.to_eur(t.per_km * km[code], t.currency)})
        elif t.system == "distance":
            item["note"] = "Distance-based tolls: pass highway_km for an estimate or pick special tolls."
        for s in t.special:
            if s.id in wanted or f"{code}:{s.id}" in wanted:
                item["lines"].append({"type": "special", "id": s.id, "label": s.name,
                                      "eur": fx.to_eur(s.price, s.currency or t.currency)})
        subtotal = sum(line["eur"] for line in item["lines"])
        total_eur += subtotal
        for line in item["lines"]:
            line["price"] = fx.convert(line.pop("eur"), currency)
        item["subtotal"] = fx.convert(subtotal, currency)
        items.append(item)

    return {
        "as_of": tl.TOLLS_AS_OF,
        "days": days,
        "euro_class": euro_class,
        "currency": currency,
        "exchange_rate": fx.describe(currency),
        "countries": items,
        "total": fx.convert(total_eur, currency),
    }


@app.get("/api/tolls/{country}", tags=["tolls"])
async def get_tolls(
    country: str, currency: str = CurrencyQuery, euro_class: str | None = EuroClassQuery
) -> dict[str, Any]:
    """Toll system, vignette prices and special tolls of one country."""
    currency = _require_currency(currency)
    group = _emission_group(euro_class)
    t = _require_tolls(country)
    return {"as_of": tl.TOLLS_AS_OF, "currency": currency,
            "exchange_rate": fx.describe(currency), **_tolls_dict(t, currency, group)}
