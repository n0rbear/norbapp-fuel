import type { Metadata } from "next";
import { LegalView } from "@/components/LegalView";

export const metadata: Metadata = { title: "Impressum – Fuel by NorbApp", alternates: { canonical: "/impressum" } };

export default function Page() {
  return <LegalView page="imprint" />;
}
