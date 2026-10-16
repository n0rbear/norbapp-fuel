import asyncio
import io
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
import pytest
from openpyxl import Workbook

import base_price_updater as bpu
import pricing_matrix as pm
from fx import fx
from pricing_matrix import Fuel

BUDAPEST = ZoneInfo("Europe/Budapest")

ECB_XML = "<Cube time='2026-10-19'>" + "".join(
    f"<Cube currency='{c}' rate='{r}'/>" for c, r in
    [("USD", 1.1), ("HUF", 400.0), ("CZK", 24.0), ("DKK", 7.46), ("PLN", 4.3), ("RON", 5.3), ("SEK", 11.0)]
) + "</Cube>"


def bulletin_xlsx(hu_petrol=1754.08) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.append(["in EUR", "Euro-super 95  (I)", "Gas oil automobile"])
    ws.append([datetime(2026, 10, 19), "1000 l", "1000 l"])
    for name in bpu.COUNTRY_NAMES:
        if name == "Czech Republic":
            continue
        ws.append([name, hu_petrol if name == "Hungary" else 1800.0, 1900.0])
    ws.append(["CE/EC/EG EUR27_2020 (IV)", 2009.7, 2135.8])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_parse_bulletin():
    prices, as_of = bpu.parse_bulletin(bulletin_xlsx())
    assert as_of == "2026-10-19"
    assert len(prices) == 27
    assert prices["HU"] == {Fuel.PETROL: 1.754, Fuel.DIESEL: 1.9}


def test_find_xlsx_url():
    html = (
        '<a href="/document/download/x_en?filename=Weekly%20prices%20without%20taxes.xlsx">'
        '<a href="/document/download/abc_en?filename=Weekly%20Oil%20Bulletin%20Weekly%20prices%20with%20Taxes%20-%202026-09-21.xlsx">'
    )
    assert bpu.find_xlsx_url(html).startswith("https://energy.ec.europa.eu/document/download/abc_en")


def test_schedule_is_6am_budapest():
    before = datetime(2026, 10, 16, 5, 59, tzinfo=BUDAPEST)
    after = datetime(2026, 10, 16, 6, 0, tzinfo=BUDAPEST)
    assert bpu.last_scheduled_run(before) == datetime(2026, 10, 15, 6, 0, tzinfo=BUDAPEST)
    assert bpu.last_scheduled_run(after) == after
    assert bpu.next_scheduled_run(after) == datetime(2026, 10, 17, 6, 0, tzinfo=BUDAPEST)


def test_staleness():
    u = bpu.BasePriceUpdater()
    now = datetime(2026, 10, 16, 7, 0, tzinfo=BUDAPEST)
    assert u.is_stale(now)
    u.last_success = u.last_attempt = datetime(2026, 10, 16, 6, 0, 5, tzinfo=BUDAPEST)
    assert not u.is_stale(now)
    u.last_success = u.last_attempt = now - timedelta(days=1)
    assert u.is_stale(now)
    u.last_attempt = now - timedelta(minutes=5)  # recent failure -> back off
    assert not u.is_stale(now)


def test_refresh_applies_prices_and_keeps_overrides(monkeypatch):
    original = {c: dict(v) for c, v in pm.BASE_PRICES.items()}, pm.BASE_PRICES_AS_OF
    monkeypatch.setenv("BASE_PRICES_JSON", '{"MT": {"petrol": 1.111}}')

    def handler(request):
        if "ecb.europa.eu" in str(request.url):
            return httpx.Response(200, text=ECB_XML)
        if "weekly-oil-bulletin" in str(request.url):
            return httpx.Response(200, text='<a href="/document/download/abc_en?filename=Weekly%20prices%20with%20Taxes.xlsx">')
        return httpx.Response(200, content=bulletin_xlsx(hu_petrol=1700.0))

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            return await bpu.BasePriceUpdater().refresh(http)

    try:
        assert asyncio.run(run())
        assert fx.rate("HUF") == 400.0 and fx.as_of == "2026-10-19"
        assert "USD" not in fx.rates  # EU currencies only
        assert pm.base_price("HU", Fuel.PETROL) == 1.7
        assert pm.base_price("MT", Fuel.PETROL) == 1.111
        assert pm.BASE_PRICES_AS_OF == "2026-10-19"
    finally:
        pm.BASE_PRICES.clear()
        pm.BASE_PRICES.update(original[0])
        pm.BASE_PRICES_AS_OF = original[1]
        fx.__init__()


def test_refresh_failure_keeps_old_prices():
    before = pm.base_price("HU", Fuel.DIESEL)

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(503))) as http:
            u = bpu.BasePriceUpdater()
            return await u.refresh(http), u

    ok, u = asyncio.run(run())
    assert not ok and u.last_error
    assert pm.base_price("HU", Fuel.DIESEL) == before
