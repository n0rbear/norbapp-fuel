"""Heuristic fuel price estimation matrix.

For EU countries without a free official station-level price API, the price of
a station is estimated from a national average base price (P_base):

    P_est = P_base(country, fuel) * M_brand(tier) * M_location(country, location)

The base prices are national averages in EUR/litre taken from the European
Commission Weekly Oil Bulletin and must be refreshed periodically. They can be
overridden at runtime without code changes via the BASE_PRICES_JSON
environment variable or a JSON file referenced by BASE_PRICES_FILE.
"""

from __future__ import annotations

import json
import logging
import os
import re
import unicodedata
from dataclasses import dataclass
from enum import Enum
from pathlib import Path

from fx import fx

logger = logging.getLogger(__name__)

BASE_PRICES_AS_OF = "2026-10-12"

# Uncertainty band applied to every estimate (+/- this fraction).
ESTIMATE_UNCERTAINTY = 0.035


class Fuel(str, Enum):
    PETROL = "petrol"  # Euro-Super 95 (E5, or E10 where E5 is not listed)
    DIESEL = "diesel"
    E10 = "e10"  # Super E10; only some official sources publish it separately

    @property
    def price_basis(self) -> "Fuel":
        """The fuel whose base price is used: the Oil Bulletin has no separate E10 series."""
        return Fuel.PETROL if self is Fuel.E10 else self


class BrandTier(str, Enum):
    DISCOUNT = "discount"
    MAINSTREAM = "mainstream"
    PREMIUM = "premium"


class Location(str, Enum):
    HIGHWAY = "highway"
    CITY = "city"
    SUBURB = "suburb"


@dataclass(frozen=True)
class Country:
    code: str
    name: str
    name_hu: str
    official_api: bool
    local_currency: str = "EUR"
    eu: bool = True


COUNTRIES: dict[str, Country] = {
    c.code: c
    for c in [
        # Countries with a free official station-level price API.
        Country("DE", "Germany", "Németország", True),
        Country("AT", "Austria", "Ausztria", True),
        Country("ES", "Spain", "Spanyolország", True),
        Country("FR", "France", "Franciaország", True),
        Country("IT", "Italy", "Olaszország", True),
        Country("PT", "Portugal", "Portugália", True),
        Country("SI", "Slovenia", "Szlovénia", True),
        # Countries served by the heuristic estimation matrix.
        Country("BE", "Belgium", "Belgium", False),
        Country("BG", "Bulgaria", "Bulgária", False),
        Country("HR", "Croatia", "Horvátország", False),
        Country("CY", "Cyprus", "Ciprus", False),
        Country("CZ", "Czechia", "Csehország", False, "CZK"),
        Country("DK", "Denmark", "Dánia", False, "DKK"),
        Country("EE", "Estonia", "Észtország", False),
        Country("FI", "Finland", "Finnország", False),
        Country("GR", "Greece", "Görögország", False),
        Country("HU", "Hungary", "Magyarország", False, "HUF"),
        Country("IE", "Ireland", "Írország", False),
        Country("LV", "Latvia", "Lettország", False),
        Country("LT", "Lithuania", "Litvánia", False),
        Country("LU", "Luxembourg", "Luxemburg", False),
        Country("MT", "Malta", "Málta", False),
        Country("NL", "Netherlands", "Hollandia", False),
        Country("PL", "Poland", "Lengyelország", False, "PLN"),
        Country("RO", "Romania", "Románia", False, "RON"),
        Country("SK", "Slovakia", "Szlovákia", False),
        Country("SE", "Sweden", "Svédország", False, "SEK"),
        # Non-EU neighbours on common routes (no Oil Bulletin data, see below).
        Country("CH", "Switzerland", "Svájc", False, "CHF", eu=False),
        Country("LI", "Liechtenstein", "Liechtenstein", False, "CHF", eu=False),
        Country("MC", "Monaco", "Monaco", False, "EUR", eu=False),
        # Former Yugoslavia (outside the EU) and Turkey: regional model, see below.
        Country("RS", "Serbia", "Szerbia", False, "RSD", eu=False),
        Country("BA", "Bosnia and Herzegovina", "Bosznia-Hercegovina", False, "BAM", eu=False),
        Country("ME", "Montenegro", "Montenegró", False, "EUR", eu=False),
        Country("MK", "North Macedonia", "Észak-Macedónia", False, "MKD", eu=False),
        Country("XK", "Kosovo", "Koszovó", False, "EUR", eu=False),
        Country("TR", "Turkey", "Törökország", False, "TRY", eu=False),
    ]
}

