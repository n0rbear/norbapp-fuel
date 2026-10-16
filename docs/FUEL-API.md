# FUEL-API – átadási jegyzet

**Folyamat neve: `FUEL-API`** – a NorbApp Fuel üzemanyagár-, útdíj- és pénznem-backendje.
A „FUEL” chatben így lehet rá hivatkozni: *„folytassuk a FUEL-API beépítését”*.

## Hol tart (2026-10-16)

| Elem | Állapot |
|---|---|
| Kód | `backend/` mappa, a `main` ágon (a webbel együtt) |
| Web | https://fuel.norbapp.com (Next.js, `web/`, `main` ág, Render `norbapp-fuel-web`, free, Frankfurt) |
| Élő szolgáltatás | https://norbapp-fuel-api-fra.onrender.com (Render `norbapp-fuel-api-fra`, free csomag, Frankfurt, auto-deploy a `main`-ről) |
| API-dokumentáció | https://norbapp-fuel-api-fra.onrender.com/docs |
| Részletes leírás | `backend/README.md` |
| Tesztek | `cd backend && pip install -r requirements-dev.txt && pytest` – 51 teszt, mind zöld |

## Mit tud

1. **Üzemanyagárak** – 7 országra élő kútárak hivatalos API-kból (DE, AT, ES, FR, IT, PT, SI), a többi 20 EU-országra becslés: országos átlagár × márka × lokáció (`GET /api/prices`, `/api/estimate`, `/api/matrix`).
2. **Napi frissítés 6:00-kor (Europe/Budapest)** – EU Weekly Oil Bulletin átlagárak + EKB-árfolyamok; ha a szolgáltatás alszik, az első kérés pótolja (`GET /api/base-prices`).
3. **Autópályadíjak** – mind a 27 EU-ország, személyautó: matricák, km-díj, alagutak/hidak; útvonal-becslés a legolcsóbb matrica-kombinációval (`GET /api/tolls`, `/api/tolls/{ország}`, `/api/tolls/estimate`).
4. **Euro-besorolás** – ahol az útdíj függ tőle (jelenleg Románia), a `euro_class` kötelező; hiányában 422 `euro_class_required`.
5. **E10** – `fuel=e10`: DE/ES/FR-ben valódi E10-ár, máshol E5 (95) ár `price_fuel`/`fuel_note` jelzéssel.
6. **Pénznem** – minden ár kérhető az EU-s pénznemek bármelyikében: EUR, CZK, DKK, HUF, PLN, RON, SEK (`currency=HUF`, lista: `GET /api/currencies`).

## Döntések (ne nyissuk újra)

- Render **free** csomag, **nincs** ébren tartás (a KetoMentor nem pingeli) – a havi 750 órás keretet a norbapp.com már elviszi. Ha a statikus norbapp oldal elköltözik, a fuel API felvehető a KetoMentor `KEEP_AWAKE_URLS` listájára.
- Csak EU-s pénznemek, árfolyam kizárólag az EKB-tól.
- Útdíjaknál csak személyautó (≤ 3,5 t, 1. kategória).

## Nyitott teendők (javasolt sorrend)

1. ~~**Tankerkönig API-kulcs**~~ – **kész (2026-10-16):** a kulcs be van állítva a Renderen, élesben ellenőrizve: `/api/countries` → DE `configured: true`; `/api/prices?country=DE&lat=52.52&lng=13.40&radius_km=5` dízelre és benzinre is `mode: official`, `source: Tankerkoenig (MTS-K)`, 36 kút árral, `currency=HUF`-fal is (EKB-árfolyam 363,08).
2. ~~**Frontend-beépítés**~~ – **kész (2026-10-16)**, web ág `claude/awesome-pasteur-3tdbj4` (`fb7b782`), élesben: https://fuel.norbapp.com
   - üzemanyagár mind a 27 EU-országra a `/api/prices`-ból (élő kutak / becslés sávval; nem EU-s országban kézi alapár);
   - pénznemválasztó a `/api/currencies` alapján, a választás és az Euro-besorolás a böngészőben megjegyezve, minden kéréshez `currency=`;
   - útdíj a `/api/tolls/estimate`-ből: az utazás napjaihoz a legolcsóbb matrica, km-díjhoz az útvonal autópálya-km-je (OSRM útszámokból becsülve), `422 euro_class_required` esetén az eredményben rákérdez;
   - a web megnyitáskor felébreszti az API-t (`/api/warmup`), a szerver ~70 s-ig vár rá.
   - Még nincs: alagutak/hidak külön díja (`special`) – ehhez útvonal-felismerés kellene.
3. **Android-app** (`app/`) – jelenleg közvetlenül hívja a Tankerkönig/E-Control API-t, és a matricadíjak be vannak égetve (`CalculateTripUseCase.kt`: HU 16,50 €, AT 11,50 €). Átállítás a FUEL-API-ra: üzemanyagár, útdíj, pénznem- és Euro-besorolás-beállítás.
4. ~~**Beolvasztás a `main`-be**~~ – **kész (2026-10-16):** a web és a backend egy ágon, a két szolgáltatás egy közös gyökér `render.yaml`-ban. A Render-szolgáltatásokat (`norbapp-fuel-api`, `norbapp-fuel-web`) a dashboardon kell `main`-re állítani (Settings → Branch).
5. ~~**Frankfurtba költöztetés**~~ – **kész (2026-10-16):** új szolgáltatás `norbapp-fuel-api-fra` (Frankfurt), a web erre mutat. A régi oregoni `norbapp-fuel-api` törölhető, ha az új bevált.

## Karbantartás

- Útdíjak évente (`backend/tolls.py`, `TOLLS_AS_OF`) – matricák jellemzően január 1-jén, Franciaország február 1-jén változik.
- Az alapárak és árfolyamok maguktól frissülnek; kézi felülírás: `BASE_PRICES_JSON` környezeti változó.
