import { describe, expect, it } from "vitest";
import { normalize, transliterate } from "../pipeline/normalize";

describe("transliterate (Cyrillic -> Latin, case preserved)", () => {
  it.each([
    ["Қайерга мурожаат қилай?", "Qayerga murojaat qilay?"],
    ["Уйимни таъмирлаш", "Uyimni ta'mirlash"],
    ["Ш", "Sh"],
    ["Ё", "Yo"],
    ["ШОВҚИН", "SHOVQIN"],
    ["Щётка", "Shchyotka"],
    ["ижара шартномаси", "ijara shartnomasi"],
  ] as const)("%s -> %s", (input, expected) => {
    expect(transliterate(input)).toBe(expected);
  });

  it("leaves Latin and punctuation unchanged", () => {
    expect(transliterate("Salom, dunyo! 123")).toBe("Salom, dunyo! 123");
  });
});

describe("normalize (keyword/BM25 form)", () => {
  it("transliterates, lowercases and collapses whitespace", () => {
    expect(normalize("  Уч   ОЙдан  ")).toBe("uch oydan");
  });

  it("unifies apostrophe variants", () => {
    expect(normalize("zo‘ravonlik")).toBe("zo'ravonlik");
  });
});