# The EU Weekly Oil Bulletin does not cover the non-EU countries, and
# Switzerland has no open daily fuel price feed. Their base prices:
#   CH  anchored to a TCS Benzinpreis-Radar national average (CHF) and moved
#       every morning with the neighbours' bulletin averages and the ECB rate
#       (see swiss_base_price); BASE_PRICES_JSON still overrides it.
#   LI  same market and currency as Switzerland -> Swiss average.
#   MC  supplied from France, French fuel taxes apply -> French average.
DERIVED_BASE_PRICES: dict[str, str] = {"LI": "CH", "MC": "FR"}

# Swiss anchor: TCS Benzinpreis-Radar national average. Re-anchor when a newer
# TCS figure is known: update prices/as_of and set `reference` to the
# neighbours' bulletin average (EUR) and `chf_rate` to the ECB rate of that week.
SWISS_ANCHOR = {
    "source": "TCS Benzinpreis-Radar",
    "as_of": "2026-10-06",
    "prices_chf": {Fuel.PETROL: 2.028, Fuel.DIESEL: 2.313},
    # DE/AT/FR/IT average of the 2026-10-12 bulletin (EUR/l) and ECB CHF rate.
    "reference": {Fuel.PETROL: (2.214 + 1.865 + 2.212 + 2.021) / 4, Fuel.DIESEL: (2.270 + 2.162 + 2.328 + 2.241) / 4},
    "chf_rate": 0.9272,
}
SWISS_REFERENCE_COUNTRIES = ("DE", "AT", "FR", "IT")
# Product cost moves pass through to Swiss pumps in absolute terms; the
# neighbours' averages include ~20.5% VAT, Swiss prices 8.1% (fixed per-litre
# mineral oil tax). So a 1.00 move next door is ~0.90 in Switzerland.
SWISS_PASS_THROUGH = 1.081 / 1.205

# Western Balkans and Turkey: no Oil Bulletin and no open price feed. Their
# national average is modelled as a fixed ratio of the regional EU average
# (HR, HU, SI, BG, RO, GR) of the same morning, so it follows the market day
# by day. The ratios come from 2025 national averages (government-regulated
# prices in RS, ME, MK; market prices in BA, XK, TR) and are approximate:
# re-calibrate them, or set BASE_PRICES_JSON, when better figures are known.
# Community price reports refine the stations on top of this.
REGIONAL_REFERENCE_COUNTRIES = ("HR", "HU", "SI", "BG", "RO", "GR")
REGIONAL_RATIOS_AS_OF = "2025"
REGIONAL_RATIOS: dict[str, dict[Fuel, float]] = {
    "RS": {Fuel.PETROL: 1.04, Fuel.DIESEL: 1.15},
    "BA": {Fuel.PETROL: 0.83, Fuel.DIESEL: 0.87},
    "ME": {Fuel.PETROL: 1.03, Fuel.DIESEL: 0.97},
    "MK": {Fuel.PETROL: 0.87, Fuel.DIESEL: 0.82},
    "XK": {Fuel.PETROL: 0.93, Fuel.DIESEL: 0.93},
    "TR": {Fuel.PETROL: 0.74, Fuel.DIESEL: 0.77},
}

