# NorbApp Fuel – web (fuel.norbapp.com)

Next.js web version of the NorbApp Fuel trip-cost calculator. The UI is available in all 24 official EU languages (default: browser language, else Hungarian).

## Features

- Route with optional waypoints (optionally reordered) and real round trips (the return leg is routed, not mirrored)
- Start from an address or the browser's current position
- Refuel planning from consumption, tank size, start level and reserve; the fuel already in the tank is priced at the local median, not treated as a fill-up; optional fill-up before departure
- Fuel types: diesel, petrol E5 (95), petrol E10 (E10 prices where the source publishes them – DE, ES, FR – E5 elsewhere, flagged per point)
- Fuel prices for all 27 EU countries plus Switzerland, Liechtenstein and Monaco from the NorbApp FUEL-API (`backend/`, branch `feature/fuel-price-backend`): live station prices in DE, AT, ES, FR, IT, PT, SI, estimates elsewhere; cheapest station is used unless one is selected
- Tolls from the FUEL-API (`/api/tolls/estimate`): cheapest vignette combination for the trip length, distance-based tolls from the motorway km on the route, Euro emission class where required (Romania)
- Display currency (EUR, CZK, DKK, HUF, PLN, RON, SEK; ECB rates), remembered in the browser; Euro class remembered too
- Manual price override and an explicit fallback price where no price data exists (non-EU countries)
- No Google dependency: OpenStreetMap data via OSRM (routing) and Photon (search)
- Avoid toll roads per country (vignette roads included): the route is split at the border crossings of the fastest route and the parts in the chosen countries are re-routed toll-free via Valhalla; those countries drop out of the toll estimate. The choice is remembered in the browser.
- Language selector at the top of the page with all 24 official EU languages; the choice is remembered in the browser. Numbers, money, dates and country names are formatted with `Intl` for the chosen language.
- Installable PWA (manifest, icons, service worker): the page shell opens offline; `/api/*` (prices, tolls, routes) is never cached.

## Architecture

```text
src/
  app/page.tsx              Static shell
  app/api/plan              POST: route + refuel plan + countries + prices per fuel point
  app/api/tolls             GET: toll estimate (proxy to FUEL-API, validated)
  app/api/currencies        GET: selectable currencies (cached)
  app/api/warmup            POST: wakes the sleeping FUEL-API when the page opens
  app/api/autocomplete      GET: place suggestions (Photon)
  app/api/reverse           GET: address for the current position
  app/api/health            GET: health check
  components/               Client UI (Planner, Results, AddressInput)
  hooks/                    usePersistentState (localStorage settings)
  i18n/                     Language list, provider, Intl formatters; messages/<lang>.ts catalogues (hu is the source, others load on demand)
  lib/trip.ts               Refuel planning and cost model (pure, tested)
  lib/geo.ts                Polyline decoding and distance along the route
  lib/motorway.ts           Motorway km per country from OSRM road refs
  lib/pricing.ts            Price resolution (manual > selected > cheapest > estimate > fallback)
  lib/validate.ts           Request validation
  lib/server/fuel-api.ts    FUEL-API client (prices, tolls, currencies)
  lib/server/osm.ts         OSRM routing, Valhalla toll-free routing, Photon geocoding, offline country lookup
  lib/server/avoid-tolls.ts Per-country toll avoidance (splits the route at borders)
  lib/toll-avoid.ts         Route segmentation for toll avoidance (pure, tested)
  lib/server/               Rate limiting, error mapping
test/                       Vitest unit tests
```

Server routes return message codes (`{ code, params }`) instead of text, so errors and warnings are translated in the browser.

The browser only talks to `/api/*` on this app; those routes are rate limited per IP and call the FUEL-API and the OSM services server-side.

Cost model: the fuel cost is the fuel actually burned on the trip. Fuel burned before the first stop is priced at the start price, after each stop at that stop's price. The amount paid at the pumps during the trip is shown separately.

Motorway km for distance-based tolls are estimated from the OSM road refs of the route steps (e.g. `A 6` in France, `AP-7` in Spain). Tunnels and bridges with separate tolls are not included yet.

The FUEL-API runs on a free Render instance that sleeps; the page wakes it on load (`/api/warmup`) and the server waits up to ~70 s for it.

## Local development

```bash
cd web
cp .env.example .env.local   # fill in the keys
npm ci
npm run dev                  # http://localhost:3000
```

Checks (also run by `.github/workflows/web.yml`):

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Configuration

| Variable | Required | Notes |
| --- | --- | --- |
| `FUEL_API_URL` | no | Default: `https://norbapp-fuel-api-fra.onrender.com` |
| `OSRM_URL` | no | OSRM base URL incl. profile path. Default: `https://routing.openstreetmap.de/routed-car` |
| `PHOTON_URL` | no | Photon base URL. Default: `https://photon.komoot.io` |
| `VALHALLA_URL` | no | Valhalla base URL for toll-free routing. Default: `https://valhalla1.openstreetmap.de` |

The OSM defaults are free public instances with fair-use policies (identifying User-Agent, moderate request rates). For heavier traffic, self-host OSRM/Photon and point these variables at them. Map data © OpenStreetMap contributors (ODbL); the attribution is shown in the page footer, and the Tankerkönig credit ("Daten: MTS-K / Tankerkönig") under the prices.

## Deployment (Render)

The live service is `norbapp-fuel-web` on Render (free plan, Frankfurt): https://norbapp-fuel-web.onrender.com. `render.yaml` in the repository root describes the same setup as a Blueprint (root directory `web`, health check `/api/health`, custom domain `fuel.norbapp.com`). Point DNS for `fuel.norbapp.com` (CNAME) to the Render service hostname.

## Limitations

- Live station prices only where the FUEL-API has an official source; elsewhere an estimate, outside the EU the fallback price.
- Tolls: passenger cars only; motorway km and distance tolls are estimates; separate tunnel/bridge tolls are not included.
- Rate limiting is in memory, per instance.
- Public OSRM/Photon instances have no SLA.
