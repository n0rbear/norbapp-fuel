import asyncio
from datetime import date, timedelta

import httpx
import pytest

import base_price_updater as bpu
import pricing_matrix as pm
import regulated_prices as rp
from pricing_matrix import Fuel

# Shape of the "АКТУЕЛНИ ЦЕНИ" table on www.erc.org.mk.
ERC_HTML = (
    "<div>АКТУЕЛНИ ЦЕНИ</div><table>"
    "<tr><td style='width:60%'> ЕУРОСУПЕР БС - 95</td><td style='width:40%'>91 ден/л</td></tr>"
    "<tr><td> ЕУРОДИЗЕЛ БС (Д-Е V)</td><td>99 ден/л</td></tr>"
    "<tr><td> ЕУРОСУПЕР БС - 98</td><td>93 ден/л</td></tr>"
    "<tr><td> ЕКСТРА ЛЕСНО 1(ЕЛ-1)</td><td>110 ден/л</td></tr>"
    "</table>"
)


@pytest.fixture(autouse=True)
def clean_regulated():
    pm.REGULATED_PRICES.clear()
    yield
    pm.REGULATED_PRICES.clear()


def entry(petrol=91.0, diesel=99.0, fetched=None):
    return rp.RegulatedPrice(
        "MK", "MKD", {Fuel.PETROL: petrol, Fuel.DIESEL: diesel}, fetched or date.today(), "ERC North Macedonia", rp.ERC_URL
    )


def test_parse_erc():
    assert rp.parse_erc(ERC_HTML) == {Fuel.PETROL: 91.0, Fuel.DIESEL: 99.0}


def test_parse_erc_rejects_changed_page():
    with pytest.raises(ValueError):
        rp.parse_erc("<p>ЕУРОСУПЕР БС - 95</p><p>n/a</p>")


def test_regulated_price_replaces_regional_model():
    regional = pm.base_price("MK", Fuel.DIESEL)
    assert pm.apply_regulated_price(entry())
    assert pm.base_price("MK", Fuel.DIESEL) == round(99 / 61.5, 3) != regional
    assert pm.base_price("MK", Fuel.E10) == round(91 / 61.5, 3)  # E10 -> Super 95
    source = pm.base_price_source("MK")
    assert source["regulated_by"] == "ERC North Macedonia"
    assert source["source"].startswith("Official maximum retail price")


def test_stale_regulated_price_falls_back_to_model():
    regional = pm.base_price("MK", Fuel.PETROL)
    pm.apply_regulated_price(entry(fetched=date.today() - timedelta(days=15)))
    assert pm.base_price("MK", Fuel.PETROL) == regional
    assert pm.base_price_source("MK")["source"].startswith("Regional model")


def test_implausible_regulated_price_is_ignored():
    assert not pm.apply_regulated_price(entry(petrol=9.1))
    assert "MK" not in pm.REGULATED_PRICES


def test_updater_fetches_erc():
    def handler(request):
        if "erc.org.mk" in str(request.url):
            return httpx.Response(200, text=ERC_HTML)
        return httpx.Response(503)

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            u = bpu.BasePriceUpdater()
            await u.refresh(http)
            return u

    u = asyncio.run(run())
    assert pm.base_price("MK", Fuel.PETROL) == round(91 / 61.5, 3)
    assert u.status()["regulated"]["MK"]["prices"] == {"petrol": 91.0, "diesel": 99.0}
    assert not u.regulated_errors


def test_updater_records_erc_failure():
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(503))) as http:
            u = bpu.BasePriceUpdater()
            await u.refresh(http)
            return u

    assert "MK" in asyncio.run(run()).regulated_errors
