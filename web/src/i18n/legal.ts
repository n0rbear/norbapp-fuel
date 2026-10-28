import type { Locale } from "./locales";

// Legal pages are maintained in Hungarian, German and English; every other
// interface language shows the English text with a short note.

export type LegalSection = { title: string; body: string[]; adsOnly?: boolean };
export type LegalPage = { title: string; updated: string; sections: LegalSection[] };
export type LegalTexts = {
  onlyIn: string;
  imprint: LegalPage;
  privacy: LegalPage;
  sources: LegalPage;
};

const SOURCES_EN: LegalPage = {
  title: "Sources and licences",
  updated: "",
  sections: [
    {
      title: "Maps and routes",
      body: [
        "Map data © OpenStreetMap contributors, available under the Open Database Licence (ODbL) – openstreetmap.org/copyright.",
        "Routing: OSRM and Valhalla servers operated by FOSSGIS e.V. (routing.openstreetmap.de, valhalla1.openstreetmap.de). Address search: Photon by komoot (photon.komoot.io).",
      ],
    },
    {
      title: "Fuel prices",
      body: [
        "Fuel station locations in average-price countries: OpenStreetMap (Overpass API). User-reported prices: Fuel by NorbApp users. Station prices: Germany – Tankerkönig / MTS-K (CC BY 4.0); Austria – E-Control Spritpreisrechner; Spain, France, Italy, Portugal and Slovenia – the official open price data of those countries.",
        "Country averages and estimates: European Commission Weekly Oil Bulletin. Switzerland: TCS fuel price radar as anchor, moved daily with the neighbouring countries. Western Balkans and Turkey: these countries publish no official average price (Serbia, Montenegro, North Macedonia and Kosovo only announce regulated maximum prices; Turkey and Bosnia and Herzegovina have free pricing), so prices are estimated from the national price level relative to the neighbouring EU countries, moved daily with them. Exchange rates: European Central Bank.",
        "All prices are indicative; the price at the pump is what counts.",
      ],
    },
    {
      title: "Tolls and vignettes",
      body: [
        "Vignette and toll tariffs are collected from the official national operators and checked regularly. Distance-based tolls (and all tolls in the Western Balkans and Turkey) are estimates.",
      ],
    },
    {
      title: "Software",
      body: ["Fuel by NorbApp is built with Next.js, React and FastAPI. Price and toll data are served by the NorbApp FUEL-API."],
    },
  ],
};

