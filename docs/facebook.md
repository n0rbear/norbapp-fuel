# Fuel by NorbApp – Facebook kit

Link previews: the page shows its own image, title and description per language.
`https://fuel.norbapp.com/?lang=hu` (default), `?lang=de`, `?lang=en`. The same parameter
opens the app in that language. Images: `web/public/og/hu.png`, `de.png`, `en.png` (1200×630).

After changing a preview, refresh Facebook's cache: https://developers.facebook.com/tools/debug/
(paste the link → "Scrape Again").

## Tracked links (UTM)

Every link below is counted on `/stat` → "Kampányok (UTM)", with visitors and how many of
them calculated a trip. Pattern:

`https://fuel.norbapp.com/?lang=<hu|de|en>&utm_source=facebook&utm_medium=<post|group|paid>&utm_campaign=<name>&utm_content=<variant>`

| Use | Link |
| --- | --- |
| Own page post (hu) | `https://fuel.norbapp.com/?lang=hu&utm_source=facebook&utm_medium=post&utm_campaign=launch` |
| Group post (hu) | `https://fuel.norbapp.com/?lang=hu&utm_source=facebook&utm_medium=group&utm_campaign=launch` |
| Paid ad, image A (hu) | `https://fuel.norbapp.com/?lang=hu&utm_source=facebook&utm_medium=paid&utm_campaign=hazautazas&utm_content=a` |
| Paid ad, image B (hu) | `https://fuel.norbapp.com/?lang=hu&utm_source=facebook&utm_medium=paid&utm_campaign=hazautazas&utm_content=b` |
| Paid ad (de) | `https://fuel.norbapp.com/?lang=de&utm_source=facebook&utm_medium=paid&utm_campaign=heimfahrt&utm_content=a` |
| Paid ad (en) | `https://fuel.norbapp.com/?lang=en&utm_source=facebook&utm_medium=paid&utm_campaign=roadtrip&utm_content=a` |

In Meta Ads Manager you can also put the parameters into "URL parameters" instead of the link:
`lang=hu&utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}`

## Posts – Magyar

**Saját oldal / bemutató**
> 🚗 Mennyibe kerül az út haza – vagy bárhová Európában?
>
> Elkészült a Fuel by NorbApp: megadod honnan hová mész, és megmutatja
> ⛽ hol érdemes tankolni (a legolcsóbb kutakkal, ahol van hivatalos kútár),
> 🛣️ mennyi a matrica és az útdíj országonként,
> 💶 és mennyibe kerül az egész út – a pénznemedben.
>
> 36 európai ország (EU, Svájc, Nyugat-Balkán, Törökország), Liechtenstein és Monaco. Ingyenes, regisztráció nélkül, telefonra telepíthető.
> 👉 fuel.norbapp.com

**Csoportba (hazajárók, kint dolgozók)**
> Sokan kérdezik itt, mennyibe jön ki az út haza autóval. Én erre csináltam egy ingyenes kalkulátort:
> beírod az indulást és a célt, és kiírja a tankolásokat (Németországban, Ausztriában konkrét kútárakkal),
> a matricákat és az útdíjat is. Ha valami nem stimmel benne, szóljatok, javítom. 🙂
> fuel.norbapp.com

**Nyár / karácsony előtt**
> 🎄 Hazautazás előtt: nézd meg, mennyibe kerül az út, és hol tankolj olcsóbban útközben.
> Matricák, útdíjak, tankolási pontok egy helyen → fuel.norbapp.com

**Közösségi árak (ahol nincs hivatalos kútár, pl. Magyarország)**
> ⛽ Magyarországon nincs nyilvános kútár-adatbázis – de együtt meg tudjuk csinálni!
> Ha tankoltál, írd be névtelenül a kút árát a Fuelben. Ha ketten ugyanazt jelzik, az ár megerősítést kap,
> és mindenki pontosabb költséget lát. fuel.norbapp.com

## Ads – Magyar

- **Elsődleges szöveg:** Mennyibe kerül az út haza? Útvonal, tankolás a legolcsóbb kutaknál, matricák és útdíjak – egy kattintással. Ingyenes, regisztráció nélkül.
- **Címsor:** Számold ki az útiköltséget
- **Leírás:** 36 európai ország (EU, Svájc, Nyugat-Balkán, Törökország)
- **Gomb:** Bővebben / Megnyitás

Változat B:
- **Elsődleges szöveg:** München–Budapest kb. 130 € autóval? Nézd meg a saját utadat: tankolás, matrica, útdíj egy helyen.
- **Címsor:** Ennyi lesz az út – előre

## Posts – Deutsch

**Eigene Seite**
> 🚗 Was kostet die Fahrt – nach Hause oder quer durch Europa?
>
> Fuel by NorbApp rechnet es aus: Route eingeben und du siehst
> ⛽ wo du am günstigsten tankst (mit echten Tankstellenpreisen in DE, AT, ES, FR, IT, PT, SI),
> 🛣️ Vignetten und Maut je Land,
> 💶 und die Gesamtkosten – in deiner Währung.
>
> 36 europäische Länder (EU, Schweiz, Westbalkan, Türkei), Liechtenstein und Monaco. Kostenlos, ohne Anmeldung.
> 👉 fuel.norbapp.com/?lang=de

