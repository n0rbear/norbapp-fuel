import type { Metadata } from "next";
import { AdvertiseView } from "@/components/AdvertiseView";

export const metadata: Metadata = { title: "Advertise – Fuel by NorbApp", alternates: { canonical: "/advertise" } };

export default function Page() {
  return <AdvertiseView />;
}