const EN: LegalTexts = {
  onlyIn: "This page is available in English, German and Hungarian.",
  imprint: {
    title: "Imprint",
    updated: "",
    sections: [
      { title: "Provider", body: ["NorbApp", "E-mail: norbert@norbapp.com", "Telegram: @norbapp (t.me/norbapp)"] },
      {
        title: "Note",
        body: [
          "This page currently contains only the contact details approved by the operator. Further mandatory information will be added before commercial operation.",
        ],
      },
      {
        title: "Liability for content",
        body: [
          "Routes, prices, tolls and costs are calculated automatically from public data sources and are indicative only. No guarantee is given for their accuracy, completeness or timeliness.",
        ],
      },
    ],
  },
  privacy: {
    title: "Privacy notice",
    updated: "As of October 2026",
    sections: [
      {
        title: "Controller",
        body: ["NorbApp, e-mail: norbert@norbapp.com. For any privacy question, write to this address."],
      },
      {
        title: "Hosting and server logs",
        body: [
          "The app and the FUEL-API run on Render (Render Services, Inc.) on servers in Frankfurt am Main, Germany. When you open the app, the hosting provider processes technically necessary access data (IP address, time, requested URL, browser information, status codes) to deliver the site and keep it secure (Art. 6(1)(f) GDPR).",
        ],
      },
      {
        title: "Calculating a trip",
        body: [
          "To calculate a trip, the addresses or coordinates you enter, your vehicle data and settings are sent to our server. The server forwards only what each service needs, without your IP address: addresses to Photon (komoot) for the address search, coordinates to the OSRM and Valhalla routing servers of FOSSGIS e.V., and the coordinates of the refuelling points to the NorbApp FUEL-API, which queries the official station price services.",
          "We do not save your trips. The access logs of our services may keep request addresses (for example the coordinates of refuelling points, without your IP address) for a limited time at the hosting provider. To protect the services from abuse, your IP address is kept in memory for a few minutes for rate limiting and is then discarded. Legal basis: Art. 6(1)(b) GDPR (providing the requested calculation) and Art. 6(1)(f) GDPR (security).",
        ],
      },
      {
        title: "Your location",
        body: [
          "Your location is read only when you press “My location” and your browser allows it. The coordinates are used to fill in the start and, to show an address, are sent via our server to Photon.",
        ],
      },
      {
        title: "Settings in your browser",
        body: [
          "Your settings (language, fuel and vehicle data, currency, emission class, toll-avoidance choices, the random device identifier) are stored in your browser's local storage so they are there next time. They never leave your device, except the device identifier when you send a price report. A service worker keeps a copy of the page so it opens offline. You can delete both at any time in your browser settings.",
        ],
      },
      {
        title: "Anonymous usage statistics",
        body: [
          "To see which features are used and to fix problems, the app records anonymous usage events: for example a page view (page, language, installed app or browser, the referring website), a calculation (countries of the route, distance, fuel type, currency, options used, number of stops) or a click on a navigation app. Device type, operating system and browser are derived from the browser identification, which itself is not stored. No cookies are used, and no IP addresses or typed addresses are stored. Unique visitors are counted with a code that changes every day (a keyed hash of IP address, browser and date), so a visitor cannot be followed from one day to the next. The events are deleted after 13 months. Legal basis: Art. 6(1)(f) GDPR (improving and running the service).",
        ],
      },
      {
        title: "Price reports",
        body: [
          "Where only an average price exists, you can report the price at a station. We store the station, the fuel, the price, the time, a random device identifier created in your browser (no account, no name) and a keyed hash of your IP address, so that one person cannot confirm their own report. The IP address itself is not stored. Raw reports are deleted after 90 days; confirmed prices are kept without the identifiers. Legal basis: Art. 6(1)(f) GDPR (reliable prices for all users).",
        ],
      },
      {
        title: "Advertising (Google AdSense)",
        adsOnly: true,
        body: [
          "This app shows ads through Google AdSense, a service of Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Ireland. Google uses cookies and similar technologies to show ads, measure them and prevent fraud.",
          "In the EEA, the United Kingdom and Switzerland we ask for your consent first, using Google's certified consent message. Personalised ads are shown only with your consent (Art. 6(1)(a) GDPR, § 25(1) TDDDG); without it Google may show non-personalised ads that use cookies only for frequency capping, measurement and fraud prevention, as far as permitted. You can change or withdraw your choice at any time via “Privacy settings” at the bottom of the page.",
          "Data may be transferred to Google LLC in the USA; Google is certified under the EU-US Data Privacy Framework. More: policies.google.com/technologies/ads.",
        ],
      },
      {
        title: "Your rights",
        body: [
          "You have the right of access, rectification, erasure, restriction of processing, data portability and objection, and you can withdraw consent at any time with effect for the future. You may also lodge a complaint with a data protection supervisory authority.",
        ],
      },
    ],
  },
  sources: SOURCES_EN,
};