# National average pump prices incl. taxes, EUR/litre, from the European
# Commission Weekly Oil Bulletin (prices with taxes, week of 2026-10-12).
# The official-API countries are included too: they are used as a fallback
# when the live API is unavailable or no coordinates were supplied.
DEFAULT_BASE_PRICES: dict[str, dict[Fuel, float]] = {
    "DE": {Fuel.PETROL: 2.214, Fuel.DIESEL: 2.270},
    "AT": {Fuel.PETROL: 1.865, Fuel.DIESEL: 2.162},
    "ES": {Fuel.PETROL: 1.790, Fuel.DIESEL: 1.889},
    "FR": {Fuel.PETROL: 2.212, Fuel.DIESEL: 2.328},
    "IT": {Fuel.PETROL: 2.021, Fuel.DIESEL: 2.241},
    "PT": {Fuel.PETROL: 2.110, Fuel.DIESEL: 2.148},
    "SI": {Fuel.PETROL: 1.761, Fuel.DIESEL: 1.918},
    "BE": {Fuel.PETROL: 1.977, Fuel.DIESEL: 2.335},
    "BG": {Fuel.PETROL: 1.649, Fuel.DIESEL: 1.874},
    "HR": {Fuel.PETROL: 1.803, Fuel.DIESEL: 1.954},
    "CY": {Fuel.PETROL: 1.760, Fuel.DIESEL: 2.021},
    "CZ": {Fuel.PETROL: 1.859, Fuel.DIESEL: 1.921},
    "DK": {Fuel.PETROL: 2.658, Fuel.DIESEL: 2.502},
    "EE": {Fuel.PETROL: 1.920, Fuel.DIESEL: 2.013},
    "FI": {Fuel.PETROL: 2.319, Fuel.DIESEL: 2.536},
    "GR": {Fuel.PETROL: 2.199, Fuel.DIESEL: 2.118},
    "HU": {Fuel.PETROL: 1.754, Fuel.DIESEL: 1.942},
    "IE": {Fuel.PETROL: 1.983, Fuel.DIESEL: 2.164},
    "LV": {Fuel.PETROL: 1.943, Fuel.DIESEL: 2.072},
    "LT": {Fuel.PETROL: 1.925, Fuel.DIESEL: 2.205},
    "LU": {Fuel.PETROL: 1.876, Fuel.DIESEL: 2.045},
    "MT": {Fuel.PETROL: 1.340, Fuel.DIESEL: 1.210},
    "NL": {Fuel.PETROL: 2.462, Fuel.DIESEL: 2.482},
    "PL": {Fuel.PETROL: 1.570, Fuel.DIESEL: 1.795},
    "RO": {Fuel.PETROL: 1.898, Fuel.DIESEL: 2.041},
    "SK": {Fuel.PETROL: 1.846, Fuel.DIESEL: 1.919},
    "SE": {Fuel.PETROL: 1.692, Fuel.DIESEL: 2.050},
}

BRAND_MULTIPLIERS: dict[BrandTier, float] = {
    BrandTier.DISCOUNT: 0.96,
    BrandTier.MAINSTREAM: 1.00,
    BrandTier.PREMIUM: 1.035,
}

LOCATION_MULTIPLIERS: dict[Location, float] = {
    Location.HIGHWAY: 1.08,
    Location.CITY: 1.00,
    Location.SUBURB: 0.98,
}

# Country-specific location multipliers where the motorway premium is known to
# differ significantly from the EU-wide default. Missing entries fall back to
# LOCATION_MULTIPLIERS.
COUNTRY_LOCATION_OVERRIDES: dict[str, dict[Location, float]] = {
    "DE": {Location.HIGHWAY: 1.12},
    "IT": {Location.HIGHWAY: 1.06},
    "MT": {Location.HIGHWAY: 1.00, Location.SUBURB: 1.00},  # state-regulated price
    "HU": {Location.HIGHWAY: 1.05},
    "SI": {Location.HIGHWAY: 1.04},
}

