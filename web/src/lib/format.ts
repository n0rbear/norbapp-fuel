const eur = new Intl.NumberFormat("hu-HU", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
const num1 = new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 1 });
const num3 = new Intl.NumberFormat("hu-HU", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export const formatEur = (v: number) => eur.format(v);
export const formatKm = (v: number) => `${num1.format(v)} km`;
export const formatLitres = (v: number) => `${num1.format(v)} l`;
export const formatPricePerLitre = (v: number) => `${num3.format(v)} €/l`;

export function formatDuration(totalSec: number): string {
  const minutes = Math.round(totalSec / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} ó ${m} p` : `${m} p`;
}