const DE: LegalTexts = {
  onlyIn: "Diese Seite gibt es auf Deutsch, Englisch und Ungarisch.",
  imprint: {
    title: "Impressum",
    updated: "",
    sections: [
      { title: "Anbieter", body: ["NorbApp", "E-Mail: norbert@norbapp.com", "Telegram: @norbapp (t.me/norbapp)"] },
      {
        title: "Hinweis",
        body: [
          "Diese Seite enthält aktuell nur die vom Betreiber freigegebenen Kontaktinformationen. Weitere Pflichtangaben werden vor einem kommerziellen Betrieb ergänzt.",
        ],
      },
      {
        title: "Haftung für Inhalte",
        body: [
          "Routen, Preise, Mautgebühren und Kosten werden automatisch aus öffentlichen Datenquellen berechnet und sind unverbindlich. Für Richtigkeit, Vollständigkeit und Aktualität wird keine Gewähr übernommen.",
        ],
      },
    ],
  },
  privacy: {
    title: "Datenschutzerklärung",
    updated: "Stand: Oktober 2026",
    sections: [
      {
        title: "Verantwortlicher",
        body: ["NorbApp, E-Mail: norbert@norbapp.com. Bei Fragen zum Datenschutz schreib an diese Adresse."],
      },
      {
        title: "Hosting und Serverlogs",
        body: [
          "Die App und die FUEL-API laufen bei Render (Render Services, Inc.) auf Servern in Frankfurt am Main. Beim Aufruf verarbeitet der Hoster technisch notwendige Zugriffsdaten (IP-Adresse, Zeitpunkt, angefragte URL, Browserinformationen, Statuscodes), um die Seite auszuliefern und abzusichern (Art. 6 Abs. 1 lit. f DSGVO).",
        ],
      },
      {
        title: "Berechnung einer Fahrt",
        body: [
          "Für die Berechnung werden die eingegebenen Adressen oder Koordinaten, die Fahrzeugdaten und Einstellungen an unseren Server gesendet. Der Server gibt nur das jeweils Nötige weiter, ohne deine IP-Adresse: Adressen an Photon (komoot) für die Adresssuche, Koordinaten an die Routing-Server OSRM und Valhalla der FOSSGIS e. V. und die Koordinaten der Tankpunkte an die NorbApp FUEL-API, die die offiziellen Tankstellenpreisdienste abfragt.",
          "Fahrten werden nicht gespeichert. In den Zugriffsprotokollen unserer Dienste können Anfrageadressen (etwa die Koordinaten der Tankpunkte, ohne deine IP-Adresse) beim Hoster für begrenzte Zeit erhalten bleiben. Zum Schutz vor Missbrauch wird deine IP-Adresse für einige Minuten im Arbeitsspeicher zur Begrenzung der Anfragen gehalten und dann verworfen. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (gewünschte Berechnung) und Art. 6 Abs. 1 lit. f DSGVO (Sicherheit).",
        ],
      },
      {
        title: "Standort",
        body: [
          "Dein Standort wird nur gelesen, wenn du „Mein Standort“ antippst und dein Browser es erlaubt. Die Koordinaten dienen als Start und werden zur Anzeige einer Adresse über unseren Server an Photon gesendet.",
        ],
      },
      {
        title: "Einstellungen im Browser",
        body: [
          "Deine Einstellungen (Sprache, Kraftstoff- und Fahrzeugdaten, Währung, Abgasnorm, Mautvermeidung, die zufällige Gerätekennung) werden im lokalen Speicher deines Browsers abgelegt, damit sie beim nächsten Mal da sind. Sie verlassen dein Gerät nicht – außer der Gerätekennung, wenn du einen Preis meldest. Ein Service Worker hält eine Kopie der Seite, damit sie offline startet. Beides kannst du jederzeit in den Browsereinstellungen löschen.",
        ],
      },
      {
        title: "Anonyme Nutzungsstatistik",
        body: [
          "Um zu sehen, welche Funktionen genutzt werden, und um Fehler zu beheben, erfasst die App anonyme Nutzungsereignisse: zum Beispiel einen Seitenaufruf (Seite, Sprache, installierte App oder Browser, verweisende Website), eine Berechnung (Länder der Route, Entfernung, Kraftstoff, Währung, genutzte Optionen, Zahl der Tankstopps) oder einen Klick auf eine Navigations-App. Gerätetyp, Betriebssystem und Browser werden aus der Browserkennung abgeleitet, die selbst nicht gespeichert wird. Es werden keine Cookies verwendet und keine IP-Adressen oder eingegebenen Adressen gespeichert. Eindeutige Besucher werden über einen täglich wechselnden Code gezählt (ein verschlüsselter Hashwert aus IP-Adresse, Browser und Datum), sodass ein Besucher nicht über mehrere Tage verfolgt werden kann. Die Ereignisse werden nach 13 Monaten gelöscht. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (Betrieb und Verbesserung des Dienstes).",
        ],
      },
      {
        title: "Preismeldungen",
        body: [
          "Wo es nur einen Durchschnittspreis gibt, kannst du den Preis an einer Tankstelle melden. Gespeichert werden Tankstelle, Kraftstoff, Preis, Zeitpunkt, eine zufällige Gerätekennung aus deinem Browser (kein Konto, kein Name) und ein verschlüsselter Hashwert deiner IP-Adresse, damit niemand seine eigene Meldung bestätigen kann. Die IP-Adresse selbst wird nicht gespeichert. Einzelmeldungen werden nach 90 Tagen gelöscht; bestätigte Preise bleiben ohne Kennungen erhalten. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (verlässliche Preise für alle Nutzer).",
        ],
      },
      {
        title: "Werbung (Google AdSense)",
        adsOnly: true,
        body: [
          "Diese App zeigt Anzeigen über Google AdSense, einen Dienst der Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland. Google verwendet Cookies und ähnliche Technologien, um Anzeigen auszuliefern, zu messen und Betrug zu verhindern.",
          "Im EWR, im Vereinigten Königreich und in der Schweiz fragen wir zuerst über die zertifizierte Einwilligungsmeldung von Google nach deiner Einwilligung. Personalisierte Anzeigen gibt es nur mit Einwilligung (Art. 6 Abs. 1 lit. a DSGVO, § 25 Abs. 1 TDDDG); ohne sie kann Google, soweit zulässig, nicht personalisierte Anzeigen zeigen, die Cookies nur für Frequenzbegrenzung, Messung und Betrugsabwehr nutzen. Deine Auswahl kannst du jederzeit über „Datenschutz-Einstellungen“ unten auf der Seite ändern oder widerrufen.",
          "Daten können an die Google LLC in den USA übermittelt werden; Google ist unter dem EU-US Data Privacy Framework zertifiziert. Mehr: policies.google.com/technologies/ads.",
        ],
      },
      {
        title: "Deine Rechte",
        body: [
          "Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch und kannst Einwilligungen jederzeit mit Wirkung für die Zukunft widerrufen. Außerdem kannst du dich bei einer Datenschutzaufsichtsbehörde beschweren.",
        ],
      },
    ],
  },
  sources: {
    title: "Quellen und Lizenzen",
    updated: "",
    sections: [
      {
        title: "Karten und Routen",
        body: [
          "Kartendaten © OpenStreetMap-Mitwirkende, verfügbar unter der Open Database Licence (ODbL) – openstreetmap.org/copyright.",
          "Routing: OSRM- und Valhalla-Server der FOSSGIS e. V. (routing.openstreetmap.de, valhalla1.openstreetmap.de). Adresssuche: Photon von komoot (photon.komoot.io).",
        ],
      },
      {
        title: "Kraftstoffpreise",
        body: [
          "Tankstellenstandorte in Ländern mit Durchschnittspreisen: OpenStreetMap (Overpass API). Von Nutzern gemeldete Preise: Nutzer von Fuel by NorbApp. Tankstellenpreise: Deutschland – Tankerkönig / MTS-K (CC BY 4.0); Österreich – E-Control Spritpreisrechner; Spanien, Frankreich, Italien, Portugal und Slowenien – die offiziellen offenen Preisdaten dieser Länder.",
          "Landesdurchschnitte und Schätzungen: Weekly Oil Bulletin der Europäischen Kommission. Schweiz: TCS-Benzinpreis-Radar als Anker, täglich mit den Nachbarländern fortgeschrieben. Westbalkan und Türkei: Diese Länder veröffentlichen keinen offiziellen Durchschnittspreis (Serbien, Montenegro, Nordmazedonien und Kosovo geben nur regulierte Höchstpreise bekannt, in der Türkei und in Bosnien und Herzegowina sind die Preise frei), daher geschätzt aus dem nationalen Preisniveau im Verhältnis zu den benachbarten EU-Ländern, täglich mit ihnen fortgeschrieben. Wechselkurse: Europäische Zentralbank.",
          "Alle Preise sind Richtwerte; maßgeblich ist der Preis an der Zapfsäule.",
        ],
      },
      {
        title: "Maut und Vignetten",
        body: [
          "Vignetten- und Mauttarife stammen von den offiziellen nationalen Betreibern und werden regelmäßig geprüft. Streckenmaut (und alle Mautgebühren auf dem Westbalkan und in der Türkei) ist geschätzt.",
        ],
      },
      {
        title: "Software",
        body: ["Fuel by NorbApp basiert auf Next.js, React und FastAPI. Preis- und Mautdaten liefert die NorbApp FUEL-API."],
      },
    ],
  },
};

