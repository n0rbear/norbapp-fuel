/** Writes a number the way users type it in the inputs ("1,7"). */
export function toInputDecimal(v: number, decimals: number): string {
  return String(Number(v.toFixed(decimals))).replace(".", ",");
}