# Brand name keywords (normalised, lower case) -> price tier.
BRAND_TIERS: dict[str, BrandTier] = {
    # Premium: international majors, typically priced above average.
    "shell": BrandTier.PREMIUM,
    "bp": BrandTier.PREMIUM,
    "aral": BrandTier.PREMIUM,
    "esso": BrandTier.PREMIUM,
    "exxon": BrandTier.PREMIUM,
    "mobil": BrandTier.PREMIUM,
    "omv": BrandTier.PREMIUM,
    "totalenergies": BrandTier.PREMIUM,
    "total": BrandTier.PREMIUM,
    "eni": BrandTier.PREMIUM,
    "agip": BrandTier.PREMIUM,
    "texaco": BrandTier.PREMIUM,
    # Mainstream: national/regional chains.
    "repsol": BrandTier.MAINSTREAM,
    "cepsa": BrandTier.MAINSTREAM,
    "moeve": BrandTier.MAINSTREAM,
    "galp": BrandTier.MAINSTREAM,
    "petrol": BrandTier.MAINSTREAM,
    "mol": BrandTier.MAINSTREAM,
    "slovnaft": BrandTier.MAINSTREAM,
    "ina": BrandTier.MAINSTREAM,
    "orlen": BrandTier.MAINSTREAM,
    "lotos": BrandTier.MAINSTREAM,
    "benzina": BrandTier.MAINSTREAM,
    "lukoil": BrandTier.MAINSTREAM,
    "circle k": BrandTier.MAINSTREAM,
    "q8": BrandTier.MAINSTREAM,
    "ip": BrandTier.MAINSTREAM,
    "tamoil": BrandTier.MAINSTREAM,
    "avia": BrandTier.MAINSTREAM,
    "socar": BrandTier.MAINSTREAM,
    "rompetrol": BrandTier.MAINSTREAM,
    "petrom": BrandTier.MAINSTREAM,
    "neste": BrandTier.MAINSTREAM,
    "st1": BrandTier.MAINSTREAM,
    "preem": BrandTier.MAINSTREAM,
    "okq8": BrandTier.MAINSTREAM,
    "applegreen": BrandTier.MAINSTREAM,
    "maxol": BrandTier.MAINSTREAM,
    "eko": BrandTier.MAINSTREAM,
    "hellenic": BrandTier.MAINSTREAM,
    "crodux": BrandTier.MAINSTREAM,
    "tifon": BrandTier.MAINSTREAM,
    "westfalen": BrandTier.MAINSTREAM,
    "hoyer": BrandTier.MAINSTREAM,
    "turmol": BrandTier.MAINSTREAM,
    "eneos": BrandTier.MAINSTREAM,
    # Discount: unmanned, supermarket and low-cost chains.
    "jet": BrandTier.DISCOUNT,
    "star": BrandTier.DISCOUNT,
    "hem": BrandTier.DISCOUNT,
    "tango": BrandTier.DISCOUNT,
    "ballenoil": BrandTier.DISCOUNT,
    "plenoil": BrandTier.DISCOUNT,
    "plenergy": BrandTier.DISCOUNT,
    "petroprix": BrandTier.DISCOUNT,
    "carrefour": BrandTier.DISCOUNT,
    "leclerc": BrandTier.DISCOUNT,
    "intermarche": BrandTier.DISCOUNT,
    "auchan": BrandTier.DISCOUNT,
    "super u": BrandTier.DISCOUNT,
    "systeme u": BrandTier.DISCOUNT,
    "alcampo": BrandTier.DISCOUNT,
    "eroski": BrandTier.DISCOUNT,
    "costco": BrandTier.DISCOUNT,
    "tesco": BrandTier.DISCOUNT,
    "globus": BrandTier.DISCOUNT,
    "kaufland": BrandTier.DISCOUNT,
    "lidl": BrandTier.DISCOUNT,
    "prio": BrandTier.DISCOUNT,
    "gopetrol": BrandTier.DISCOUNT,
    "orlen easy": BrandTier.DISCOUNT,
    "moya": BrandTier.DISCOUNT,
    "ingo": BrandTier.DISCOUNT,
    "turbo": BrandTier.DISCOUNT,
    "tanke": BrandTier.DISCOUNT,
    "diskont": BrandTier.DISCOUNT,
    "discount": BrandTier.DISCOUNT,
}

# Multi-word keywords first so "orlen easy" wins over "orlen".
_BRAND_KEYWORDS = sorted(BRAND_TIERS, key=lambda k: (-len(k.split()), -len(k)))

