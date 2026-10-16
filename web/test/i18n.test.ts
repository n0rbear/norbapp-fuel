import { describe, expect, it } from "vitest";
import { LOCALES, detectLocale } from "@/i18n/locales";
import { loadMessages } from "@/i18n/load";
import { hu } from "@/i18n/messages/hu";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("message catalogues", () => {
  it("covers all 24 official EU languages", () => {
    expect(LOCALES).toHaveLength(24);
  });

  it.each(LOCALES.map((l) => l.code))("%s has every key with the same placeholders", async (code) => {
    const messages = await loadMessages(code);
    for (const key of Object.keys(hu) as (keyof typeof hu)[]) {
      expect(messages[key], `${code}.${key}`).toBeTruthy();
      expect(placeholders(messages[key]), `${code}.${key}`).toEqual(placeholders(hu[key]));
    }
  });
});

describe("detectLocale", () => {
  it("picks the first supported browser language", () => {
    expect(detectLocale(["ja-JP", "de-AT", "en"])).toBe("de");
  });

  it("returns null when no language is supported", () => {
    expect(detectLocale(["ja", "zh"])).toBeNull();
  });
});
