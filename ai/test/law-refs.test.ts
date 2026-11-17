import { describe, expect, it } from "vitest";
import { parseCitation } from "../rag/sources/law-refs";

describe("parseCitation", () => {
  it("single article with a note", () => {
    const p = parseCitation("Mehnat kodeksi 333-modda (kechiktirish uchun kompensatsiya)");
    expect(p.codeKey).toBe("mehnat_kodeksi");
    expect(p.articles.map((a) => a.display)).toEqual(["333"]);
    expect(p.note).toBe("(kechiktirish uchun kompensatsiya)");
  });

  it("lists, superscripts and ranges", () => {
    expect(parseCitation("Jinoyat kodeksi 168, 169, 278¹-moddalar").articles.map((a) => a.id)).toEqual(["168", "169", "278-1"]);
    expect(parseCitation("Ma'muriy javobgarlik to'g'risidagi kodeks 47⁴-modda").articles[0]).toMatchObject({
      id: "47-4",
      display: "47⁴",
      base: 47,
      index: 4,
    });
    expect(parseCitation("Oila kodeksi 23–28-moddalar").articles.map((a) => a.id)).toEqual(["23", "24", "25", "26", "27", "28"]);
  });

  it("citations without article numbers keep no articles", () => {
    const law = parseCitation("Iste'molchilarning huquqlarini himoya qilish to'g'risidagi qonun");
    expect(law.codeKey).toBeNull();
    expect(law.articles).toEqual([]);
    expect(law.document).toBe("Iste'molchilarning huquqlarini himoya qilish to'g'risidagi qonun");

    const vague = parseCitation("Oila kodeksi (ota-onalik huquqlari) — moddalar ⚠️");
    expect(vague.codeKey).toBe("oila_kodeksi");
    expect(vague.articles).toEqual([]);

    const section = parseCitation("Ma'muriy javobgarlik to'g'risidagi kodeks (yo'l harakati bo'limi)");
    expect(section.articles).toEqual([]);
  });
});
