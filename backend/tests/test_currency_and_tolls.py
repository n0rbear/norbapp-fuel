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
    data = client.get("/api/matrix", params={"country": "HU", "currency": "SEK"}).json()
    assert data["exchange_rate"]["currency"] == "SEK"
    assert data["estimates"][0]["base_price"] == pytest.approx(data["base_price"])
    bp = client.get("/api/base-prices", params={"currency": "CZK"}).json()
    assert bp["unit"] == "CZK/l"


def test_unknown_currency_rejected(client):
    assert client.get("/api/estimate", params={"country": "HU", "currency": "XYZ"}).status_code == 422


def test_currencies_are_eu_only(client):
    data = client.get("/api/currencies").json()["currencies"]
    assert [c["code"] for c in data] == ["EUR", "CZK", "DKK", "HUF", "PLN", "RON", "SEK"]
    assert "HU" in next(c for c in data if c["code"] == "HUF")["countries"]
    assert client.get("/api/estimate", params={"country": "HU", "currency": "USD"}).status_code == 422


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
    assert client.get("/api/tolls/no").status_code == 404


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


def test_romania_requires_euro_class(client):
    r = client.get("/api/tolls/estimate", params={"countries": "HU,RO", "days": 5})
    assert r.status_code == 422
    assert r.json()["detail"]["error"] == "euro_class_required"
    assert r.json()["detail"]["countries"] == ["RO"]
    # Countries without emission-based tolls need no class.
    assert client.get("/api/tolls/estimate", params={"countries": "HU,AT"}).status_code == 200


@pytest.mark.parametrize("euro_class,expected_lei", [("6", 30), ("euro5", 35), ("4", 35), ("2", 39), ("electric", 27)])
def test_romania_price_by_euro_class(client, euro_class, expected_lei):
    data = client.get("/api/tolls/estimate", params={
        "countries": "RO", "days": 7, "euro_class": euro_class, "currency": "RON",
    }).json()
    assert data["total"] == pytest.approx(expected_lei, abs=0.01)


def test_invalid_euro_class(client):
    assert client.get("/api/tolls/ro", params={"euro_class": "7"}).status_code == 422


def test_tolls_country_shows_all_emission_groups(client):
    data = client.get("/api/tolls/ro", params={"currency": "RON"}).json()
    assert data["requires_euro_class"] is True
    yearly = next(v for v in data["vignettes"] if v["id"] == "1y")
    assert yearly["price"] is None
    assert {g: p["price"] for g, p in yearly["price_by_emission_group"].items()} == {
        "electric": 228, "euro6": 254, "euro4_5": 292, "euro0_3": 330}
    with_class = client.get("/api/tolls/ro", params={"currency": "RON", "euro_class": "0"}).json()
    assert next(v for v in with_class["vignettes"] if v["id"] == "1y")["price"] == 330
