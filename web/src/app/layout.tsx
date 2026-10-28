import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Analytics } from "@/components/Analytics";
import { InstallPrompt } from "@/components/InstallPrompt";
import { ServiceWorker } from "@/components/ServiceWorker";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { BannerStrip, SideBanner } from "@/components/SideBanner";
import { I18nProvider } from "@/i18n/I18nProvider";
import { ADS, ADS_ENABLED, SHOW_HOUSE_ADS } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://fuel.norbapp.com"),
  title: "Fuel by NorbApp – útiköltség-kalkulátor",
  description:
    "Tervezd meg az út üzemanyag- és útdíjköltségét: útvonal, tankolási pontok, kútárak és útdíjak 36 európai országra (EU, Svájc, Nyugat-Balkán, Törökország), választható pénznemben.",
  applicationName: "Fuel by NorbApp",
  appleWebApp: { capable: true, title: "Fuel", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f8f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1717" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="hu">
      <body>
        <I18nProvider>
          <SiteHeader />
          <div className="withSideBanners">
            {SHOW_HOUSE_ADS && <SideBanner side="left" />}
            <div className="mainColumn">{children}</div>
            {SHOW_HOUSE_ADS && <SideBanner side="right" />}
          </div>
          {SHOW_HOUSE_ADS && <BannerStrip />}
          <SiteFooter />
          <InstallPrompt />
          <Analytics />
        </I18nProvider>
        <ServiceWorker />
        {ADS_ENABLED ? (
          <Script
            id="adsbygoogle"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADS.client}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        ) : null}
      </body>
    </html>
  );
}
