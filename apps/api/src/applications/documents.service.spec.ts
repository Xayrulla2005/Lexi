import { safeFileName, sniffType } from "./documents.service";

describe("document validation helpers", () => {
  it("detects the type from the bytes only", () => {
    expect(sniffType(Buffer.from("%PDF-1.7 ..."))).toBe("application/pdf");
    expect(sniffType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(sniffType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe("image/jpeg");
    expect(sniffType(Buffer.from("MZ\x90\x00"))).toBeNull();
    expect(sniffType(Buffer.from("<html>"))).toBeNull();
    expect(sniffType(Buffer.from(" %PDF-"))).toBeNull();
  });

  it("file names: no path, control or reserved characters; never empty", () => {
    expect(safeFileName("..%2F..%2Fetc%2Fpasswd")).toBe("passwd");
    expect(safeFileName("C:\\Users\\x\\ariza.pdf")).toBe("ariza.pdf");
    expect(safeFileName("a\u0000b<c>.pdf")).toBe("abc.pdf");
    expect(safeFileName("...")).toBe("hujjat");
    expect(safeFileName(undefined)).toBe("hujjat");
    expect(safeFileName("x".repeat(300))).toHaveLength(120);
    expect(safeFileName("%E2%80%9Cshartnoma%E2%80%9D.pdf")).toBe("“shartnoma”.pdf");
  });
});
