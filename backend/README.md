# NorbApp Fuel – üzemanyagár-backend (FastAPI)

REST backend a NorbApp Fuel üzemanyagár-követő moduljához. Mind a 27 EU-tagállamra ad árat:

| Mód | Országok | Adatforrás |
|---|---|---|
| `official` – élő, kútszintű árak | DE, AT, ES, FR, IT, PT, SI | Hivatalos, ingyenes nyílt API-k |
| `estimate` – heurisztikus becslés | a többi 20 EU-ország | Országos átlagár × márka × lokáció mátrix |

A 7 hivatalos országra is visszaesik a becslésre, ha nincs koordináta, nincs API-kulcs, vagy a forrás épp nem elérhető (ilyenkor a válaszban `fallback_reason` jelzi az okot).

## Hivatalos API-kliensek (`api_clients.py`)

| Ország | Forrás | Kulcs | Megjegyzés |
|---|---|---|---|
| DE | [Tankerkönig](https://creativecommons.tankerkoenig.de/) (MTS-K) | **kell** (ingyenes) | `TANKERKOENIG_API_KEY` |
| AT | [E-Control Spritpreisrechner](https://api.e-control.at/sprit/1.0/doc/) | – | csak a legközelebbi ~10 kutat adja |
| ES | [Geoportal Gasolineras REST](https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/) | – | teljes országos lista, 30 perc cache |
| FR | [prix-carburants](https://data.economie.gouv.fr/explore/dataset/prix-des-carburants-en-france-flux-instantane-v2/) | – | a nyílt adat márkanevet nem tartalmaz |
| IT | [MIMIT Osservaprezzi](https://www.mimit.gov.it/it/open-data/elenco-dataset/carburanti-prezzi-praticati-e-anagrafica-degli-impianti) CSV | – | napi CSV, 1 óra cache, önkiszolgáló ár előnyben |
| PT | [DGEG Preços dos Combustíveis](https://precoscombustiveis.dgeg.gov.pt/) | – | teljes lista üzemanyagonként, 30 perc cache |
| SI | [goriva.si](https://goriva.si/) | – | sugaras keresés |

Minden kliens egységes `Station` objektumot ad vissza (EUR/liter), automatikus márka-besorolással (`brand_tier`) és – ahol a név/cím/típus alapján felismerhető – autópálya-jelöléssel (`location`).

## Becslési mátrix (`pricing_matrix.py`)

```
P_becsült = P_base(ország, üzemanyag) × M_márka × M_lokáció
```

- **P_base**: országos átlagár adóval, az Európai Bizottság [Weekly Oil Bulletin](https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en) 2026-10-12-i adataiból.
- **M_márka**: `discount` 0,96 · `mainstream` 1,00 · `premium` 1,035
- **M_lokáció**: `highway` 1,08 · `city` 1,00 · `suburb` 0,98 (országonként felülírható, pl. DE autópálya 1,12, HU 1,05, MT hatósági ár miatt 1,00)
- Minden becslés ±3,5%-os sávot is ad (`price_low`, `price_high`).
- A márkanév → kategória besorolás kulcsszó alapú (pl. Shell/OMV/BP → premium, MOL/Orlen → mainstream, Orlen easy/JET/Intermarché → discount; ismeretlen → mainstream).

### Alapárak frissítése kódmódosítás nélkül

```bash
BASE_PRICES_JSON='{"HU": {"petrol": 1.76, "diesel": 1.95}}'
# vagy
BASE_PRICES_FILE=/etc/secrets/base_prices.json
```

A kódban lévő értékeket érdemes hetente a Weekly Oil Bulletinből frissíteni (`DEFAULT_BASE_PRICES`, `BASE_PRICES_AS_OF`).

## REST végpontok

Interaktív dokumentáció: `/docs` (Swagger UI) és `/redoc`.

| Végpont | Leírás |
|---|---|
| `GET /health` | Health check (Render) |
| `GET /api/countries` | 27 ország, mód (`official`/`estimate`), API-állapot |
| `GET /api/prices` | **Fő végpont a frontendnek** |
| `GET /api/estimate` | Egyetlen becslés bármely országra |
| `GET /api/matrix` | Teljes 3×3 márka × lokáció mátrix + szorzók |
| `GET /api/brands/classify?name=...` | Márkanév → kategória |

### `GET /api/prices` paraméterek

| Paraméter | Kötelező | Érték |
|---|---|---|
| `country` | igen | ISO kód, pl. `HU`, `AT` (kis-nagybetű mindegy) |
| `fuel` | nem | `petrol` (alapért.) vagy `diesel` |
| `location` | nem | `highway`, `city`, `suburb` |
| `brand_tier` | nem | `discount`, `mainstream`, `premium` |
| `brand` | nem | márkanév, automatikusan kategóriára képezve |
| `lat`, `lng` | nem* | koordináta – a hivatalos országoknál ez kell az élő árakhoz |
| `radius_km` | nem | keresési sugár, 1–25 km (alapért. 10) |

Hivatalos országban koordinátával a `brand_tier`/`location` szűrőként működik a kutakra (a felismeretlen lokációjú kút `city`-nek számít). Becslési módban szűrő nélkül a teljes 9 elemű mátrix jön vissza.

### Példák

```bash
# Magyarország, autópálya, prémium márka (becslés)
curl "http://localhost:8000/api/prices?country=HU&location=highway&brand=Shell"

# Bécs környéki élő gázolajárak
curl "http://localhost:8000/api/prices?country=AT&fuel=diesel&lat=48.2&lng=16.37"
```

Válasz becslési módban (rövidítve):

```json
{
  "country": "HU", "fuel": "petrol", "currency": "EUR", "unit": "EUR/l",
  "mode": "estimate", "source": "heuristic pricing matrix",
  "base_price": 1.754, "base_prices_as_of": "2026-10-12",
  "estimates": [{
    "brand_tier": "premium", "location": "highway",
    "base_price": 1.754, "brand_multiplier": 1.035, "location_multiplier": 1.05,
    "price": 1.906, "price_low": 1.839, "price_high": 1.973
  }]
}
```

Válasz hivatalos módban (rövidítve):

```json
{
  "country": "AT", "fuel": "diesel", "mode": "official",
  "source": "E-Control Spritpreisrechner", "radius_km": 10.0,
  "summary": {"min": 2.069, "max": 2.169, "avg": 2.119, "median": 2.119, "count": 5},
  "stations": [{
    "id": "1494440", "name": "Turmöl", "brand": null, "brand_tier": "mainstream",
    "location": null, "address": "...", "city": "Wien", "lat": 48.2, "lng": 16.37,
    "distance_km": 0.57, "price": 2.069, "fuel": "diesel", "updated_at": null
  }]
}
```

Minden ár **EUR/liter**; a nem euróövezeti országoknál (HU, CZ, PL, RO, SE, DK) a `GET /api/countries` a `local_currency` mezőben jelzi a helyi pénznemet, az átváltás a frontend feladata.

## Helyi futtatás

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # opcionális, TANKERKOENIG_API_KEY ide
uvicorn main:app --reload
```

Majd: <http://localhost:8000/docs>

Tesztek (hálózat nélkül, mockolt API-kkal):

```bash
pip install -r requirements-dev.txt
pytest
```

## Telepítés Renderre

**Blueprinttel (ajánlott):** a repó gyökerében lévő `render.yaml` mindent beállít.

1. Render Dashboard → **New → Blueprint** → válaszd ki a `norbapp-fuel` repót.
2. Add meg a `TANKERKOENIG_API_KEY` értékét (ha üres, Németország becslésre esik vissza).
3. **Apply** – a szolgáltatás a `https://norbapp-fuel-api.onrender.com` jellegű címen indul.

**Kézzel (Web Service):**

| Beállítás | Érték |
|---|---|
| Root Directory | `backend` |
| Runtime | Python 3 |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Health Check Path | `/health` |

### Környezeti változók

| Változó | Alapérték | Leírás |
|---|---|---|
| `TANKERKOENIG_API_KEY` | – | Német élő árakhoz ([ingyenes regisztráció](https://onboarding.tankerkoenig.de/)) |
| `CORS_ORIGINS` | `*` | Engedélyezett web originek vesszővel elválasztva |
| `BASE_PRICES_JSON` / `BASE_PRICES_FILE` | – | Alapár-felülírás |
| `LOG_LEVEL` | `INFO` | Naplózási szint |

## Megjegyzések, korlátok

- A Render free példány inaktivitás után elalszik; az első kérés ~30–60 s lehet, és a memóriacache ilyenkor kiürül (ES/IT/PT első lekérése lassabb).
- A forrásoldali API-k formátuma előzetes bejelentés nélkül változhat; hiba esetén a backend automatikusan becslésre vált.
- A Tankerkönig-adatok CC BY 4.0 licencűek – a frontendnek fel kell tüntetnie a forrást („Daten: MTS-K / Tankerkönig”). A többi forrás felhasználási feltételeit is érdemes nyilvános kiadás előtt átnézni.
- A heurisztikus becslés tájékoztató jellegű, nem valós kútár.
