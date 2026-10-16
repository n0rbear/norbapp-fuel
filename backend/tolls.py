"""Motorway tolls for passenger cars (<= 3.5 t, class 1): the 27 EU countries
plus Switzerland, Liechtenstein and Monaco.

Three charging models:
  vignette  time-based e-vignette (AT, BG, CZ, HU, RO, SI, SK)
  distance  pay per section / per km (FR, IT, ES, PT, HR, GR, PL, IE)
  free      no general motorway charge for cars (the rest)
Any country may additionally have special tolls (tunnels, bridges, passes).

Where the price depends on the car's emission class (Romania since
1 Oct 2026), vignettes carry a price per emission group and the caller must
state the car's Euro class.

Prices are stored in the currency they are sold in and converted on output.
Distance-based per-km rates are averages for a quick estimate; the real
price depends on the section. Data as of TOLLS_AS_OF; prices change mostly
on 1 January (vignettes) and 1 February (France), so review this file yearly.
"""

from __future__ import annotations

from dataclasses import dataclass, field

TOLLS_AS_OF = "2026-10"

# Accepted `euro_class` values -> emission group used in price tables.
EURO_CLASSES = ("electric", "6", "5", "4", "3", "2", "1", "0")
EMISSION_GROUPS = {
    "electric": "electric",
    "6": "euro6",
    "5": "euro4_5", "4": "euro4_5",
    "3": "euro0_3", "2": "euro0_3", "1": "euro0_3", "0": "euro0_3",
}
EMISSION_GROUP_LABELS = {
    "electric": "Elektromos",
    "euro6": "Euro 6",
    "euro4_5": "Euro 4–5",
    "euro0_3": "Euro 0–3 / ismeretlen",
}


class EuroClassRequiredError(ValueError):
    pass


def emission_group(euro_class: str | None) -> str | None:
    if euro_class is None:
        return None
    key = euro_class.strip().lower().removeprefix("euro").strip()
    if key not in EMISSION_GROUPS:
        raise ValueError(f"Invalid euro_class '{euro_class}'. Use one of: {', '.join(EURO_CLASSES)}.")
    return EMISSION_GROUPS[key]


@dataclass(frozen=True)
class VignetteOption:
    id: str
    label: str
    days: int  # validity used for trip-cost optimisation
    price: float
    note: str | None = None
    for_trips: bool = True  # False: regional/calendar products excluded from optimisation
    price_by_group: dict[str, float] | None = None  # emission group -> price

    def price_for(self, group: str | None) -> float:
        if self.price_by_group is None:
            return self.price
        if group is None:
            raise EuroClassRequiredError("euro_class is required")
        return self.price_by_group[group]


@dataclass(frozen=True)
class SpecialToll:
    id: str
    name: str
    price: float
    road: str | None = None
    note: str | None = None
    currency: str | None = None  # defaults to the country's toll currency


@dataclass(frozen=True)
class CountryTolls:
    code: str
    system: str  # vignette | distance | free
    currency: str
    summary_hu: str
    vignettes: tuple[VignetteOption, ...] = ()
    per_km: float | None = None  # average class-1 rate on tolled motorways
    special: tuple[SpecialToll, ...] = ()
    sources: tuple[str, ...] = field(default_factory=tuple)

    @property
    def emission_based(self) -> bool:
        return any(v.price_by_group for v in self.vignettes)


V, S = VignetteOption, SpecialToll

# Romania, passenger cars (category A), lei incl. VAT, Order MTI 888/2026
# (Monitorul Oficial nr. 818 / 25.09.2026), applied from 1 Oct 2026.
RO_PRICES: dict[str, dict[str, float]] = {
    "1d": {"electric": 20, "euro6": 22, "euro4_5": 26, "euro0_3": 29},
    "10d": {"electric": 27, "euro6": 30, "euro4_5": 35, "euro0_3": 39},
    "30d": {"electric": 43, "euro6": 48, "euro4_5": 55, "euro0_3": 62},
    "60d": {"electric": 68, "euro6": 76, "euro4_5": 87, "euro0_3": 99},
    "1y": {"electric": 228, "euro6": 254, "euro4_5": 292, "euro0_3": 330},
}

