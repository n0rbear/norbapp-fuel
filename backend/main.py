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
from base_price_updater import updater
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
        "EU fuel prices: live station prices from official open APIs (DE, AT, ES, FR, IT, PT, SI) "
        "and heuristic brand x location estimates for the other EU countries."
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
async def get_base_prices() -> dict[str, Any]:
    """Current national averages (P_base) and the daily refresh status."""
    updater.ensure_fresh(app.state.http)
    return {
        **updater.status(),
        "currency": "EUR",
        "unit": "EUR/l",
        "prices": {code: {f.value: p for f, p in values.items()} for code, values in pm.BASE_PRICES.items()},
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
) -> dict[str, Any]:
    """Main frontend endpoint.

    * Official-API countries + lat/lng: live nearby station prices.
    * Otherwise (or if the live API fails): heuristic estimate(s).
      With neither `location` nor `brand_tier`/`brand` the full 3x3 matrix is returned.
    """
    c = _require_country(country)
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
        "currency": "EUR",
        "unit": "EUR/l",
        "generated_at": _now(),
    }

    client = OFFICIAL_CLIENTS.get(c.code)
    fallback_reason: str | None = None
    if client is None:
        fallback_reason = None
    elif lat is None:
        fallback_reason = "lat/lng not provided; live station prices need coordinates"
    else:
        try:
            stations = await client.stations_near(app.state.http, lat, lng, radius_km, fuel)
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
            })
            return response

    response.update({
        "mode": "estimate",
        "source": "heuristic pricing matrix",
        **_estimate_payload(c, fuel, brand_tier, location),
    })
    if fallback_reason:
        response["fallback_reason"] = fallback_reason
    return response


@app.get("/api/estimate", tags=["prices"])
async def get_estimate(
    country: str = Query(..., min_length=2, max_length=2),
    fuel: Fuel = Query(Fuel.PETROL),
    location: Location = Query(Location.CITY),
    brand_tier: BrandTier | None = Query(None),
    brand: str | None = Query(None, max_length=64),
) -> dict[str, Any]:
    """Single heuristic estimate for any EU country (also for official-API countries)."""
    c = _require_country(country)
    updater.ensure_fresh(app.state.http)
    tier = brand_tier or pm.classify_brand(brand)
    estimate = pm.estimate_price(c.code, fuel, tier, location)
    return {"currency": "EUR", "unit": "EUR/l", "base_prices_as_of": pm.BASE_PRICES_AS_OF, **estimate.as_dict()}


@app.get("/api/matrix", tags=["prices"])
async def get_matrix(
    country: str = Query(..., min_length=2, max_length=2),
    fuel: Fuel = Query(Fuel.PETROL),
) -> dict[str, Any]:
    """Full 3x3 brand x location estimate matrix for a country."""
    c = _require_country(country)
    updater.ensure_fresh(app.state.http)
    return {
        "country": c.code,
        "fuel": fuel.value,
        "currency": "EUR",
        "unit": "EUR/l",
        "brand_multipliers": {k.value: v for k, v in pm.BRAND_MULTIPLIERS.items()},
        "location_multipliers": {loc.value: pm.location_multiplier(c.code, loc) for loc in Location},
        **_estimate_payload(c, fuel, None, None),
    }


@app.get("/api/brands/classify", tags=["prices"])
async def classify_brand(name: str = Query(..., min_length=1, max_length=64)) -> dict[str, str]:
    """Map a brand or station name to its price tier."""
    return {"name": name, "brand_tier": pm.classify_brand(name).value}
