import { readdirSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../common/paths";
import { escalationTemplate, loadTemplate } from "./template";

const previous = { receiptId: "SIM-MI-00451", submittedOn: "17.11.2026", agencyName: "Davlat mehnat inspeksiyasi" };
const FACT =
  "Avvalgi murojaat: № SIM-MI-00451, 17.11.2026, Davlat mehnat inspeksiyasiga yuborilgan; belgilangan muddatda javob olinmadi.";

describe("escalationTemplate", () => {
  it("replaces only the Kimga line and adds the fact line right before the signature line", async () => {
    const original = await loadTemplate("T12");
    const target = "Kambag'allikni qisqartirish va bandlik vazirligi";
    const text = escalationTemplate(original, target, previous);

    const lines = text.split("\n");
    expect(lines[0]).toBe(`Kimga: ${target}`);
    const sig = lines.findIndex((l) => l.includes("Imzo:"));
    expect(lines[sig - 2]).toBe(FACT);
    expect(lines[sig - 1]).toBe("");

    // Everything else is the original template, unchanged.
    const restored = text.replace(`Kimga: ${target}`, original.split("\n")[0] as string).replace(`${FACT}\n\n`, "");
    expect(restored).toBe(original);
  });

  it("works for every template (one Kimga line, one signature line)", async () => {
    const ids = readdirSync(join(REPO_ROOT, "legal-knowledge/templates")).map((f) => f.replace(".md", ""));
    expect(ids).toHaveLength(65);
    for (const id of ids) {
      const text = escalationTemplate(await loadTemplate(id), "X idora", previous);
      expect(text.match(/^Kimga: X idora$/gm)).toHaveLength(1);
      expect(text.indexOf(FACT)).toBeLessThan(text.indexOf("Imzo:"));
    }
  });
});
