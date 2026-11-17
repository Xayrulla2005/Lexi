import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AiAnalysisService } from "../ai-analysis/ai-analysis.service";
import { CasesService } from "../cases/cases.service";
import { REPO_ROOT } from "../common/paths";
import { LegalRoutingService } from "../legal-routing/legal-routing.service";
import { OneIdSimulatorService } from "../sim/oneid.service";
import { ApplicationsService } from "./applications.service";

async function setup() {
  const cases = new CasesService(new AiAnalysisService(), new LegalRoutingService());
  const apps = new ApplicationsService(cases);
  const citizen = new OneIdSimulatorService().citizen("test_fuqaro_1");
  const c = cases.create("web", null);
  cases.addMessage(c.id, "3 oydan beri oylik berishmayapti");
  await cases.analyze(c.id);
  return { cases, apps, citizen, caseId: c.id };
}

const MANUAL = { malumot_1: "Hisobchi", malumot_2: "“Namuna” MChJ", malumot_3: "sentabr", summa: "5 000 000" };

describe("ApplicationsService", () => {
  it("builds the P12 application from T12 and fills OneID/system fields only", async () => {
    const { apps, citizen, caseId } = await setup();
    const app = apps.createForCase(caseId, citizen);
    expect(app.templateId).toBe("T12");
    expect(app.agency.id).toBe("mehnat_inspeksiyasi");
    const byKey = Object.fromEntries(app.fields.map((f) => [f.key, f]));
    expect(byKey.fio).toMatchObject({ value: citizen.fio, source: "ONEID" });
    expect(byKey.ariza_sanasi?.source).toBe("SYSTEM");
    expect(app.missingFields).toEqual(["malumot_1", "malumot_2", "malumot_3", "summa"]);
  });

  it("keeps the template text unchanged (only the leading comment is dropped)", async () => {
    const { apps, citizen, caseId } = await setup();
    const app = apps.createForCase(caseId, citizen);
    const file = readFileSync(join(REPO_ROOT, "legal-knowledge/templates/T12.md"), "utf8").replace(/\r\n/g, "\n");
    expect(file.endsWith(app.template)).toBe(true);
    expect(apps.text(app)).toContain("ish haqim o‘z vaqtida to‘lanmadi");
  });

  it("requires every field before consent and resets consent when a field changes", async () => {
    const { apps, citizen, caseId } = await setup();
    const app = apps.createForCase(caseId, citizen);
    expect(() => apps.consent(app.id, citizen.id)).toThrow(BadRequestException);
    apps.updateFields(app.id, citizen.id, MANUAL);
    const consented = apps.consent(app.id, citizen.id);
    expect(consented.consentAt).not.toBeNull();
    const changed = apps.updateFields(app.id, citizen.id, { summa: "6 000 000" });
    expect(changed.consentAt).toBeNull();
  });

  it("does not let the user overwrite OneID fields or touch another citizen's application", async () => {
    const { apps, citizen, caseId } = await setup();
    const app = apps.createForCase(caseId, citizen);
    expect(() => apps.updateFields(app.id, citizen.id, { fio: "Boshqa" })).toThrow(BadRequestException);
    expect(() => apps.updateFields(app.id, "test_fuqaro_2", { summa: "1" })).toThrow(ForbiddenException);
  });

  it("renders a PDF with an embedded Unicode font", async () => {
    const { apps, citizen, caseId } = await setup();
    const app = apps.updateFields(apps.createForCase(caseId, citizen).id, citizen.id, MANUAL);
    const pdf = await apps.pdf(app.id);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1")).toContain("DejaVuSans");
  });

  it("locks the application after signing", async () => {
    const { apps, citizen, caseId } = await setup();
    const app = apps.updateFields(apps.createForCase(caseId, citizen).id, citizen.id, MANUAL);
    apps.attachSignature(app.id, Buffer.from("%PDF-test"), {
      simulated: true,
      algorithm: "Ed25519",
      hashAlgorithm: "SHA-256",
      digest: "0".repeat(64),
      signature: "AA==",
      publicKey: "test",
      signerCitizenId: citizen.id,
      signedAt: new Date().toISOString(),
    });
    expect(() => apps.updateFields(app.id, citizen.id, { summa: "1" })).toThrow(ConflictException);
    expect((await apps.pdf(app.id)).toString()).toBe("%PDF-test");
  });
});
