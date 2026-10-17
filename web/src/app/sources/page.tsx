import type { Metadata } from "next";
import { LegalView } from "@/components/LegalView";

export const metadata: Metadata = { title: "Sources and licences – Fuel by NorbApp", alternates: { canonical: "/sources" } };

export default function Page() {
  return <LegalView page="sources" />;
}
