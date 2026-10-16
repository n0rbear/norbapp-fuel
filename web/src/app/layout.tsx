import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://fuel.norbapp.com"),
  title: "NorbApp Fuel – útiköltség-kalkulátor",
  description:
    "Tervezd meg az út üzemanyag- és útdíjköltségét: útvonal, tankolási pontok, kútárak és útdíjak a 27 EU-országra és Svájcra, Liechtensteinre, Monacóra, választható pénznemben.",
  applicationName: "NorbApp Fuel",
  appleWebApp: { capable: true, title: "NorbApp Fuel", statusBarStyle: "default" },
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
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
