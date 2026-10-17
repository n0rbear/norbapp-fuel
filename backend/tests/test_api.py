import json

import httpx
import pytest
from fastapi.testclient import TestClient

import api_clients
from api_clients import OFFICIAL_CLIENTS
from main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def use_transport(handler):
    app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    api_clients.cache.clear()


def test_health(client):
    assert client.get("/health").json()["status"] == "ok"


def test_countries(client):
    data = client.get("/api/countries").json()["countries"]
    assert sum(c["eu"] for c in data) == 27
    assert len(data) == 30  # + CH, LI, MC
    assert sum(c["mode"] == "official" for c in data) == 7


def test_unknown_country(client):
    assert client.get("/api/prices", params={"country": "NO"}).status_code == 404


def test_estimate_country_full_matrix(client):
    data = client.get("/api/prices", params={"country": "hu", "fuel": "diesel"}).json()
    assert data["mode"] == "estimate"
    assert len(data["estimates"]) == 9


def test_estimate_country_with_filters(client):
    r = client.get("/api/prices", params={"country": "HU", "location": "highway", "brand": "Shell"})
    estimates = r.json()["estimates"]
    assert len(estimates) == 1
    assert estimates[0]["brand_tier"] == "premium" and estimates[0]["location"] == "highway"


def test_official_country_without_coordinates_falls_back(client):
    data = client.get("/api/prices", params={"country": "AT", "location": "city"}).json()
    assert data["mode"] == "estimate"
    assert "lat/lng" in data["fallback_reason"]


def test_germany_without_key_falls_back(client, monkeypatch):
    monkeypatch.delenv("TANKERKOENIG_API_KEY", raising=False)
    data = client.get("/api/prices", params={"country": "DE", "lat": 52.5, "lng": 13.4}).json()
    assert data["mode"] == "estimate"
    assert "not configured" in data["fallback_reason"]


def test_lat_without_lng_rejected(client):
    assert client.get("/api/prices", params={"country": "AT", "lat": 48.2}).status_code == 422


def test_austria_live(client):
    def handler(request):
        assert request.url.params["fuelType"] == "DIE"
        return httpx.Response(200, json=[
            {"id": 1, "name": "BP Wien", "distance": 1.2,
             "location": {"address": "Gasse 1", "city": "Wien", "latitude": 48.2, "longitude": 16.37},
             "prices": [{"fuelType": "DIE", "amount": 1.899}]},
            {"id": 2, "name": "Turmöl", "distance": 0.5,
             "location": {"address": "Gasse 2", "city": "Wien", "latitude": 48.21, "longitude": 16.37},
             "prices": []},
        ])

    use_transport(handler)
    data = client.get("/api/prices", params={"country": "AT", "fuel": "diesel", "lat": 48.2, "lng": 16.37}).json()
    assert data["mode"] == "official"
    assert [s["name"] for s in data["stations"]] == ["BP Wien"]
    assert data["stations"][0]["brand_tier"] == "premium"
    assert data["summary"]["min"] == 1.899


def test_spain_parses_decimal_commas(client):
    payload = {"Fecha": "16/10/2026 15:59:41", "ListaEESSPrecio": [
        {"IDEESS": "1", "Rótulo": "REPSOL", "Dirección": "C/ Mayor 1", "Municipio": "Madrid",
         "Latitud": "40,4168", "Longitud (WGS84)": "-3,7038", "Precio Gasolina 95 E5": "1,659",
         "Precio Gasoleo A": ""},
        {"IDEESS": "2", "Rótulo": "BALLENOIL", "Dirección": "x", "Municipio": "Sevilla",
         "Latitud": "37,38", "Longitud (WGS84)": "-5,98", "Precio Gasolina 95 E5": "1,500"},
    ]}
    use_transport(lambda r: httpx.Response(200, content=json.dumps(payload).encode()))
    data = client.get("/api/prices", params={"country": "ES", "lat": 40.42, "lng": -3.70}).json()
    assert data["mode"] == "official"
    assert len(data["stations"]) == 1
    assert data["stations"][0]["price"] == 1.659
    assert data["stations"][0]["lng"] == pytest.approx(-3.7038)


