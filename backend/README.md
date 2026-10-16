# NorbApp Fuel – üzemanyagár-backend (FastAPI)

REST backend a NorbApp Fuel üzemanyagár-követő moduljához. Mind a 27 EU-tagállamra ad üzemanyagárat és autópályadíjat, a felhasználó által választott pénznemben:

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

A kézi felülírás mindig erősebb az automatikusan letöltött értéknél.

### Automatikus napi frissítés (`base_price_updater.py`)

Az alapárak **minden reggel 6:00-kor (Europe/Budapest)** frissülnek az EU Weekly Oil Bulletin legfrissebb „prices with taxes” táblázatából, valamint induláskor is.

- A Bulletin hetente jelenik meg; a napi futás a megjelenés utáni reggelen veszi át az új kiadást.
- Ha a szolgáltatás 6-kor alszik, az ébredés utáni első kérés háttérben pótolja a frissítést (hiba esetén 30 percenként próbálja újra).
- Ha a letöltés nem sikerül, az utolsó jó értékek maradnak érvényben (induláskor a kódba épített `DEFAULT_BASE_PRICES`).
- Állapot és aktuális értékek: `GET /api/base-prices`.

## Pénznem választása (`fx.py`)

Minden árat visszaadó végpont fogad egy `currency` paramétert (alapért. `EUR`), pl. `currency=HUF`. Csak az EU-ban használt pénznemek választhatók: **EUR, CZK, DKK, HUF, PLN, RON, SEK** (Bulgária 2026 óta euróövezeti). Más kódra 422-es hiba jön. A számítás EUR-ban történik, a kimenet konvertált; a válasz `exchange_rate` mezője megadja az árfolyamot és a dátumát.

- **Forrás:** az Európai Központi Bank napi referencia-árfolyamai.
- **Frissítés:** az alapárakkal együtt minden reggel 6:00-kor; amíg az első letöltés nem sikerül, a kódba épített EKB-pillanatkép (2026-10-16) él.
- `GET /api/currencies`: a 7 választható pénznem magyar névvel, árfolyammal és azokkal az országokkal, ahol helyi pénznem – ebből építhető a frontend pénznemválasztója.
- Kerekítés: 3 tizedes (EUR), 2 tizedes (a többi).

## Autópályadíjak (`tolls.py`)

Személyautóra (≤ 3,5 t, 1. kategória), mind a 27 EU-országra, 2026-os árakkal:

| Rendszer | Országok | Adat |
|---|---|---|
| `vignette` | AT, BG, CZ, HU, RO, SI, SK | Minden e-matrica időtartam és ár |
| `distance` | FR, IT, ES, PT, HR, GR, PL, IE | Átlagos km-díj becsléshez + fontos szakaszok |
| `free` | BE, CY, DE, DK, EE, FI, LT, LU, LV, MT, NL, SE | Nincs általános díj; a fizetős hidak/alagutak külön |

Külön díjak (alagutak, hidak, hágók) minden országnál `special_tolls` alatt: pl. Brenner, Tauern, Karawanken, Mont-Blanc, Fréjus, Storebælt, Øresund, Rio–Antirrio.

