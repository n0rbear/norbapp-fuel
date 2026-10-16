import { currencies } from "@/lib/server/fuel-api";
import { handleError } from "@/lib/server/respond";
import { connection } from "next/server";

export async function GET() {
  await connection();
  try {
    return Response.json(await currencies(), { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch (e) {
    return handleError("currencies", e);
  }
}