**Anzeige**
- **Primärer Text:** Was kostet die Fahrt? Route, Tankstopps an den günstigsten Tankstellen, Vignetten und Maut – mit einem Klick. Kostenlos, ohne Anmeldung.
- **Überschrift:** Reisekosten vorher wissen
- **Beschreibung:** 36 europäische Länder (EU, Schweiz, Westbalkan, Türkei)

## Posts – English

**Own page**
> 🚗 What will your road trip really cost?
>
> Fuel by NorbApp works it out: enter your route and see
> ⛽ where to fill up (with live station prices in DE, AT, ES, FR, IT, PT, SI),
> 🛣️ vignettes and tolls per country,
> 💶 and the total – in your currency.
>
> 36 European countries incl. the Western Balkans and Turkey. Free, no sign-up.
> 👉 fuel.norbapp.com/?lang=en

**Ad**
- **Primary text:** What will the trip cost? Route, fuel stops at the cheapest stations, vignettes and tolls – in one click. Free, no sign-up.
- **Headline:** Know your trip cost before you go
- **Description:** 36 European countries (EU, Switzerland, Western Balkans, Turkey)

## Targeting ideas (Meta Ads)

- **Hungarians abroad (hazajárók):** location DE, AT, CH, NL, BE; language Hungarian; age 25–60. Use the hu texts.
- **Holiday drivers (summer):** location HU, DE, AT, PL, CZ; interests road trip, camping, caravan, Croatia, Italy. Use the language of the country.
- **Budget:** start with 3–5 €/day per ad set for a week, 2 images or texts each; keep what has the best conversion on `/stat`.

## Facebook page (one page, three languages)

Images in `docs/facebook/`: `profile-720.png` (profile picture, shown as a circle) and
`cover-1640x624.png` (cover; the text sits in the centre so it survives the mobile crop).

| Field | Value |
| --- | --- |
| Page name | Fuel by NorbApp |
| Category | App page (Alkalmazásoldal) – second: Travel & transportation |
| Username | @fuelbynorbapp (if taken: @fuel.norbapp) |
| Website | https://fuel.norbapp.com/?utm_source=facebook&utm_medium=page&utm_campaign=profile |
| Button | "Use app" (Alkalmazás használata) → same link |
| E-mail | norbert@norbapp.com |

**Bio (max. 101 characters)** – pick one, the page has a single bio:

- hu: `Mennyibe kerül az út? Tankolás, matrica, útdíj – 36 európai ország. Ingyenes.`
- de: `Was kostet die Fahrt? Tanken, Vignette, Maut – 36 Länder in Europa. Kostenlos.`
- en: `What will the trip cost? Fuel, vignettes, tolls – 36 European countries. Free.`
- trilingual (fits): `🇭🇺 Útiköltség · 🇩🇪 Reisekosten · 🇬🇧 Trip cost – fuel, vignettes, tolls. Free.`

**Long description (Details / About):**

> 🇭🇺 A Fuel by NorbApp kiszámolja, mennyibe kerül az autós út Európában: útvonal, tankolási pontok
> (Németországban, Ausztriában, Spanyolországban, Franciaországban, Olaszországban, Portugáliában és
> Szlovéniában konkrét kútárakkal), matricák és útdíjak, a választott pénznemben. Ahol csak átlagár van,
> a felhasználók névtelenül jelezhetik a kutak árát. Ingyenes, regisztráció nélkül, 24 nyelven.
>
> 🇩🇪 Fuel by NorbApp berechnet, was eine Autofahrt durch Europa kostet: Route, Tankstopps (mit echten
> Tankstellenpreisen in DE, AT, ES, FR, IT, PT, SI), Vignetten und Maut – in der Währung deiner Wahl.
> Kostenlos, ohne Anmeldung, in 24 Sprachen.
>
> 🇬🇧 Fuel by NorbApp works out what a drive across Europe costs: route, fuel stops (with live station
> prices in DE, AT, ES, FR, IT, PT, SI), vignettes and tolls – in your currency. Free, no sign-up,
> in 24 languages.
>
> 👉 fuel.norbapp.com

**Posting in several languages:** in the post composer on the page choose
"Write post in multiple languages" (Bejegyzés írása több nyelven) and add hu, de and en versions –
everyone sees the version in their own Facebook language. If the option is missing, post the
trilingual text below.

**First post – pin it (Kitűzés):**

> 🚗 Mennyibe kerül az út? / Was kostet die Fahrt? / What will the trip cost?
>
> 🇭🇺 Add meg, honnan hová mész: a Fuel megmutatja, hol érdemes tankolni, mennyi a matrica és az útdíj,
> és mennyibe kerül az egész út. Ingyenes, regisztráció nélkül.
> 🇩🇪 Route eingeben: Fuel zeigt, wo du günstig tankst, was Vignetten und Maut kosten und was die ganze
> Fahrt kostet. Kostenlos, ohne Anmeldung.
> 🇬🇧 Enter your route: Fuel shows where to fill up, what vignettes and tolls cost and the total for
> the trip. Free, no sign-up.
>
> 👉 https://fuel.norbapp.com/?utm_source=facebook&utm_medium=page&utm_campaign=launch&utm_content=pinned
