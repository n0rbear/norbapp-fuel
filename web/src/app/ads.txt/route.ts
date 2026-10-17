import { ADS, ADS_ENABLED } from "@/lib/site";

// Authorised digital sellers file required by AdSense; empty until ads are configured.
export function GET() {
  const body = ADS_ENABLED ? `google.com, ${ADS.client.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n` : "";
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
