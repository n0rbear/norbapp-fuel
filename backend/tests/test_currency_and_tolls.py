import pytest
from fastapi.testclient import TestClient

import tolls as tl
from fx import fx
from main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_all_eu_countries_have_tolls():
    import pricing_matrix as pm
    assert set(tl.TOLLS) == set(pm.COUNTRIES)
    for t in tl.TOLLS.values():
        fx.rate(t.currency)
        assert t.system in {"vignette", "distance", "free"}
        assert (t.system == "vignette") == bool(t.vignettes)


def test_estimate_converted_to_huf(client):
    eur = client.get("/api/estimate", params={"country": "PL"}).json()
    huf = client.get("/api/estimate", params={"country": "PL", "currency": "huf"}).json()
    assert huf["currency"] == "HUF" and huf["unit"] == "HUF/l"
    assert huf["price"] == pytest.approx(eur["price"] * fx.rate("HUF"), abs=0.01)
    assert huf["brand_multiplier"] == eur["brand_multiplier"]


def test_matrix_and_base_prices_currency(client):
    data = client.get("/api/matrix", params={"country": "HU", "currency": "USD"}).json()
    assert data["exchange_rate"]["currency"] == "USD"
    assert data["estimates"][0]["base_price"] == pytest.approx(data["base_price"])
    bp = client.get("/api/base-prices", params={"currency": "CZK"}).json()
    assert bp["unit"] == "CZK/l"


def test_unknown_currency_rejected(client):
    assert client.get("/api/estimate", params={"country": "HU", "currency": "XYZ"}).status_code == 422


def test_currencies_list(client):
    codes = {c["code"] for c in client.get("/api/currencies").json()["currencies"]}
    assert {"EUR", "HUF", "USD", "CZK", "PLN", "RON"} <= codes


def test_cheapest_vignettes():
    at = tl.TOLLS["AT"].vignettes
    assert [v.id for v in tl.cheapest_vignettes(at, 1)[1]] == ["1d"]
    assert [v.id for v in tl.cheapest_vignettes(at, 3)[1]] == ["10d"]
    cost, combo = tl.cheapest_vignettes(at, 15)
    assert cost == pytest.approx(25.60) and [v.id for v in combo] == ["10d", "10d"]
    hu = tl.TOLLS["HU"].vignettes
    assert all(v.for_trips for v in tl.cheapest_vignettes(hu, 365)[1])


def test_tolls_country_endpoint(client):
    data = client.get("/api/tolls/hu", params={"currency": "HUF"}).json()
    assert data["system"] == "vignette"
    daily = next(v for v in data["vignettes"] if v["id"] == "1d")
    assert daily["price"] == pytest.approx(5550, abs=1)
    assert client.get("/api/tolls/ch").status_code == 404


def test_toll_trip_estimate(client):
    data = client.get("/api/tolls/estimate", params={
        "countries": "DE,AT,HU,FR", "days": 2, "highway_km": "FR:100",
        "special": "a13-brenner", "currency": "EUR",
    }).json()
    by = {c["country"]: c for c in data["countries"]}
    assert by["DE"]["subtotal"] == 0
    assert by["AT"]["subtotal"] == pytest.approx(12.80 + 12.50)  # 10-day beats 2x 1-day
    assert by["HU"]["subtotal"] == pytest.approx(6900 / fx.rate("HUF"), abs=0.01)
    assert by["FR"]["subtotal"] == pytest.approx(10.0)
    assert data["total"] == pytest.approx(sum(c["subtotal"] for c in data["countries"]), abs=0.02)


def test_toll_estimate_bad_km(client):
    assert client.get("/api/tolls/estimate", params={"countries": "FR", "highway_km": "FR:abc"}).status_code == 422
