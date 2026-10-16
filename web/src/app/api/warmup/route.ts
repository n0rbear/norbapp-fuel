import { wakeUp } from "@/lib/server/fuel-api";
import { connection } from "next/server";

/** Called when the page opens, so the sleeping price service is awake by the time the user plans. */
export async function POST() {
  await connection();
  wakeUp();
  return new Response(null, { status: 204 });
}
