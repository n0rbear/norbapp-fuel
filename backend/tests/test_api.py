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
    assert len(data) == 27
    assert sum(c["mode"] == "official" for c in data) == 7


def test_unknown_country(client):
    assert client.get("/api/prices", params={"country": "CH"}).status_code == 404


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
    assert len(data["prices"]) == 27