def test_italy_csv(client):
    registry = (
        "Estrazione del 2026-10-15\n"
        "idImpianto|Gestore|Bandiera|Tipo Impianto|Nome Impianto|Indirizzo|Comune|Provincia|Latitudine|Longitudine\n"
        "1|X|Agip Eni|Autostradale|Area di servizio Nord|A1 km 10|Milano|MI|45.46|9.19\n"
        "2|Y|Pompe Bianche|Stradale|Distributore|Via Roma 1|Milano|MI|45.47|9.20\n"
    )
    prices = (
        "Estrazione del 2026-10-15\n"
        "idImpianto|descCarburante|prezzo|isSelf|dtComu\n"
        "1|Benzina|2.199|0|15/10/2026 08:00:00\n"
        "1|Benzina|1.999|1|15/10/2026 08:00:00\n"
        "2|Gasolio|1.899|1|15/10/2026 08:00:00\n"
    )
    use_transport(lambda r: httpx.Response(200, text=registry if "anagrafica" in str(r.url) else prices))
    data = client.get("/api/prices", params={"country": "IT", "lat": 45.46, "lng": 9.19}).json()
    assert [(s["id"], s["price"], s["location"]) for s in data["stations"]] == [("1", 1.999, "highway")]


def test_official_api_error_falls_back(client):
    use_transport(lambda r: httpx.Response(503))
    data = client.get("/api/prices", params={"country": "SI", "lat": 46.05, "lng": 14.5}).json()
    assert data["mode"] == "estimate"
    assert "official API unavailable" in data["fallback_reason"]


def test_seven_clients_registered():
    assert set(OFFICIAL_CLIENTS) == {"DE", "AT", "ES", "FR", "IT", "PT", "SI"}


def test_base_prices_endpoint(client):
    data = client.get("/api/base-prices").json()
    assert data["schedule"] == "daily 06:00 Europe/Budapest"
    assert len(data["prices"]) == 30


# --- E10 ---------------------------------------------------------------------


def test_germany_e10_uses_e10_price(client, monkeypatch):
    monkeypatch.setenv("TANKERKOENIG_API_KEY", "test-key")
    payload = {"ok": True, "stations": [
        {"id": "a", "name": "Aral", "brand": "ARAL", "street": "X", "place": "Berlin",
         "lat": 52.5, "lng": 13.4, "dist": 1.0, "e5": 1.899, "e10": 1.839, "diesel": 1.799},
        {"id": "b", "name": "Freie", "brand": None, "street": "Y", "place": "Berlin",
         "lat": 52.51, "lng": 13.4, "dist": 2.0, "e5": 1.859, "e10": None, "diesel": 1.759},
    ]}
    use_transport(lambda r: httpx.Response(200, json=payload))
    data = client.get("/api/prices", params={"country": "DE", "fuel": "e10", "lat": 52.5, "lng": 13.4}).json()
    assert data["mode"] == "official"
    assert data["price_fuel"] == "e10" and "fuel_note" not in data
    assert [(s["id"], s["price"], s["fuel"]) for s in data["stations"]] == [("a", 1.839, "e10")]


def test_spain_e10_column(client):
    payload = {"Fecha": "16/10/2026", "ListaEESSPrecio": [
        {"IDEESS": "1", "Rótulo": "REPSOL", "Dirección": "x", "Municipio": "Madrid",
         "Latitud": "40,4168", "Longitud (WGS84)": "-3,7038",
         "Precio Gasolina 95 E5": "1,659", "Precio Gasolina 95 E10": "1,609"},
        {"IDEESS": "2", "Rótulo": "CEPSA", "Dirección": "y", "Municipio": "Madrid",
         "Latitud": "40,4170", "Longitud (WGS84)": "-3,7040", "Precio Gasolina 95 E5": "1,649"},
    ]}
    use_transport(lambda r: httpx.Response(200, content=json.dumps(payload).encode()))
    data = client.get("/api/prices", params={"country": "ES", "fuel": "e10", "lat": 40.42, "lng": -3.70}).json()
    assert [(s["id"], s["price"]) for s in data["stations"]] == [("1", 1.609)]
    assert data["price_fuel"] == "e10"


def test_france_e10_does_not_fall_back_to_sp95(client):
    payload = {"results": [
        {"id": 1, "adresse": "1 rue A", "ville": "Paris", "geom": {"lat": 48.85, "lon": 2.35},
         "sp95_prix": 1.95, "e10_prix": 1.89},
        {"id": 2, "adresse": "2 rue B", "ville": "Paris", "geom": {"lat": 48.851, "lon": 2.351},
         "sp95_prix": 1.92},
    ]}
    use_transport(lambda r: httpx.Response(200, json=payload))
    data = client.get("/api/prices", params={"country": "FR", "fuel": "e10", "lat": 48.85, "lng": 2.35}).json()
    assert [(s["id"], s["price"]) for s in data["stations"]] == [("1", 1.89)]