TOLLS: dict[str, CountryTolls] = {
    t.code: t
    for t in [
        # --- Vignette countries --------------------------------------------
        CountryTolls(
            "AT", "vignette", "EUR",
            "Digitális vagy matricás vignetta minden autópályán és gyorsforgalmi úton; egyes alagutakon/hágókon külön szakaszdíj.",
            vignettes=(
                V("1d", "1 napos (csak digitális)", 1, 9.60),
                V("10d", "10 napos", 10, 12.80),
                V("2m", "2 hónapos", 60, 32.00, "Online vásárlásnál csak a 18. naptól érvényes."),
                V("1y", "Éves 2026", 365, 106.80, "2025.12.01 – 2027.01.31; online csak a 18. naptól."),
            ),
            special=(
                S("a13-brenner", "Brenner-autópálya", 12.50, "A13"),
                S("a10-tauern", "Tauern- és Katschberg-alagút", 15.00, "A10", "Csak Katschberg: 7,50 €."),
                S("a11-karawanken", "Karawanken-alagút", 9.00, "A11"),
                S("a9-gleinalm", "Gleinalm-alagút", 12.00, "A9"),
                S("a9-bosruck", "Bosruck-alagút", 7.00, "A9"),
                S("s16-arlberg", "Arlberg-alagút", 13.00, "S16"),
                S("felbertauern", "Felbertauern-alagút", 13.50, "B108"),
            ),
            sources=("https://www.asfinag.at/maut-vignette/",),
        ),
        CountryTolls(
            "BG", "vignette", "EUR",
            "E-vignetta (rendszámhoz kötött) az országos úthálózaton; árak 2026.08.01-től.",
            vignettes=(
                V("1d", "1 napos", 1, 5.30),
                V("weekend", "Hétvégi (P 12:00 – V 23:59)", 3, 6.60, for_trips=False),
                V("7d", "Heti", 7, 10.00),
                V("30d", "Havi", 30, 19.90),
                V("90d", "Negyedéves", 90, 35.90),
                V("1y", "Éves", 365, 64.50),
            ),
            sources=("https://www.bgtoll.bg/",),
        ),
        CountryTolls(
            "CZ", "vignette", "CZK",
            "Elektronikus dálniční známka a díjköteles autópályákon; elektromos autóknak ingyenes.",
            vignettes=(
                V("1d", "1 napos", 1, 230),
                V("10d", "10 napos", 10, 300),
                V("30d", "30 napos", 30, 480),
                V("1y", "Éves (365 nap)", 365, 2570),
            ),
            sources=("https://edalnice.cz/",),
        ),
        CountryTolls(
            "HU", "vignette", "HUF",
            "E-matrica (D1 kategória) az autópályákon és autóutakon; vármegyei matricák is választhatók.",
            vignettes=(
                V("1d", "Napi országos", 1, 5550),
                V("10d", "10 napos országos", 10, 6900),
                V("1m", "Havi országos", 30, 11170),
                V("1y", "Éves országos", 365, 61760),
                V("county", "Éves vármegyei (1 vármegye)", 365, 7190, for_trips=False),
                V("m1-regional", "Éves M1 regionális", 365, 15000, for_trips=False),
            ),
            sources=("https://nemzetiutdij.hu/",),
        ),
        CountryTolls(
            "RO", "vignette", "RON",
            "Rovinieta az országos utakon; 2026.10.01-től az ár a jármű Euro-besorolásától függ "
            "(MTI 888/2026). Besorolási adat nélkül Euro 0-nak számít.",
            vignettes=(
                V("1d", "1 napos", 1, 22, price_by_group=RO_PRICES["1d"]),
                V("10d", "10 napos", 10, 30, price_by_group=RO_PRICES["10d"]),
                V("30d", "30 napos", 30, 48, price_by_group=RO_PRICES["30d"]),
                V("60d", "60 napos", 60, 76, price_by_group=RO_PRICES["60d"]),
                V("1y", "12 hónapos", 365, 254, price_by_group=RO_PRICES["1y"]),
            ),
            special=(
                S("calafat-vidin", "Calafat–Vidin Duna-híd", 6.00, currency="EUR"),
                S("giurgiu-ruse", "Giurgiu–Ruse Duna-híd", 2.00, None, "Ruse → Giurgiu irányban.", "EUR"),
            ),
            sources=("https://www.erovinieta.ro/",),
        ),
        CountryTolls(
            "SI", "vignette", "EUR",
            "E-vinjeta (2A osztály) az autópályákon és gyorsforgalmi utakon.",
            vignettes=(
                V("7d", "Heti", 7, 16.00),
                V("1m", "Havi", 30, 32.00),
                V("1y", "Éves", 365, 117.50),
            ),
            sources=("https://evinjeta.dars.si/",),
        ),
        CountryTolls(
            "SK", "vignette", "EUR",
            "Elektronikus diaľničná známka a díjköteles autópályákon.",
            vignettes=(
                V("1d", "1 napos", 1, 8.10),
                V("10d", "10 napos", 10, 10.80),
                V("30d", "30 napos", 30, 17.10),
                V("1y", "365 napos", 365, 90.00),
            ),
            sources=("https://eznamka.sk/",),
        ),
        # --- Distance-based countries ---------------------------------------
        CountryTolls(
            "FR", "distance", "EUR",
            "Szakaszonkénti útdíj a koncessziós autópályákon (péage), átlag ~0,10 €/km; egyes szakaszok ingyenesek.",
            per_km=0.10,
            special=(
                S("mont-blanc", "Mont-Blanc-alagút (FR→IT)", 55.50, None, "Retúr 69,20 €."),
                S("frejus", "Fréjus-alagút (FR→IT)", 55.50, None, "Retúr 69,20 €."),
                S("millau", "Millau-völgyhíd", 11.30, "A75", "Nyáron (06.15–09.15) 13,80 €."),
                S("normandie", "Pont de Normandie", 6.10),
                S("puymorens", "Puymorens-alagút", 7.80),
                S("tancarville", "Pont de Tancarville", 2.90),
            ),
            sources=("https://www.autoroutes.fr/",),
        ),
        CountryTolls(
            "IT", "distance", "EUR",
            "Szakaszonkénti útdíj (pedaggio) szinte minden autópályán, átlag ~0,08 €/km.",
            per_km=0.08,
            special=(
                S("mont-blanc", "Monte Bianco-alagút (IT→FR)", 56.40, None, "Retúr 70,40 €."),
                S("frejus", "Fréjus-alagút (IT→FR)", 56.40, None, "Retúr 70,40 €."),
                S("gran-san-bernardo", "Nagy Szent Bernát-alagút (IT→CH)", 33.50, None, "Retúr 53,50 €."),
            ),
            sources=("https://www.autostrade.it/",),
        ),
        CountryTolls(
            "ES", "distance", "EUR",
            "A legtöbb autópálya ingyenes; a maradék fizetős AP-szakaszokon átlag ~0,12 €/km.",
            per_km=0.12,
            special=(
                S("cadi", "Cadí-alagút", 14.56, "C-16"),
                S("vallvidrera", "Vallvidrera-alagút", 4.70, "C-16", "Csúcsidőben 5,28 €."),
                S("artxanda", "Artxanda-alagút (Bilbao)", 1.55),
            ),
            sources=("https://www.transportes.gob.es/",),
        ),
        CountryTolls(
            "PT", "distance", "EUR",
            "Szakaszonkénti útdíj (portagem), sok helyen csak elektronikus (Via Verde / rendszám), átlag ~0,09 €/km.",
            per_km=0.09,
            special=(
                S("ponte-25-abril", "25 de Abril híd (Lisszabon)", 2.25, None, "Csak észak felé."),
                S("vasco-da-gama", "Vasco da Gama híd (Lisszabon)", 3.40, None, "Csak észak felé."),
            ),
            sources=("https://www.portagens.pt/",),
        ),
        CountryTolls(
            "HR", "distance", "EUR",
            "Szakaszonkénti útdíj (I. kategória), átlag ~0,07 €/km; Zágráb–Split 26,40 €.",
            per_km=0.07,
            special=(S("ucka", "Učka-alagút", 4.70, "A8"),),
            sources=("https://www.hac.hr/",),
        ),
        CountryTolls(
            "GR", "distance", "EUR",
            "Fizetőkapus rendszer (2,50–4 € kapunként), átlag ~0,06 €/km; Athén–Thesszaloniki ~30 €.",
            per_km=0.06,
            special=(
                S("rio-antirrio", "Rio–Antirrio híd", 15.90),
                S("aktio-preveza", "Aktio–Preveza-alagút", 3.00),
            ),
            sources=("https://www.aodos.gr/",),
        ),
        CountryTolls(
            "PL", "distance", "PLN",
            "Csak az A1, A2, A4 koncessziós szakaszai fizetősek; az állami autópályák személyautóval ingyenesek.",
            per_km=0.45,
            special=(
                S("a1-gdansk-torun", "A1 Gdańsk–Toruń", 29.90, "A1"),
                S("a2-swiecko-konin", "A2 Świecko–Konin", 141.00, "A2", "2026.09.11-től."),
                S("a4-katowice-krakow", "A4 Katowice–Kraków", 36.00, "A4", "2 × 18 zł."),
            ),
            sources=("https://etoll.gov.pl/",),
        ),
        CountryTolls(
            "IE", "distance", "EUR",
            "Pontszerű útdíjak egyes autópályákon (fizetőkapu vagy kapu nélküli M50).",
            special=(
                S("m50", "M50 (Dublin, kapu nélküli)", 3.20, "M50", "Taggel 2,60 €, regisztráció nélkül 3,80 €; másnap 20:00-ig fizetendő."),
                S("m1", "M1 (Gormanston)", 2.30, "M1"),
                S("m4", "M4 (Kilcock–Kinnegad)", 3.60, "M4"),
                S("m7-m8", "M7/M8 (Portlaoise)", 2.30, "M7/M8"),
                S("m3", "M3 (kapunként)", 1.80, "M3"),
                S("east-link", "East Link híd", 2.30),
                S("dublin-port-tunnel", "Dublin Port Tunnel", 3.50, None, "Csúcsidőben 12–14 €."),
            ),
            sources=("https://www.tii.ie/",),
        ),
        # --- No general motorway charge for cars ----------------------------
        CountryTolls("BE", "free", "EUR", "Az autópályák ingyenesek; fizetős a Liefkenshoek-alagút.",
                     special=(S("liefkenshoek", "Liefkenshoek-alagút (Antwerpen)", 7.00),)),
        CountryTolls("CY", "free", "EUR", "Nincs útdíj."),
        CountryTolls("DE", "free", "EUR", "Személyautónak nincs autópályadíj; két városi alagút fizetős.",
                     special=(S("warnow", "Warnow-alagút (Rostock)", 5.10), S("herrentunnel", "Herrentunnel (Lübeck)", 2.10))),
        CountryTolls("DK", "free", "DKK", "Az autópályák ingyenesek; a nagy hidak fizetősek.",
                     special=(S("storebaelt", "Storebælt-híd", 235, None, "BroBizz-zel olcsóbb."),
                              S("oresund", "Øresund-híd (DK→SE)", 470, None, "Online/előfizetéssel olcsóbb."))),
        CountryTolls("EE", "free", "EUR", "Személyautónak nincs útdíj."),
        CountryTolls("FI", "free", "EUR", "Nincs útdíj."),
        CountryTolls("LT", "free", "EUR", "Személyautónak nincs útdíj; a Kur-földnyelvre belépési díj van (szezonális)."),
        CountryTolls("LU", "free", "EUR", "Nincs útdíj."),
        CountryTolls("LV", "free", "EUR", "Személyautónak nincs útdíj; Jūrmalába belépési díj (5 €/nap, szezonális).",
                     special=(S("jurmala", "Jūrmala belépési díj", 5.00, None, "Április–szeptember."),)),
        CountryTolls("MT", "free", "EUR", "Nincs autópályadíj; Valletta belvárosába behajtási díj.",
                     special=(S("valletta-cva", "Valletta behajtási díj (CVA)", 2.00),)),
        CountryTolls("NL", "free", "EUR", "Az autópályák ingyenesek; a Westerschelde-alagút 2025 óta díjmentes.",
                     special=(S("kiltunnel", "Kiltunnel (Dordrecht)", 2.00),)),
        # --- Non-EU neighbours -----------------------------------------------
        CountryTolls(
            "CH", "vignette", "CHF",
            "Éves autópálya-matrica (e-matrica vagy matrica) minden autópályán; rövidebb időtartam nincs.",
            vignettes=(V("1y", "Éves autópálya-matrica 2026", 365, 40.00, "A naptári évre érvényes (2025.12.01 – 2027.01.31)."),),
            sources=("https://www.bazg.admin.ch/bazg/en/home/information-individuals/motorway-vignette.html",),
        ),
        CountryTolls("LI", "free", "CHF", "Nincs autópálya és útdíj (Svájcon át érkezve a svájci matrica kell)."),
        CountryTolls("MC", "free", "EUR", "Nincs útdíj (az A8-as francia autópálya fizetős)."),
        CountryTolls("SE", "free", "SEK", "Nincs autópályadíj; néhány híd és Stockholm/Göteborg dugódíj fizetős.",
                     special=(S("oresund", "Øresund-híd (SE→DK)", 690, None, "Online/előfizetéssel olcsóbb."),
                              S("sundsvall", "Sundsvall-híd", 9), S("motala", "Motala-híd", 5),
                              S("stockholm-congestion", "Stockholm dugódíj (napi max.)", 135),
                              S("goteborg-congestion", "Göteborg dugódíj (napi max.)", 60))),
    ]
}

# Cross-check source for all countries (aggregated, dated price list).
GENERAL_SOURCE = "https://www.fuel-prices.eu/tolls/"


def cheapest_vignettes(
    options: tuple[VignetteOption, ...], days: int, group: str | None = None
) -> tuple[float, list[VignetteOption]]:
    """Cheapest combination of consecutive vignettes covering `days` days."""
    usable = [o for o in options if o.for_trips]
    if not usable or days <= 0:
        return 0.0, []
    best: list[tuple[float, list[VignetteOption]]] = [(0.0, [])] + [(float("inf"), [])] * days
    for d in range(1, days + 1):
        for option in usable:
            prev_cost, prev_combo = best[max(0, d - option.days)]
            price = option.price_for(group)
            if prev_cost + price < best[d][0]:
                best[d] = (prev_cost + price, prev_combo + [option])
    return best[days]
