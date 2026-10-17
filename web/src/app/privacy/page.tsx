import type { Metadata } from "next";
import { LegalView } from "@/components/LegalView";

export const metadata: Metadata = { title: "Privacy – Fuel by NorbApp", alternates: { canonical: "/privacy" } };

export default function Page() {
  return <LegalView page="privacy" />;
}
