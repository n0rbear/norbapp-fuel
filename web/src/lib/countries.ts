const names = new Intl.DisplayNames(["hu"], { type: "region" });

export function countryName(code: string): string {
  try {
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}