_HIGHWAY_PATTERNS = re.compile(
    r"\b(autobahn|bab|raststatte|rastanlage|autostrada|autopista|autovia|autoestrada|"
    r"autoroute|aire de|area di servizio|area de servicio|motorway|autocesta|avtocesta|"
    r"dalnice|autopalya|autostrad)\b",
)


def _normalise(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9 ]+", " ", text.lower()).strip()


def classify_brand(name: str | None) -> BrandTier:
    """Map a free-text brand or station name to a price tier."""
    if not name:
        return BrandTier.MAINSTREAM
    padded = f" {_normalise(name)} "
    for keyword in _BRAND_KEYWORDS:
        if f" {keyword} " in padded:
            return BRAND_TIERS[keyword]
    return BrandTier.MAINSTREAM


def guess_location(*texts: str | None) -> Location | None:
    """Best-effort motorway detection from station name/address text."""
    joined = _normalise(" ".join(t for t in texts if t))
    if _HIGHWAY_PATTERNS.search(joined):
        return Location.HIGHWAY
    return None


def _load_overrides() -> dict[str, dict[Fuel, float]]:
    raw = os.getenv("BASE_PRICES_JSON")
    path = os.getenv("BASE_PRICES_FILE")
    if not raw and path:
        try:
            raw = Path(path).read_text(encoding="utf-8")
        except OSError as exc:
            logger.warning("Cannot read BASE_PRICES_FILE %s: %s", path, exc)
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return {
            code.upper(): {Fuel(fuel): float(price) for fuel, price in prices.items()}
            for code, prices in data.items()
        }
    except (ValueError, TypeError, AttributeError) as exc:
        logger.warning("Ignoring invalid base price override: %s", exc)
        return {}


def _build_base_prices(
    fetched: dict[str, dict[Fuel, float]] | None = None,
) -> dict[str, dict[Fuel, float]]:
    """Defaults <- fetched bulletin prices <- manual env overrides (highest)."""
    prices = {code: dict(values) for code, values in DEFAULT_BASE_PRICES.items()}
    for code, values in (fetched or {}).items():
        if code in prices:
            prices[code].update(values)
    for code, values in _load_overrides().items():
        if code in prices:
            prices[code].update(values)
        elif code in COUNTRIES:
            prices[code] = dict(values)
        else:
            logger.warning("Ignoring base price override for unknown country %s", code)
    return prices


BASE_PRICES = _build_base_prices()


def apply_base_prices(fetched: dict[str, dict[Fuel, float]], as_of: str) -> None:
    """Swap in freshly fetched national averages (manual overrides still win)."""
    global BASE_PRICES_AS_OF
    BASE_PRICES.update(_build_base_prices(fetched))
    BASE_PRICES_AS_OF = as_of


def get_country(code: str) -> Country | None:
    return COUNTRIES.get(code.upper())


def base_price(country_code: str, fuel: Fuel) -> float:
    """National average in EUR/l (manual overrides > bulletin > derived/local)."""
    code = country_code.upper()
    basis = fuel.price_basis
    if code in BASE_PRICES and basis in BASE_PRICES[code]:
        return BASE_PRICES[code][basis]
    if code in DERIVED_BASE_PRICES:
        return base_price(DERIVED_BASE_PRICES[code], fuel)
    if code == "CH":
        return swiss_base_price(basis)
    if code in REGIONAL_RATIOS:
        return regional_base_price(code, basis)
    raise KeyError(code)


def regional_base_price(code: str, fuel: Fuel) -> float:
    """Western Balkans / Turkey average in EUR/l: ratio x today's regional EU average."""
    basis = fuel.price_basis
    reference = sum(BASE_PRICES[c][basis] for c in REGIONAL_REFERENCE_COUNTRIES) / len(REGIONAL_REFERENCE_COUNTRIES)
    return round(reference * REGIONAL_RATIOS[code][basis], 3)


