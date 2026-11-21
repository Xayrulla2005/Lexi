/**
 * Phase 5: application documents — upload validation, ownership, lifecycle (consent reset,
 * frozen after signing), secure download, integrity, audit without content.
 */
import "reflect-metadata";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types";
import type { ApplicationDocuments, AuditEvent } from "@lex/contracts";
import { AppModule } from "../../apps/api/src/app.module";
import { hardenHttp } from "../../apps/api/src/common/http-hardening";
import { relaxRateLimits } from "./test-env";

const H = "x-sim-session";
const MANUAL = { malumot_1: "Hisobchi", malumot_2: "Namuna MChJ", malumot_3: "sentabr", summa: "5 000 000" };
const KEYS = ["SIM_MODE", "RUNTIME_DIR", "SIM_KEYS_DIR", "DATABASE_URL"] as const;

const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << >>\n%%EOF\n", "latin1");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const EXE = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(64, 0)]);
const PDF_JS = Buffer.from("%PDF-1.4\n1 0 obj << /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >> endobj\n%%EOF", "latin1");

describe("Application documents (Phase 5)", () => {
  let app: INestApplication<App>;
  let runtimeDir: string;
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    for (const k of KEYS) delete process.env[k];
    relaxRateLimits();
    runtimeDir = mkdtempSync(join(tmpdir(), "lex-runtime-"));
    Object.assign(process.env, { SIM_MODE: "true", RUNTIME_DIR: runtimeDir, SIM_KEYS_DIR: mkdtempSync(join(tmpdir(), "lex-keys-")) });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const nest = moduleRef.createNestApplication<NestExpressApplication>();
    hardenHttp(nest);
    await nest.init();
    app = nest as unknown as INestApplication<App>;
  });
  afterAll(async () => {
    await app.close();
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  async function draft(citizen = "test_fuqaro_1") {
    const { body: session } = await http().post("/sim/oneid/login").send({ citizenId: citizen }).expect(201);
    const token: string = session.token;
    const { body: c } = await http().post("/cases").set(H, token).send({ channel: "web" }).expect(201);
    await http().post(`/cases/${c.id}/messages`).set(H, token).send({ text: "3 oydan beri oylik berishmayapti" }).expect(201);
    await http().post(`/cases/${c.id}/analyze`).set(H, token).expect(200);
    const { body: a } = await http().post(`/cases/${c.id}/application`).set(H, token).expect(201);
    await http().patch(`/applications/${a.id}/fields`).set(H, token).send({ values: MANUAL }).expect(200);
    return { token, appId: a.id as string };
  }
  const upload = (token: string | null, appId: string, bytes: Buffer, type: string, extra: Record<string, string> = {}) => {
    let r = http().post(`/applications/${appId}/documents`).set("content-type", type).set(extra);
    if (token) r = r.set(H, token);
    return r.send(bytes);
  };

  it("valid PDF and PNG uploads; checklist status; secure download", async () => {
    const { token, appId } = await draft();
    const { body: before } = (await http().get(`/applications/${appId}/documents`).set(H, token).expect(200)) as { body: ApplicationDocuments };
    expect(before.documents).toEqual([]);
    const label = before.checklist[0]?.label;
    expect(label).toBeTruthy();
    expect(before.missing).toContain(label);

    const name = encodeURIComponent("../../mehnat shartnomasi.pdf");
    const { body: doc } = await upload(token, appId, PDF, "application/pdf", { "x-file-name": name, "x-checklist-item": encodeURIComponent(label as string) }).expect(201);
    expect(doc).toMatchObject({ contentType: "application/pdf", sizeBytes: PDF.length, fileName: "mehnat shartnomasi.pdf", checklistItem: label });
    await upload(token, appId, PNG, "image/png").expect(201);

    const { body: after } = (await http().get(`/applications/${appId}/documents`).set(H, token).expect(200)) as { body: ApplicationDocuments };
    expect(after.documents).toHaveLength(2);
    expect(after.missing).not.toContain(label);

    const dl = await http().get(`/applications/${appId}/documents/${doc.id}`).set(H, token).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(Buffer.compare(dl.body as Buffer, PDF)).toBe(0);
    expect(dl.headers["content-type"]).toContain("application/pdf");
    expect(dl.headers["content-disposition"]).toMatch(/^attachment;/);
    expect(dl.headers["cache-control"]).toBe("no-store");
    expect(dl.headers["x-content-type-options"]).toBe("nosniff");

    // Stored outside any public folder, under an id-based name (not the client's name).
    const stored = readdirSync(join(runtimeDir, "documents", appId));
    expect(stored).toContain(`${doc.id}.bin`);
    expect(stored.join(",")).not.toContain("mehnat");
  });

  it("invalid types are rejected (415); the bytes decide, not the name or MIME type", async () => {
    const { token, appId } = await draft();
    await upload(token, appId, EXE, "application/pdf", { "x-file-name": "ariza.pdf" }).expect(415); // EXE renamed to .pdf
    await upload(token, appId, PNG, "application/pdf").expect(415); // PNG declared as PDF
    await upload(token, appId, Buffer.from("hello"), "text/plain").expect(415);
    await upload(token, appId, Buffer.from("<svg onload=alert(1)>"), "image/svg+xml").expect(415);
    await http().post(`/applications/${appId}/documents`).set(H, token).send({ file: "x" }).expect(415); // JSON body
    await upload(token, appId, PDF_JS, "application/pdf").expect(422); // active content
    await upload(token, appId, PDF, "application/pdf", { "x-checklist-item": "Begona hujjat" }).expect(400);
    await upload(token, appId, Buffer.alloc(0), "application/pdf").expect(400);
  });

  it("oversized file -> 413", async () => {
    const { token, appId } = await draft();
    const big = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024, 0x20)]);
    await upload(token, appId, big, "application/pdf").expect(413);
  });

  it("no session -> 401; another citizen -> 403 everywhere; a foreign document id -> 404", async () => {
    const a = await draft("test_fuqaro_1");
    const { body: doc } = await upload(a.token, a.appId, PDF, "application/pdf").expect(201);
    await upload(null, a.appId, PDF, "application/pdf").expect(401);
    await http().get(`/applications/${a.appId}/documents`).expect(401);
    await http().get(`/applications/${a.appId}/documents/${doc.id}`).expect(401);

    const b = await draft("test_fuqaro_2");
    await http().get(`/applications/${a.appId}/documents`).set(H, b.token).expect(403);
    await http().get(`/applications/${a.appId}/documents/${doc.id}`).set(H, b.token).expect(403);
    await http().delete(`/applications/${a.appId}/documents/${doc.id}`).set(H, b.token).expect(403);
    await upload(b.token, a.appId, PDF, "application/pdf").expect(403);
    // B's own application with A's document id: not found (no cross-application access).
    await http().get(`/applications/${b.appId}/documents/${doc.id}`).set(H, b.token).expect(404);
  });

  it("a document change withdraws consent; after signing documents are frozen (409)", async () => {
    const { token, appId } = await draft();
    await http().post(`/applications/${appId}/consent`).set(H, token).send({ consent: true }).expect(201);
    const { body: doc } = await upload(token, appId, PDF, "application/pdf").expect(201);
    const { body: reset } = await http().get(`/applications/${appId}`).set(H, token).expect(200);
    expect(reset.state).toBe("DRAFT");
    expect(reset.consentAt).toBeNull();

    await http().post(`/applications/${appId}/consent`).set(H, token).send({ consent: true }).expect(201);
    await http().post(`/applications/${appId}/sign`).set(H, token).expect(201);
    await upload(token, appId, PNG, "image/png").expect(409);
    await http().delete(`/applications/${appId}/documents/${doc.id}`).set(H, token).expect(409);
    await http().get(`/applications/${appId}/documents/${doc.id}`).set(H, token).expect(200); // still readable

    // The package carries the documents' metadata; the audit has no file names or content.
    const { body: sub } = await http().post("/submissions").set(H, token).send({ applicationId: appId, consent: true }).expect(201);
    expect(sub.status).toBe("SUBMITTED");
    const { body: events } = (await http().get(`/applications/${appId}/audit`).set(H, token).expect(200)) as { body: AuditEvent[] };
    expect(events.map((e) => e.type)).toEqual([
      "APPLICATION_CONSENTED",
      "APPLICATION_CONSENT_RESET",
      "DOCUMENT_ADDED",
      "APPLICATION_CONSENTED",
      "APPLICATION_SIGNED",
      "SUBMISSION_CREATED",
      "RECEIPT_ISSUED",
    ]);
    expect(events.find((e) => e.type === "APPLICATION_SIGNED")?.data.documents).toBe(1);
    expect(JSON.stringify(events)).not.toContain("%PDF");
  });

  it("a file changed on disk is refused at download and at submission (integrity)", async () => {
    const { token, appId } = await draft();
    const { body: doc } = await upload(token, appId, PDF, "application/pdf").expect(201);
    writeFileSync(join(runtimeDir, "documents", appId, `${doc.id}.bin`), Buffer.from("%PDF-tampered"));
    await http().get(`/applications/${appId}/documents/${doc.id}`).set(H, token).expect(500);
    await http().post(`/applications/${appId}/consent`).set(H, token).send({ consent: true }).expect(201);
    await http().post(`/applications/${appId}/sign`).set(H, token).expect(201);
    await http().post("/submissions").set(H, token).send({ applicationId: appId, consent: true }).expect(500);
    expect(readFileSync(join(runtimeDir, "documents.json"), "utf8")).toContain(doc.sha256);
  });

  it("owner can delete before signing; checklist updates", async () => {
    const { token, appId } = await draft();
    const { body: doc } = await upload(token, appId, PNG, "image/png").expect(201);
    await http().delete(`/applications/${appId}/documents/${doc.id}`).set(H, token).expect(204);
    const { body } = await http().get(`/applications/${appId}/documents`).set(H, token).expect(200);
    expect(body.documents).toEqual([]);
    await http().get(`/applications/${appId}/documents/${doc.id}`).set(H, token).expect(404);
  });
});
