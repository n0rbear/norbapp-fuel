"""Currency conversion for every price the API returns.

All prices are computed in EUR and converted on output. Rates (1 EUR = x):
  1. European Central Bank daily reference rates (official, ~30 currencies),
  2. exchangerate-api.com open endpoint for the remaining ~130 currencies.
Both are refreshed together with the base prices every morning; until the
first refresh succeeds the built-in ECB snapshot below is used.
"""

from __future__ import annotations

import logging
import re

import httpx

logger = logging.getLogger(__name__)

ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"
EXTENDED_URL = "https://open.er-api.com/v6/latest/EUR"

# ECB reference rates of 2026-10-16, used until the first live refresh.
FALLBACK_AS_OF = "2026-10-16"
FALLBACK_RATES: dict[str, float] = {
    "EUR": 1.0, "USD": 1.1253, "JPY": 177.82, "CZK": 24.323, "DKK": 7.4748, "GBP": 0.84385,
    "HUF": 363.08, "PLN": 4.37, "RON": 5.331, "SEK": 11.145, "CHF": 0.9272, "ISK": 136.2,
    "NOK": 10.624, "TRY": 55.7328, "AUD": 1.6171, "BRL": 5.7197, "CAD": 1.5935, "CNY": 7.524,
    "HKD": 8.8316, "IDR": 20290.28, "ILS": 3.4822, "INR": 106.864, "KRW": 1499.01,
    "MXN": 20.6871, "MYR": 4.5929, "NZD": 1.9868, "PHP": 70.858, "SGD": 1.4395, "THB": 37.602,
    "ZAR": 18.493,
    # Currencies pegged to the euro (fixed rate).
    "BGN": 1.95583,
}

_ECB_RATE = re.compile(r"currency='([A-Z]{3})'\s+rate='([0-9.]+)'")
_ECB_TIME = re.compile(r"time='(\d{4}-\d{2}-\d{2})'")

# Prices are shown with fewer decimals in currencies with large unit values.
def decimals_for(rate: float) -> int:
    if rate < 5:
        return 3
    if rate < 1000:
        return 2
    return 0


class UnknownCurrencyError(ValueError):
    pass


class FxRates:
    def __init__(self) -> None:
        self.rates: dict[str, float] = dict(FALLBACK_RATES)
        self.ecb_codes: set[str] = set(FALLBACK_RATES)
        self.as_of = FALLBACK_AS_OF
        self.source = "ECB reference rates (built-in snapshot)"

    def rate(self, currency: str) -> float:
        code = currency.upper()
        if code not in self.rates:
            raise UnknownCurrencyError(f"Unsupported currency '{currency}'. See GET /api/currencies.")
        return self.rates[code]

    def convert(self, amount_eur: float | None, currency: str) -> float | None:
        if amount_eur is None:
            return None
        rate = self.rate(currency)
        return round(amount_eur * rate, decimals_for(rate))

    def to_eur(self, amount: float, currency: str) -> float:
        return amount / self.rate(currency)

    def describe(self, currency: str) -> dict:
        code = currency.upper()
        return {
            "base": "EUR",
            "currency": code,
            "rate": self.rate(code),
            "as_of": self.as_of,
            "source": "ECB" if code in self.ecb_codes else "exchangerate-api.com",
        }

    async def refresh(self, http: httpx.AsyncClient) -> None:
        """Load ECB rates (required) and extend them with the open API (best effort)."""
        response = await http.get(ECB_URL, timeout=30)
        response.raise_for_status()
        ecb = {code: float(rate) for code, rate in _ECB_RATE.findall(response.text)}
        if len(ecb) < 20:
            raise ValueError(f"ECB feed returned only {len(ecb)} rates")
        time_match = _ECB_TIME.search(response.text)
        rates = {**ecb, "EUR": 1.0, "BGN": 1.95583}

        extended = 0
        try:
            ext = await http.get(EXTENDED_URL, timeout=30)
            ext.raise_for_status()
            data = ext.json()
            if data.get("result") == "success":
                for code, rate in (data.get("rates") or {}).items():
                    if code not in rates and isinstance(rate, (int, float)) and rate > 0:
                        rates[code] = float(rate)
                        extended += 1
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("Extended FX rates unavailable: %s", exc)

        self.rates = rates
        self.ecb_codes = set(ecb) | {"EUR", "BGN"}
        self.as_of = time_match.group(1) if time_match else self.as_of
        self.source = "ECB reference rates" + (" + exchangerate-api.com" if extended else "")
        logger.info("FX rates refreshed: %d currencies (ECB %s)", len(rates), self.as_of)


fx = FxRates()