def test_e10_falls_back_to_super95_where_not_published(client):
    def handler(request):
        assert request.url.params["fuelType"] == "SUP"
        return httpx.Response(200, json=[
            {"id": 1, "name": "BP Wien", "distance": 1.2,
             "location": {"address": "Gasse 1", "city": "Wien", "latitude": 48.2, "longitude": 16.37},
             "prices": [{"fuelType": "SUP", "amount": 1.799}]},
        ])

    use_transport(handler)
    data = client.get("/api/prices", params={"country": "AT", "fuel": "e10", "lat": 48.2, "lng": 16.37}).json()
    assert data["mode"] == "official" and data["fuel"] == "e10"
    assert data["price_fuel"] == "petrol" and "Euro-Super 95" in data["fuel_note"]
    assert data["stations"][0]["price"] == 1.799


def test_e10_estimate_uses_petrol_base(client):
    e10 = client.get("/api/prices", params={"country": "HU", "fuel": "e10", "location": "city", "brand_tier": "mainstream"}).json()
    petrol = client.get("/api/prices", params={"country": "HU", "fuel": "petrol", "location": "city", "brand_tier": "mainstream"}).json()
    assert e10["mode"] == "estimate" and e10["price_fuel"] == "petrol" and "fuel_note" in e10
    assert e10["estimates"][0]["price"] == petrol["estimates"][0]["price"]
    assert "fuel_note" not in petrol


def test_countries_report_e10_support(client):
    data = {c["code"]: c for c in client.get("/api/countries").json()["countries"]}
    assert {code for code, c in data.items() if c.get("official_api", {}).get("supports_e10")} == {"DE", "ES", "FR"}


# --- Switzerland, Liechtenstein, Monaco --------------------------------------


def test_non_eu_neighbours_listed(client):
    data = {c["code"]: c for c in client.get("/api/countries").json()["countries"]}
    assert len(data) == 30
    for code in ("CH", "LI", "MC"):
        assert data[code]["eu"] is False and data[code]["mode"] == "estimate"
    assert data["CH"]["local_currency"] == "CHF"
    assert data["MC"]["base_price_source"]["derived_from"] == "FR"
    assert data["HU"]["eu"] is True


def test_swiss_estimate_converts_chf_base(client):
    import pricing_matrix as pm
    from fx import fx

    data = client.get("/api/prices", params={"country": "CH", "fuel": "diesel", "location": "city", "brand_tier": "mainstream"}).json()
    # With the anchor-week bulletin and rate, the Swiss price is the TCS anchor.
    expected = round(2.313 / fx.rate("CHF"), 3)
    assert data["mode"] == "estimate"
    assert data["estimates"][0]["base_price"] == pytest.approx(expected, abs=0.002)
    assert "TCS" in data["base_price_source"]["source"]
    assert pm.base_price("LI", pm.Fuel.DIESEL) == pm.base_price("CH", pm.Fuel.DIESEL)


def test_monaco_follows_french_average(client):
    import pricing_matrix as pm

    assert pm.base_price("MC", pm.Fuel.PETROL) == pm.base_price("FR", pm.Fuel.PETROL)
    assert client.get("/api/prices", params={"country": "MC"}).json()["mode"] == "estimate"


def test_swiss_base_price_override(monkeypatch):
    import pricing_matrix as pm

    monkeypatch.setenv("BASE_PRICES_JSON", '{"CH": {"petrol": 2.5, "diesel": 2.6}}')
    saved = dict(pm.BASE_PRICES)
    try:
        pm.BASE_PRICES.clear()
        pm.BASE_PRICES.update(pm._build_base_prices())
        assert pm.base_price("CH", pm.Fuel.PETROL) == 2.5
        assert pm.base_price("LI", pm.Fuel.DIESEL) == 2.6
        assert "manual override" in pm.base_price_source("CH")["source"]
    finally:
        pm.BASE_PRICES.clear()
        pm.BASE_PRICES.update(saved)


def test_swiss_vignette_in_toll_estimate(client):
    from fx import fx

    data = client.get("/api/tolls/estimate", params={"countries": "DE,CH,LI", "days": 3, "currency": "EUR"}).json()
    by = {c["country"]: c for c in data["countries"]}
    assert by["CH"]["system"] == "vignette"
    assert by["CH"]["subtotal"] == pytest.approx(round(40 / fx.rate("CHF"), 3), abs=0.01)
    assert by["LI"]["subtotal"] == 0


def test_chf_is_not_a_display_currency(client):
    assert client.get("/api/prices", params={"country": "CH", "currency": "CHF"}).status_code == 422
    codes = [c["code"] for c in client.get("/api/currencies").json()["currencies"]]
    assert "CHF" not in codes