Az árakat az eladási pénznemben tárolja (`price_local`), a válaszban a kért pénznemre váltja. Az adatok forrása az üzemeltetők oldalai, ellenőrizve a [fuel-prices.eu](https://www.fuel-prices.eu/tolls/) 2026. szeptemberi listájával. **Évente frissíteni kell** (a matricák általában január 1-jén, Franciaország február 1-jén drágul) – `tolls.py`, `TOLLS_AS_OF`.

### Euro-besorolás (`euro_class`)

Ahol az útdíj a jármű kibocsátási osztályától függ – jelenleg **Románia** (MTI 888/2026, 2026.10.01-től) –, ott meg kell adni az autó Euro-besorolását: `euro_class=electric|6|5|4|3|2|1|0` (az `euro6` alak is jó).

- `GET /api/tolls/estimate`: ha az útvonalon ilyen ország van és nincs `euro_class`, **422** jön `{"error": "euro_class_required", "countries": ["RO"]}` tartalommal – a frontend ebből tudja, hogy rá kell kérdeznie a felhasználóra.
- `GET /api/tolls/{country}`: a `requires_euro_class` mező jelzi, hogy kell-e; az árak mindegyik csoportra szerepelnek (`price_by_emission_group`), a `price` csak `euro_class` megadásával töltődik ki.
- Román rovinieta (lej): 1 nap 20/22/26/29 · 10 nap 27/30/35/39 · 30 nap 43/48/55/62 · 60 nap 68/76/87/99 · 12 hónap 228/254/292/330 (elektromos / Euro 6 / Euro 4–5 / Euro 0–3; ismeretlen besorolás = Euro 0).

Megjegyzések:
- AT: online vett 2 hónapos és éves vignetta csak a vásárlás utáni 18. naptól érvényes.
- A km-díj átlagérték, a tényleges díj szakaszonként eltér – becslésként kezelendő.

## REST végpontok

Interaktív dokumentáció: `/docs` (Swagger UI) és `/redoc`.

| Végpont | Leírás |
|---|---|
| `GET /health` | Health check (Render) |
| `GET /api/base-prices` | Aktuális alapárak + napi frissítés állapota |
| `GET /api/countries` | 27 ország, mód (`official`/`estimate`), API-állapot |
| `GET /api/prices` | **Fő végpont a frontendnek** |
| `GET /api/estimate` | Egyetlen becslés bármely országra |
| `GET /api/matrix` | Teljes 3×3 márka × lokáció mátrix + szorzók |
| `GET /api/brands/classify?name=...` | Márkanév → kategória |
| `GET /api/currencies` | Választható pénznemek és árfolyamok |
| `GET /api/tolls` | Mind a 27 ország autópályadíjai |
| `GET /api/tolls/{country}` | Egy ország díjai (matricák, km-díj, külön díjak) |
| `GET /api/tolls/estimate` | Útdíj-becslés egy útvonalra (lásd lent) |

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
| `currency` | nem | megjelenítési pénznem, pl. `HUF` (alapért. `EUR`) |

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

### `GET /api/tolls/estimate` paraméterek

| Paraméter | Érték |
|---|---|
| `countries` | az útvonal országai, pl. `DE,AT,HU` |
| `days` | az út hossza napban (1–365) – ehhez választja ki a legolcsóbb matrica-kombinációt |
| `highway_km` | díjköteles km a km-alapú országokban, pl. `FR:500,HR:380` |
| `special` | beszámítandó külön díjak azonosítói, pl. `a13-brenner,mont-blanc` |
| `euro_class` | az autó Euro-besorolása; kötelező, ha az útvonalon RO van |
| `currency` | pénznem |

```bash
# Budapest → Split egy hétre, forintban
curl "http://localhost:8000/api/tolls/estimate?countries=HU,SI,HR&days=7&highway_km=HR:380&currency=HUF"
```

A válasz országonként tételesen (`lines`), részösszeggel (`subtotal`) és végösszeggel (`total`) adja a díjat.

Az árak alapból **EUR**-ban jönnek; bármely más pénznemhez add meg a `currency` paramétert. A `GET /api/countries` a `local_currency` mezőben jelzi az adott ország helyi pénznemét – ez jó alapértelmezés lehet a frontendben.

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
| `BASE_PRICE_AUTO_REFRESH` | `true` | Napi alapár-frissítés ki/be |
| `REFRESH_TIME` / `REFRESH_TZ` | `06:00` / `Europe/Budapest` | A napi frissítés időpontja |
| `LOG_LEVEL` | `INFO` | Naplózási szint |

## Megjegyzések, korlátok

- A Render free példány 15 perc inaktivitás után elalszik; az első kérés ~30–60 s lehet, és a memóriacache ilyenkor kiürül (ES/IT/PT első lekérése lassabb). Figyelem: a free példányok munkaterületenként havi 750 órát kapnak összesen – egy folyamatosan ébren tartott free szolgáltatás ezt egymaga elhasználja.
- A forrásoldali API-k formátuma előzetes bejelentés nélkül változhat; hiba esetén a backend automatikusan becslésre vált.
- A Tankerkönig-adatok CC BY 4.0 licencűek – a frontendnek fel kell tüntetnie a forrást („Daten: MTS-K / Tankerkönig”). A többi forrás felhasználási feltételeit is érdemes nyilvános kiadás előtt átnézni.
- A heurisztikus becslés tájékoztató jellegű, nem valós kútár.