def swiss_base_price(fuel: Fuel) -> float:
    """Swiss average in EUR/l: TCS anchor + the neighbours' change since then.

    CH(t) [CHF] = anchor + pass_through * (ref(t) * rate(t) - ref(anchor) * rate(anchor))
    where ref is the DE/AT/FR/IT bulletin average (EUR/l) and rate the ECB
    CHF rate. It moves whenever the bulletin or the exchange rate refreshes.
    """
    basis = fuel.price_basis
    rate = fx.rate("CHF")
    reference = sum(BASE_PRICES[c][basis] for c in SWISS_REFERENCE_COUNTRIES) / len(SWISS_REFERENCE_COUNTRIES)
    anchor = SWISS_ANCHOR["prices_chf"][basis]
    anchor_reference = SWISS_ANCHOR["reference"][basis] * SWISS_ANCHOR["chf_rate"]
    chf = anchor + SWISS_PASS_THROUGH * (reference * rate - anchor_reference)
    return round(chf / rate, 3)


def base_price_source(country_code: str) -> dict[str, str]:
    """Where a country's base price comes from, for API consumers."""
    code = country_code.upper()
    if code in _load_overrides():
        return {"source": "manual override (BASE_PRICES_JSON / BASE_PRICES_FILE)"}
    if code in DERIVED_BASE_PRICES:
        parent = DERIVED_BASE_PRICES[code]
        inherited = base_price_source(parent)
        return {**inherited, "source": f"{COUNTRIES[parent].name} average: {inherited['source']}", "derived_from": parent}
    if code in REGIONAL_RATIOS and code not in BASE_PRICES:
        return {
            "source": "Regional model: national 2025 price level relative to the "
            f"{'/'.join(REGIONAL_REFERENCE_COUNTRIES)} bulletin average, moved daily with it",
            "ratios_as_of": REGIONAL_RATIOS_AS_OF,
            "as_of": BASE_PRICES_AS_OF,
        }
    if code == "CH":
        return {
            "source": f"{SWISS_ANCHOR['source']} anchor, adjusted daily by the "
            f"{'/'.join(SWISS_REFERENCE_COUNTRIES)} bulletin average and the ECB CHF rate",
            "anchor_as_of": str(SWISS_ANCHOR["as_of"]),
            "as_of": BASE_PRICES_AS_OF,
        }
    return {"source": "EU Weekly Oil Bulletin", "as_of": BASE_PRICES_AS_OF}


def location_multiplier(country_code: str, location: Location) -> float:
    overrides = COUNTRY_LOCATION_OVERRIDES.get(country_code.upper(), {})
    return overrides.get(location, LOCATION_MULTIPLIERS[location])


@dataclass(frozen=True)
class Estimate:
    country: str
    fuel: Fuel
    brand_tier: BrandTier
    location: Location
    base_price: float
    brand_multiplier: float
    location_multiplier: float
    price: float
    price_low: float
    price_high: float

    def as_dict(self) -> dict:
        return {
            "country": self.country,
            "fuel": self.fuel.value,
            "brand_tier": self.brand_tier.value,
            "location": self.location.value,
            "base_price": self.base_price,
            "brand_multiplier": self.brand_multiplier,
            "location_multiplier": self.location_multiplier,
            "price": self.price,
            "price_low": self.price_low,
            "price_high": self.price_high,
        }


def estimate_price(
    country_code: str,
    fuel: Fuel,
    brand_tier: BrandTier = BrandTier.MAINSTREAM,
    location: Location = Location.CITY,
) -> Estimate:
    code = country_code.upper()
    p_base = base_price(code, fuel)
    m_brand = BRAND_MULTIPLIERS[brand_tier]
    m_loc = location_multiplier(code, location)
    price = p_base * m_brand * m_loc
    return Estimate(
        country=code,
        fuel=fuel,
        brand_tier=brand_tier,
        location=location,
        base_price=p_base,
        brand_multiplier=m_brand,
        location_multiplier=m_loc,
        price=round(price, 3),
        price_low=round(price * (1 - ESTIMATE_UNCERTAINTY), 3),
        price_high=round(price * (1 + ESTIMATE_UNCERTAINTY), 3),
    )


def estimate_matrix(country_code: str, fuel: Fuel) -> list[Estimate]:
    """Full brand x location matrix (3 x 3 = 9 estimates) for a country."""
    return [
        estimate_price(country_code, fuel, tier, loc)
        for loc in Location
        for tier in BrandTier
    ]
