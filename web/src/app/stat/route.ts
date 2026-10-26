import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { communityEnabled, db, ensureSchema } from "@/lib/server/community-db";

// Usage statistics, reachable only by typing /stat and logging in
// (STATS_USER / STATS_PASSWORD on Render). Not linked from the app.
const TZ = "Europe/Budapest";

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function authorized(request: Request, USER: string, PASSWORD: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  const [user, ...rest] = Buffer.from(header.slice(6), "base64").toString("utf8").split(":");
  return same(user, USER) && same(rest.join(":"), PASSWORD);
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const num = (v: unknown, digits = 0) =>
  Number(v ?? 0).toLocaleString("hu-HU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const pct = (part: unknown, whole: unknown) => (Number(whole) > 0 ? `${num((Number(part) / Number(whole)) * 100, 1)} %` : "–");

type Row = Record<string, unknown>;

async function q(sql: string, params: unknown[]): Promise<Row[]> {
  return (await db().query(sql, params)).rows as Row[];
}

/** Top values of a text expression over events of one type. */
function top(type: string, expr: string, days: number, limit = 12, from = "fuel.events"): Promise<Row[]> {
  return q(
    `SELECT ${expr} AS label, count(*) AS n FROM ${from}
      WHERE type = $1 AND at > now() - make_interval(days => $2)
      GROUP BY 1 HAVING ${expr} IS NOT NULL ORDER BY n DESC, label LIMIT ${limit}`,
    [type, days],
  );
}

function bars(title: string, rows: Row[], labeler: (l: unknown) => string = (l) => esc(l)): string {
  if (rows.length === 0) return `<section><h3>${esc(title)}</h3><p class="muted">Nincs adat.</p></section>`;
  const max = Math.max(...rows.map((r) => Number(r.n)));
  const total = rows.reduce((s, r) => s + Number(r.n), 0);
  return `<section><h3>${esc(title)}</h3><table class="bars">${rows
    .map(
      (r) =>
        `<tr><td class="l">${labeler(r.label)}</td><td class="b"><span style="width:${(Number(r.n) / max) * 100}%"></span></td><td class="n">${num(r.n)}</td><td class="p">${pct(r.n, total)}</td></tr>`,
    )
    .join("")}</table></section>`;
}

const country = (code: unknown) => {
  try {
    return `${esc(new Intl.DisplayNames(["hu"], { type: "region" }).of(String(code)) ?? code)} <small>${esc(code)}</small>`;
  } catch {
    return esc(code);
  }
};

export async function GET(request: Request) {
  // Always on request: credentials and data are read at runtime, never prerendered.
  await connection();
  const USER = process.env.STATS_USER || "";
  const PASSWORD = process.env.STATS_PASSWORD || "";
  if (!USER || !PASSWORD) return new Response("Not found", { status: 404 });
  if (!authorized(request, USER, PASSWORD)) {
    return new Response("Bejelentkezés szükséges", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Fuel stat", charset="UTF-8"', "X-Robots-Tag": "noindex" },
    });
  }
  if (!communityEnabled) return new Response("Nincs adatbázis beállítva (FUEL_DATABASE_URL).", { status: 503 });
  await ensureSchema();

  const daysParam = Number(new URL(request.url).searchParams.get("days"));
  const days = [1, 7, 30, 90, 365].includes(daysParam) ? daysParam : 30;
  const P = [days];
  const W = "at > now() - make_interval(days => $1)";

  const [summary] = await q(
    `SELECT
       count(DISTINCT visitor) AS visitors,
       count(*) FILTER (WHERE type = 'pageview') AS pageviews,
       count(*) FILTER (WHERE type = 'pageview' AND (data->>'standalone')::boolean) AS pwa_views,
       count(*) FILTER (WHERE type = 'plan') AS plans,
       count(DISTINCT visitor) FILTER (WHERE type = 'plan') AS planners,
       count(*) FILTER (WHERE type = 'plan_error') AS plan_errors,
       avg((data->>'km')::numeric) FILTER (WHERE type = 'plan') AS avg_km,
       avg((data->>'ms')::numeric) FILTER (WHERE type = 'plan') AS avg_ms,
       count(*) FILTER (WHERE type = 'plan' AND (data->>'roundTrip')::boolean) AS round_trips,
       count(*) FILTER (WHERE type = 'plan' AND (data->>'waypoints')::int > 0) AS with_waypoints,
       count(*) FILTER (WHERE type = 'plan' AND (data->>'optimize')::boolean) AS optimized,
       count(*) FILTER (WHERE type = 'plan' AND (data->>'fillAtStart')::boolean) AS fill_at_start,
       count(*) FILTER (WHERE type = 'plan' AND jsonb_array_length(data->'avoid') > 0) AS with_avoid,
       count(*) FILTER (WHERE type = 'tolls') AS toll_lookups,
       count(*) FILTER (WHERE type = 'stations') AS station_lookups,
       count(*) FILTER (WHERE type = 'report') AS reports,
       count(*) FILTER (WHERE type = 'report' AND data->>'status' = 'confirmed') AS confirmations,
       count(*) FILTER (WHERE type = 'report' AND data->>'status' = 'implausible') AS rejected,
       count(*) FILTER (WHERE type = 'nav') AS nav_clicks,
       count(*) FILTER (WHERE type = 'install_shown') AS install_shown,
       count(*) FILTER (WHERE type = 'install_accepted') AS install_accepted,
       count(*) FILTER (WHERE type = 'install_dismissed') AS install_dismissed,
       count(*) FILTER (WHERE type = 'language') AS language_changes
     FROM fuel.events WHERE ${W}`,
    P,
  );

  const daily = await q(
    `SELECT to_char(date_trunc('day', at AT TIME ZONE '${TZ}'), 'YYYY-MM-DD') AS day,
            count(DISTINCT visitor) AS visitors,
            count(*) FILTER (WHERE type = 'pageview') AS pageviews,
            count(*) FILTER (WHERE type = 'plan') AS plans,
            count(*) FILTER (WHERE type = 'report') AS reports
       FROM fuel.events WHERE ${W} GROUP BY 1 ORDER BY 1`,
    P,
  );
  const hourly = await q(
    `SELECT extract(hour FROM at AT TIME ZONE '${TZ}')::int AS label, count(*) AS n
       FROM fuel.events WHERE type = 'plan' AND ${W} GROUP BY 1 ORDER BY 1`,
    P,
  );
  const weekday = await q(
    `SELECT extract(isodow FROM at AT TIME ZONE '${TZ}')::int AS label, count(*) AS n
       FROM fuel.events WHERE type = 'plan' AND ${W} GROUP BY 1 ORDER BY 1`,
    P,
  );

  const arrayTop = (type: string, key: string, limit = 15) =>
    q(
      `SELECT x AS label, count(*) AS n FROM fuel.events, jsonb_array_elements_text(data->'${key}') AS x
        WHERE type = $2 AND ${W} GROUP BY 1 ORDER BY n DESC, label LIMIT ${limit}`,
      [days, type],
    );

  const [
    pages, locales, referrers, devices, oses, browsers,
    from, to, pairs, routeCountries, fuels, currencies, avoid, priceModes, warnings, errors,
    stationCountries, reportStatus, reportCountries, tollCountries, euroClasses, navApps, languagesTo, installModes,
  ] = await Promise.all([
    top("pageview", "data->>'path'", days),
    top("pageview", "data->>'locale'", days, 24),
    top("pageview", "data->>'referrer'", days),
    top("pageview", "data->>'device'", days),
    top("pageview", "data->>'os'", days),
    top("pageview", "data->>'browser'", days),
    top("plan", "data->>'from'", days),
    top("plan", "data->>'to'", days),
    top("plan", "(data->>'from') || ' → ' || (data->>'to')", days, 15),
    arrayTop("plan", "countries"),
    top("plan", "data->>'fuel'", days),
    top("plan", "data->>'currency'", days),
    arrayTop("plan", "avoid"),
    arrayTop("plan", "priceModes"),
    arrayTop("plan", "warnings"),
    top("plan_error", "data->>'code'", days),
    top("stations", "data->>'country'", days),
    top("report", "data->>'status'", days),
    top("report", "data->>'country'", days),
    arrayTop("tolls", "countries"),
    top("tolls", "coalesce(data->>'euroClass', 'nincs megadva')", days),
    top("nav", "data->>'app'", days),
    top("language", "data->>'to'", days, 24),
    top("install_shown", "data->>'mode'", days),
  ]);

  // Campaigns: visitors who arrived through a tagged link, and how many of them calculated a trip.
  const campaigns = await q(
    `WITH arrivals AS (
       SELECT DISTINCT visitor,
              coalesce(data->>'utm_source', '–') AS source,
              coalesce(data->>'utm_medium', '–') AS medium,
              coalesce(data->>'utm_campaign', '–') AS campaign,
              coalesce(data->>'utm_content', '–') AS content
         FROM fuel.events
        WHERE type = 'pageview' AND data ? 'utm_source' AND ${W})
     SELECT a.source, a.medium, a.campaign, a.content,
            count(DISTINCT a.visitor) AS visitors,
            count(DISTINCT p.visitor) AS planners
       FROM arrivals a
       LEFT JOIN fuel.events p ON p.visitor = a.visitor AND p.type = 'plan' AND p.at > now() - make_interval(days => $1)
      GROUP BY 1, 2, 3, 4 ORDER BY visitors DESC LIMIT 30`,
    P,
  );

  const kmBuckets = await q(
    `SELECT CASE WHEN km < 100 THEN '0–99 km' WHEN km < 300 THEN '100–299 km' WHEN km < 600 THEN '300–599 km'
                 WHEN km < 1000 THEN '600–999 km' ELSE '1000+ km' END AS label, count(*) AS n, min(km) AS o
       FROM (SELECT (data->>'km')::int AS km FROM fuel.events WHERE type = 'plan' AND ${W}) t
      GROUP BY 1 ORDER BY o`,
    P,
  );
  const stops = await q(
    `SELECT (data->>'stops') || ' tankolás' AS label, count(*) AS n FROM fuel.events WHERE type = 'plan' AND ${W}
      GROUP BY data->>'stops' ORDER BY (data->>'stops')::int`,
    P,
  );
  const imports = await q("SELECT country AS label, stations AS n, imported_at FROM fuel.station_imports ORDER BY country", []);
  const [community] = await q(
    `SELECT (SELECT count(*) FROM fuel.station_prices) AS confirmed_stations,
            (SELECT count(*) FROM fuel.station_prices WHERE confirmed_at > now() - interval '48 hours') AS fresh,
            (SELECT count(*) FROM fuel.price_reports) AS raw_reports,
            (SELECT count(*) FROM fuel.stations) AS stations`,
    [],
  );
  const confirmedByCountry = await q("SELECT country AS label, count(*) AS n FROM fuel.station_prices GROUP BY 1 ORDER BY n DESC LIMIT 15", []);

  const s = summary;
  const card = (label: string, value: string, sub = "") => `<div class="card"><div class="v">${value}</div><div class="k">${esc(label)}</div>${sub ? `<div class="s">${sub}</div>` : ""}</div>`;
  const maxDay = Math.max(1, ...daily.map((d) => Number(d.visitors)), ...daily.map((d) => Number(d.plans)));
  const weekdays = ["", "hétfő", "kedd", "szerda", "csütörtök", "péntek", "szombat", "vasárnap"];

  const html = `<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Fuel – statisztika</title><style>
:root{--bg:#f5f8f8;--fg:#13201f;--mu:#5a6b6a;--ac:#0f8b8d;--ac2:#f2a541;--bd:#d5e0df;--card:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#0f1717;--fg:#e6efee;--mu:#93a6a5;--ac:#3cc3c4;--ac2:#f2b65f;--bd:#2b3c3c;--card:#162121}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:1100px;margin:0 auto;padding:20px 16px 60px}h1{font-size:1.5rem;margin:0 0 4px}h2{font-size:1.15rem;margin:28px 0 10px}h3{font-size:.95rem;margin:0 0 8px}
.muted,small{color:var(--mu)}nav a{display:inline-block;margin:8px 6px 0 0;padding:5px 12px;border:1px solid var(--bd);border-radius:999px;color:var(--fg);text-decoration:none}
nav a.on{background:var(--ac);border-color:var(--ac);color:#fff}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}.card{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:12px}
.card .v{font-size:1.5rem;font-weight:700}.card .k{color:var(--mu);font-size:.85rem}.card .s{font-size:.8rem;color:var(--mu);margin-top:2px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}section{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:12px}
table{width:100%;border-collapse:collapse}td,th{padding:3px 4px;text-align:left;font-size:.88rem;vertical-align:middle}
.bars .l{width:40%}.bars .b span{display:block;height:10px;border-radius:5px;background:var(--ac);min-width:2px}.bars .n,.bars .p{text-align:right;white-space:nowrap;width:1%}.bars .p{color:var(--mu)}
.daily td.b span{display:inline-block;height:8px;border-radius:4px;vertical-align:middle}.daily .v{background:var(--ac)}.daily .pl{background:var(--ac2)}
.daily th{color:var(--mu);font-weight:600}.legend span{display:inline-block;width:10px;height:10px;border-radius:3px;margin:0 4px 0 10px}
</style></head><body><main>
<h1>Fuel by NorbApp – statisztika</h1><p class="muted">Utolsó ${days} nap · időzóna: ${TZ} · frissítve: ${esc(new Date().toLocaleString("hu-HU", { timeZone: TZ }))}</p>
<nav>${[1, 7, 30, 90, 365].map((d) => `<a href="?days=${d}" class="${d === days ? "on" : ""}">${d === 1 ? "24 óra" : `${d} nap`}</a>`).join("")}</nav>

<h2>Összesítés</h2><div class="cards">
${card("Látogató (napi egyedi)", num(s.visitors))}
${card("Oldalmegtekintés", num(s.pageviews), `${pct(s.pwa_views, s.pageviews)} telepített appból`)}
${card("Kalkuláció", num(s.plans), `${num(s.planners)} látogatótól · ${pct(s.planners, s.visitors)} konverzió`)}
${card("Hibás kalkuláció", num(s.plan_errors), pct(s.plan_errors, Number(s.plans) + Number(s.plan_errors)))}
${card("Átlagos útvonal", `${num(s.avg_km)} km`)}
${card("Átlagos számítási idő", `${num(Number(s.avg_ms ?? 0) / 1000, 1)} s`)}
${card("Útdíj-lekérdezés", num(s.toll_lookups))}
${card("Kútlista-lekérdezés", num(s.station_lookups))}
${card("Ár-jelzés", num(s.reports), `${num(s.confirmations)} megerősítő · ${num(s.rejected)} elutasítva`)}
${card("Navigáció-kattintás", num(s.nav_clicks))}
${card("Telepítési ajánlat", num(s.install_shown), `${num(s.install_accepted)} telepítés · ${num(s.install_dismissed)} elutasítás`)}
${card("Nyelvváltás", num(s.language_changes))}
</div>

<h2>Kampányok (UTM)</h2><section>${
  campaigns.length === 0
    ? `<p class="muted">Még nem jött látogató kampánylinkről (pl. <code>?utm_source=facebook&amp;utm_campaign=…</code>).</p>`
    : `<table><tr><th>Forrás</th><th>Típus</th><th>Kampány</th><th>Hirdetés/poszt</th><th style="text-align:right">Látogató</th><th style="text-align:right">Kalkulált</th><th style="text-align:right">Konverzió</th></tr>${campaigns
        .map(
          (c) =>
            `<tr><td>${esc(c.source)}</td><td>${esc(c.medium)}</td><td>${esc(c.campaign)}</td><td>${esc(c.content)}</td><td style="text-align:right">${num(c.visitors)}</td><td style="text-align:right">${num(c.planners)}</td><td style="text-align:right">${pct(c.planners, c.visitors)}</td></tr>`,
        )
        .join("")}</table>`
}</section>

<h2>Napi bontás</h2><section><p class="legend muted"><span style="background:var(--ac)"></span>látogató<span style="background:var(--ac2)"></span>kalkuláció</p>
<table class="daily"><tr><th>Nap</th><th></th><th>Látogató</th><th>Oldal</th><th>Kalkuláció</th><th>Ár-jelzés</th></tr>
${daily
  .map(
    (d) =>
      `<tr><td>${esc(d.day)}</td><td class="b"><span class="v" style="width:${(Number(d.visitors) / maxDay) * 160}px"></span><br><span class="pl" style="width:${(Number(d.plans) / maxDay) * 160}px"></span></td><td>${num(d.visitors)}</td><td>${num(d.pageviews)}</td><td>${num(d.plans)}</td><td>${num(d.reports)}</td></tr>`,
  )
  .join("") || `<tr><td colspan="6" class="muted">Nincs adat.</td></tr>`}
</table></section>

<h2>Útvonalak</h2><div class="grid">
${bars("Honnan (ország)", from, country)}
${bars("Hová (ország)", to, country)}
${bars("Viszonylatok", pairs)}
${bars("Érintett országok", routeCountries, country)}
${bars("Útvonalhossz", kmBuckets)}
${bars("Tankolások száma", stops)}
${bars("Üzemanyag", fuels)}
${bars("Pénznem", currencies)}
${bars("Ármód a tankolási pontokon", priceModes, (l) => esc(({ official: "hivatalos kútár", estimate: "becslés (átlagár)", none: "nincs ár" } as Record<string, string>)[String(l)] ?? l))}
${bars("Útdíjkerülés országai", avoid, country)}
${bars("Figyelmeztetések", warnings)}
${bars("Hibakódok", errors)}
</div>

<h2>Funkciók</h2><div class="cards">
${card("Oda-vissza", pct(s.round_trips, s.plans))}
${card("Köztes megállóval", pct(s.with_waypoints, s.plans))}
${card("Sorrend-optimalizálás", pct(s.optimized, s.plans))}
${card("Teletankolás induláskor", pct(s.fill_at_start, s.plans))}
${card("Útdíjkerülés", pct(s.with_avoid, s.plans))}
</div>
<div class="grid" style="margin-top:14px">
${bars("Kalkulációk óránként", hourly, (l) => `${esc(l)}:00`)}
${bars("Kalkulációk a hét napjain", weekday, (l) => esc(weekdays[Number(l)]))}
${bars("Útdíj: országok", tollCountries, country)}
${bars("Útdíj: Euro-besorolás", euroClasses)}
${bars("Navigációs app", navApps, (l) => esc(({ google: "Google Maps", apple: "Apple Maps (iPhone/iPad)", "apple-mac": "Apple Maps (Mac)", waze: "Waze", geo: "más térképapp (Android)" } as Record<string, string>)[String(l)] ?? l))}
${bars("Telepítési ajánlat módja", installModes, (l) => esc(l === "ios" ? "iOS útmutató" : "telepítés gomb"))}
</div>

<h2>Közösségi árak</h2><div class="cards">
${card("Megerősített árú kút", num(community.confirmed_stations), `${num(community.fresh)} az utolsó 48 órában`)}
${card("Tárolt jelzés (90 nap)", num(community.raw_reports))}
${card("Kút az adatbázisban", num(community.stations))}
</div>
<div class="grid" style="margin-top:14px">
${bars("Jelzések eredménye", reportStatus, (l) => esc(({ pending: "függőben", confirmed: "megerősítette az árat", implausible: "elutasítva (valószínűtlen)" } as Record<string, string>)[String(l)] ?? l))}
${bars("Jelzések országonként", reportCountries, country)}
${bars("Megerősített kutak országonként", confirmedByCountry, country)}
${bars("Kútlista-lekérdezések országonként", stationCountries, country)}
<section><h3>Kút-import (OpenStreetMap)</h3><table>${imports
    .map((r) => `<tr><td>${country(r.label)}</td><td style="text-align:right">${num(r.n)}</td><td class="muted">${r.imported_at ? esc(new Date(String(r.imported_at)).toLocaleDateString("hu-HU")) : "folyamatban"}</td></tr>`)
    .join("") || `<tr><td class="muted">Még nincs import.</td></tr>`}</table></section>
</div>

<h2>Látogatók</h2><div class="grid">
${bars("Oldalak", pages)}
${bars("Nyelv", locales)}
${bars("Eszköz", devices, (l) => esc(({ mobile: "telefon", tablet: "tablet", desktop: "számítógép" } as Record<string, string>)[String(l)] ?? l))}
${bars("Operációs rendszer", oses)}
${bars("Böngésző", browsers)}
${bars("Honnan jöttek (hivatkozó oldal)", referrers)}
${bars("Nyelvváltás erre", languagesTo)}
</div>
<p class="muted" style="margin-top:24px">Névtelen adatok: nincs süti, nincs IP-cím és nincs beírt cím. A „napi egyedi látogató” egy naponta változó kódon alapul, ezért ugyanaz a látogató több napon többször számít.</p>
</main></body></html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}