const HU: LegalTexts = {
  onlyIn: "Ez az oldal magyarul, németül és angolul érhető el.",
  imprint: {
    title: "Impresszum",
    updated: "",
    sections: [
      { title: "Szolgáltató", body: ["NorbApp", "E-mail: norbert@norbapp.com", "Telegram: @norbapp (t.me/norbapp)"] },
      {
        title: "Megjegyzés",
        body: [
          "Ez az oldal jelenleg csak az üzemeltető által jóváhagyott elérhetőségeket tartalmazza. A további kötelező adatok a kereskedelmi működés előtt kerülnek fel.",
        ],
      },
      {
        title: "Felelősség a tartalomért",
        body: [
          "Az útvonalakat, árakat, útdíjakat és költségeket nyilvános adatforrásokból automatikusan számoljuk, ezek tájékoztató jellegűek. Pontosságukért, teljességükért és naprakészségükért nem vállalunk felelősséget.",
        ],
      },
    ],
  },
  privacy: {
    title: "Adatvédelmi tájékoztató",
    updated: "Hatályos: 2026. október",
    sections: [
      {
        title: "Adatkezelő",
        body: ["NorbApp, e-mail: norbert@norbapp.com. Adatvédelmi kérdéssel erre a címre írj."],
      },
      {
        title: "Tárhely és szervernaplók",
        body: [
          "Az alkalmazás és a FUEL-API a Rendernél (Render Services, Inc.) fut, frankfurti szervereken. Az oldal megnyitásakor a tárhelyszolgáltató technikailag szükséges hozzáférési adatokat kezel (IP-cím, időpont, kért URL, böngészőadatok, állapotkódok) az oldal kiszolgálásához és védelméhez (GDPR 6. cikk (1) f) pont).",
        ],
      },
      {
        title: "Útvonal kiszámítása",
        body: [
          "A számításhoz a megadott címek vagy koordináták, a járműadatok és a beállítások a szerverünkre kerülnek. A szerver csak a szükséges adatot továbbítja, az IP-címed nélkül: a címeket a Photonnak (komoot) a címkereséshez, a koordinátákat a FOSSGIS e. V. OSRM és Valhalla útvonaltervező szervereinek, a tankolási pontok koordinátáit pedig a NorbApp FUEL-API-nak, amely a hivatalos kútár-szolgáltatásokat kérdezi le.",
          "Az utakat nem mentjük el. Szolgáltatásaink hozzáférési naplóiban a kérések címe (például a tankolási pontok koordinátái, az IP-címed nélkül) a tárhelyszolgáltatónál korlátozott ideig megmaradhat. A visszaélések elleni védelemhez az IP-címedet néhány percig a memóriában tartjuk a kérések korlátozására, utána eldobjuk. Jogalap: GDPR 6. cikk (1) b) pont (a kért számítás) és f) pont (biztonság).",
        ],
      },
      {
        title: "Helymeghatározás",
        body: [
          "A helyzetedet csak akkor olvassuk ki, ha a „Saját pozíció” gombra koppintasz, és a böngésző engedélyezi. A koordináták az indulási pontot adják, a cím megjelenítéséhez a szerverünkön keresztül a Photonhoz kerülnek.",
        ],
      },
      {
        title: "Beállítások a böngészőben",
        body: [
          "A beállításaidat (nyelv, üzemanyag- és járműadatok, pénznem, Euro-besorolás, útdíjkerülés, a véletlen eszközazonosító) a böngésződ helyi tárolója őrzi, hogy legközelebb is meglegyenek. Nem hagyják el az eszközödet, kivéve az eszközazonosítót, ha árat jelzel. Egy service worker tárolja az oldal másolatát, hogy offline is elinduljon. Mindkettőt bármikor törölheted a böngésző beállításaiban.",
        ],
      },
      {
        title: "Névtelen használati statisztika",
        body: [
          "Hogy lássuk, mely funkciókat használják, és hogy javíthassuk a hibákat, az alkalmazás névtelen használati eseményeket rögzít: például oldalmegtekintést (oldal, nyelv, telepített app vagy böngésző, a hivatkozó weboldal), kalkulációt (az útvonal országai, a táv, az üzemanyag, a pénznem, a használt beállítások, a tankolások száma) vagy kattintást egy navigációs appra. Az eszköz típusát, az operációs rendszert és a böngészőt a böngésző azonosítójából állapítjuk meg, magát az azonosítót nem tároljuk. Nem használunk sütit, és nem tárolunk IP-címet vagy beírt címet. Az egyedi látogatókat egy naponta változó kóddal számoljuk (az IP-cím, a böngésző és a dátum kulcsolt hash-e), így egy látogató napról napra nem követhető. Az eseményeket 13 hónap után töröljük. Jogalap: GDPR 6. cikk (1) f) pont (a szolgáltatás működtetése és fejlesztése).",
        ],
      },
      {
        title: "Ár-visszajelzések",
        body: [
          "Ahol csak átlagár érhető el, jelezheted egy kút árát. Ilyenkor a kutat, az üzemanyagot, az árat, az időpontot, egy a böngésződben létrehozott véletlen eszközazonosítót (nincs fiók, nincs név) és az IP-címed kulcsolt hash-ét tároljuk, hogy senki ne erősíthesse meg a saját jelzését. Magát az IP-címet nem tároljuk. Az egyes jelzéseket 90 nap után töröljük, a megerősített árak azonosítók nélkül maradnak meg. Jogalap: GDPR 6. cikk (1) f) pont (megbízható árak minden felhasználónak).",
        ],
      },
      {
        title: "Hirdetések (Google AdSense)",
        adsOnly: true,
        body: [
          "Az alkalmazás a Google AdSense-en keresztül jelenít meg hirdetéseket; a szolgáltató a Google Ireland Limited (Gordon House, Barrow Street, Dublin 4, Írország). A Google sütiket és hasonló technológiákat használ a hirdetések megjelenítéséhez, méréséhez és a csalások kiszűréséhez.",
          "Az EGT-ben, az Egyesült Királyságban és Svájcban előbb a Google tanúsított hozzájárulási üzenetével kérjük a hozzájárulásodat. Személyre szabott hirdetés csak hozzájárulással jelenik meg (GDPR 6. cikk (1) a) pont); enélkül a Google – amennyiben megengedett – nem személyre szabott hirdetéseket mutathat, amelyek sütiket csak a megjelenítési gyakoriság korlátozására, mérésre és csalásszűrésre használnak. A döntésedet bármikor módosíthatod vagy visszavonhatod az oldal alján az „Adatvédelmi beállítások” linkkel.",
          "Adatok a Google LLC-hez, az Egyesült Államokba is kerülhetnek; a Google az EU–USA adatvédelmi keretrendszer alapján tanúsított. Bővebben: policies.google.com/technologies/ads.",
        ],
      },
      {
        title: "Jogaid",
        body: [
          "Jogod van hozzáférést, helyesbítést, törlést, az adatkezelés korlátozását és adathordozhatóságot kérni, valamint tiltakozni; a hozzájárulásodat bármikor visszavonhatod a jövőre nézve. Panaszt tehetsz adatvédelmi felügyeleti hatóságnál is (Magyarországon: NAIH).",
        ],
      },
    ],
  },
  sources: {
    title: "Források és licencek",
    updated: "",
    sections: [
      {
        title: "Térkép és útvonal",
        body: [
          "Térképadatok © OpenStreetMap közreműködők, Open Database Licence (ODbL) alatt – openstreetmap.org/copyright.",
          "Útvonaltervezés: a FOSSGIS e. V. OSRM és Valhalla szerverei (routing.openstreetmap.de, valhalla1.openstreetmap.de). Címkeresés: Photon, komoot (photon.komoot.io).",
        ],
      },
      {
        title: "Üzemanyagárak",
        body: [
          "A kutak helye az átlagáras országokban: OpenStreetMap (Overpass API). Felhasználói árak: a Fuel by NorbApp felhasználói. Kútárak: Németország – Tankerkönig / MTS-K (CC BY 4.0); Ausztria – E-Control Spritpreisrechner; Spanyolország, Franciaország, Olaszország, Portugália és Szlovénia – az adott ország hivatalos, nyílt áradatai.",
          "Országos átlagok és becslések: az Európai Bizottság Weekly Oil Bulletinje. Svájc: a TCS árradarja mint kiindulópont, naponta a szomszédos országokkal együtt mozgatva. Nyugat-Balkán és Törökország: ezek az országok nem közölnek hivatalos átlagárat (Szerbia, Montenegró, Észak-Macedónia és Koszovó csak hatósági maximált árat hirdet, Törökországban és Bosznia-Hercegovinában szabad az árképzés), ezért becsüljük: az országos árszint a szomszédos EU-országokhoz viszonyítva, naponta velük együtt mozgatva. Árfolyamok: Európai Központi Bank.",
          "Minden ár tájékoztató jellegű; a kútnál kiírt ár az irányadó.",
        ],
      },
      {
        title: "Útdíjak és matricák",
        body: [
          "A matrica- és útdíjtarifák a hivatalos nemzeti üzemeltetőktől származnak, rendszeresen ellenőrizzük őket. A szakaszalapú díjak (és a Nyugat-Balkán, valamint Törökország útdíjai) becslések.",
        ],
      },
      {
        title: "Szoftver",
        body: ["A Fuel by NorbApp Next.js, React és FastAPI alapokon készült. Az ár- és útdíjadatokat a NorbApp FUEL-API szolgáltatja."],
      },
    ],
  },
};

const TEXTS: Partial<Record<Locale, LegalTexts>> = { en: EN, de: DE, hu: HU };

/** Legal texts for the locale, plus whether they are a fallback (English). */
export function legalTexts(locale: Locale): { texts: LegalTexts; fallback: boolean } {
  const texts = TEXTS[locale];
  return texts ? { texts, fallback: false } : { texts: EN, fallback: true };
}
