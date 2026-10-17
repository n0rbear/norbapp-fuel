"""Currency conversion for every price the API returns.

All prices are computed in EUR and converted on output. Only the currencies
in use in the EU are offered: the euro and the national currencies of the
seven non-euro member states. Rates (1 EUR = x) are the European Central
Bank daily reference rates, refreshed together with the base prices every
morning; until the first refresh succeeds the built-in snapshot is used.
"""

from __future__ import annotations

import logging
import re

import httpx

logger = logging.getLogger(__name__)

ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"

EU_CURRENCIES: dict[str, str] = {
    "EUR": "euró",
    "CZK": "cseh korona",
    "DKK": "dán korona",
    "HUF": "magyar forint",
    "PLN": "lengyel złoty",
    "RON": "román lej",
    "SEK": "svéd korona",
}

# Not offered for display, but needed to convert prices of the non-EU
# countries covered (Swiss/Liechtenstein base prices and the Swiss vignette).
CONVERSION_CURRENCIES: dict[str, str] = {"CHF": "svájci frank"}

# ECB reference rates of 2026-10-16, used until the first live refresh.
FALLBACK_AS_OF = "2026-10-16"
FALLBACK_RATES: dict[str, float] = {
    "EUR": 1.0, "CZK": 24.323, "DKK": 7.4748, "HUF": 363.08, "PLN": 4.37, "RON": 5.331, "SEK": 11.145,
    "CHF": 0.9272,
}

_ECB_RATE = re.compile(r"currency='([A-Z]{3})'\s+rate='([0-9.]+)'")
_ECB_TIME = re.compile(r"time='(\d{4}-\d{2}-\d{2})'")


def decimals_for(rate: float) -> int:
    """Fewer decimals for currencies with a small unit value (e.g. HUF)."""
    return 3 if rate < 5 else 2


class UnknownCurrencyError(ValueError):
    pass


class FxRates:
    def __init__(self) -> None:
        self.rates: dict[str, float] = dict(FALLBACK_RATES)
        self.as_of = FALLBACK_AS_OF
        self.source = "ECB reference rates (built-in snapshot)"

    def rate(self, currency: str) -> float:
        code = currency.upper()
        if code not in self.rates:
            raise UnknownCurrencyError(
                f"Unsupported currency '{currency}'. Supported: {', '.join(EU_CURRENCIES)}."
            )
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
        return {"base": "EUR", "currency": code, "rate": self.rate(code), "as_of": self.as_of, "source": "ECB"}

    async def refresh(self, http: httpx.AsyncClient) -> None:
        response = await http.get(ECB_URL, timeout=30)
        response.raise_for_status()
        ecb = {code: float(rate) for code, rate in _ECB_RATE.findall(response.text)}
        wanted = [c for c in [*EU_CURRENCIES, *CONVERSION_CURRENCIES] if c != "EUR"]
        missing = [c for c in wanted if c not in ecb]
        if missing:
            raise ValueError(f"ECB feed is missing {', '.join(missing)}")
        time_match = _ECB_TIME.search(response.text)
        self.rates = {"EUR": 1.0, **{c: ecb[c] for c in wanted}}
        self.as_of = time_match.group(1) if time_match else self.as_of
        self.source = "ECB reference rates"
        logger.info("FX rates refreshed (ECB %s)", self.as_of)


fx = FxRates()
