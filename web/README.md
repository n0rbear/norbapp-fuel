# NorbApp Fuel – web (fuel.norbapp.com)

Next.js web version of the NorbApp Fuel trip-cost calculator. UI language: Hungarian.

## Features

- Route with optional waypoints (optionally reordered) and real round trips (the return leg is routed, not mirrored)
- Start from an address or the browser's current position
- Refuel planning from consumption, tank size, start level and reserve
- Live station prices in Germany (Tankerkönig) and Austria (E-Control); cheapest station is used unless one is selected
- Manual price override and an explicit fallback price where no station data exists
- Vignette countries detected offline from the route geometry; prices are editable defaults
- No Google dependency: OpenStreetMap data via OSRM (routing) and Photon (search)

## Architecture

```text
src/
  app/page.tsx              Static shell
  app/api/plan              POST: route + refuel plan + countries + stations
  app/api/autocomplete      GET: place suggestions (Photon)
  app/api/reverse           GET: address for the current position
  app/api/health            GET: health check
  components/               Client UI (Planner, Results, AddressInput)
  lib/trip.ts               Refuel planning and cost model (pure, tested)
  lib/geo.ts                Polyline decoding and distance along the route
  lib/pricing.ts            Price resolution (manual > selected > cheapest > fallback)
  lib/validate.ts           Request validation
  lib/server/osm.ts         OSRM routing, Photon geocoding, offline country lookup
  lib/server/               Other server-only clients, rate limiting, error mapping
test/                       Vitest unit tests
```

Third-party calls (and the optional Tankerkönig key) stay on the server. The browser only talks to `/api/*`, which are rate limited per IP.

Cost model: the fuel cost is the fuel actually burned on the trip. Fuel burned before the first stop is priced at the start price, after each stop at that stop's price. The amount paid at the pumps during the trip is shown separately.

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
| `TANKERKOENIG_API_KEY` | no | Without it, German stops fall back to the manual/fallback price. |
| `OSRM_URL` | no | OSRM base URL incl. profile path. Default: `https://routing.openstreetmap.de/routed-car` |
| `PHOTON_URL` | no | Photon base URL. Default: `https://photon.komoot.io` |

The defaults are free public instances with fair-use policies (identifying User-Agent, moderate request rates). For heavier traffic, self-host OSRM/Photon and point these variables at them. Map data © OpenStreetMap contributors (ODbL); the attribution is shown in the page footer.

## Deployment (Render)

The live service is `norbapp-fuel-web` on Render (free plan, Frankfurt): https://norbapp-fuel-web.onrender.com. `render.yaml` in the repository root describes the same setup as a Blueprint (root directory `web`, health check `/api/health`, custom domain `fuel.norbapp.com`). Set `TANKERKOENIG_API_KEY` in the Render dashboard (optional), then point DNS for `fuel.norbapp.com` (CNAME) to the Render service hostname.

## Limitations

- Live prices only for Germany and Austria; elsewhere prices come from user input.
- Vignette prices are approximate defaults and must be verified by the user.
- Rate limiting is in memory, per instance.
- Public OSRM/Photon instances have no SLA.
