"""Official regulated (maximum) retail prices outside the EU Weekly Oil Bulletin.

Only sources that publish the current price on a fixed, machine-readable page
are used, so they can be refreshed daily together with the bulletin:

- North Macedonia: the Energy Regulatory Commission (ERC/РКЕ) shows the
  maximum retail prices in force on its home page ("АКТУЕЛНИ ЦЕНИ").

Serbia, Montenegro and Kosovo also set maximum prices, but only announce them
in press releases, so they stay on the regional model (pricing_matrix).

A fetched price is used only while it is recent and close to the regional
model (pricing_matrix.REGULATED_MAX_AGE / REGULATED_MAX_DEVIATION); otherwise
the regional model takes over.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import date
from html import unescape

import httpx

from pricing_matrix import Fuel

logger = logging.getLogger(__name__)

ERC_URL = "https://www.erc.org.mk/"
# Row label on the ERC home page -> fuel. Euro-Super 95 and Euro-Diesel (BS = sulphur-free).
_ERC_LABELS = {
    Fuel.PETROL: re.compile(r"ЕУРОСУПЕР\s*БС\s*-\s*95"),
    Fuel.DIESEL: re.compile(r"ЕУРОДИЗЕЛ\s*БС"),
}
_PRICE = re.compile(r"(\d+(?:[.,]\d+)?)\s*ден\s*/\s*л")


@dataclass(frozen=True)
class RegulatedPrice:
    country: str
    currency: str
    prices: dict[Fuel, float]  # local currency per litre
    fetched: date
    authority: str
    url: str


def _cells(html: str) -> list[str]:
    text = re.sub(r"<(script|style)\b.*?</\1>", " ", html, flags=re.S | re.I)
    return [c for c in (unescape(t).strip() for t in re.split(r"<[^>]+>", text)) if c]


def parse_erc(html: str) -> dict[Fuel, float]:
    """Maximum prices (MKD/l) from the ERC home page table."""
    cells = _cells(html)
    prices: dict[Fuel, float] = {}
    for fuel, label in _ERC_LABELS.items():
        for i, cell in enumerate(cells[:-1]):
            if label.search(cell):
                match = _PRICE.search(cells[i + 1])
                if match:
                    prices[fuel] = float(match.group(1).replace(",", "."))
                    break
    if set(prices) != set(_ERC_LABELS):
        raise ValueError(f"ERC page: found {sorted(f.value for f in prices)}")
    return prices


async def fetch_erc(http: httpx.AsyncClient, today: date) -> RegulatedPrice:
    response = await http.get(ERC_URL, timeout=30, headers={"User-Agent": "Mozilla/5.0 (fuel.norbapp.com)"})
    response.raise_for_status()
    return RegulatedPrice("MK", "MKD", parse_erc(response.text), today, "ERC North Macedonia", ERC_URL)


FETCHERS = {"MK": fetch_erc}
