import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  type OnModuleInit,
  PayloadTooLargeException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
  ApplicationDocument,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MAX_COUNT,
  type ApplicationDocuments,
  type DocumentContentType,
} from "@lex/contracts";
import { AuditService } from "../audit/audit.service";
import { JsonStore } from "../common/json-store";
import { runtimeFile } from "../common/paths";
import { withTimeout } from "../common/timeout";
import { ApplicationsService } from "./applications.service";
import { checklistOf } from "./template";

const sha256 = (b: Buffer | string): string => createHash("sha256").update(b).digest("hex");

/** The file's real type from its first bytes (magic numbers); null if not an allowed type. */
export function sniffType(bytes: Buffer): DocumentContentType | null {
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

/** PDF features that run code or carry hidden files: refused. */
const PDF_ACTIVE = /\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|XFA)\b/;

/** Display name: last path segment, no control or reserved characters, ≤ 120 chars. */
export function safeFileName(raw: string | undefined): string {
  let name = raw ?? "";
  try {
    name = decodeURIComponent(name);
  } catch {
    // Not URL-encoded: use as is.
  }
  name = name.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  name = name.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").replace(/^\.+/, "").trim().slice(0, 120);
  return name || "hujjat";
}

const decodeHeader = (raw: string | undefined): string | null => {
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).trim() || null;
  } catch {
    return raw.trim() || null;
  }
};

const StoredDocument = ApplicationDocument.extend({ citizenId: z.string() });
type StoredDocument = z.infer<typeof StoredDocument>;

const publicView = ({ citizenId: _owner, ...doc }: StoredDocument): ApplicationDocument => doc;

/**
 * Application documents. Files are stored under data/runtime/documents/<applicationId>/<id>.bin
 * (git-ignored, never served statically; RUNTIME_DIR overrides; memory-only in tests), metadata
 * in documents.json. Only the application's owner can add, read or remove them, and only
 * while the application is editable (DRAFT/CONSENTED); a change withdraws the consent.
 * After signing the set is frozen; every read re-checks the stored SHA-256.
 * File contents and names are never logged.
 */
@Injectable()
export class DocumentsService implements OnModuleInit {
  private readonly logger = new Logger(DocumentsService.name);
  private readonly meta = new JsonStore<StoredDocument>(runtimeFile("documents.json"), StoredDocument);
  private readonly dir = runtimeFile("documents");
  private readonly memory = new Map<string, Buffer>();

  constructor(
    @Inject(ApplicationsService) private readonly apps: ApplicationsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    this.apps.useDocumentsDigest((id) => {
      const docs = this.of(id);
      return { count: docs.length, sha256: sha256(docs.map((d) => d.sha256).sort().join(",")) };
    });
  }

  list(applicationId: string, citizenId: string): ApplicationDocuments {
    const app = this.apps.owned(applicationId, citizenId);
    const documents = this.of(applicationId).map(publicView);
    const checklist = checklistOf(app.template).map((label) => {
      const ids = documents.filter((d) => d.checklistItem === label).map((d) => d.id);
      return { label, provided: ids.length > 0, documentIds: ids };
    });
    return { documents, checklist, missing: checklist.filter((c) => !c.provided).map((c) => c.label) };
  }

  async add(
    applicationId: string,
    citizenId: string,
    body: unknown,
    declaredType: string | undefined,
    rawName: string | undefined,
    rawChecklistItem: string | undefined,
  ): Promise<ApplicationDocument> {
    const app = this.apps.assertEditable(applicationId, citizenId); // 403 other citizen, 409 after signing
    // Only PDF/PNG/JPEG bodies are parsed as raw bytes; anything else arrives as a non-Buffer.
    if (!Buffer.isBuffer(body)) throw new UnsupportedMediaTypeException("Allowed: PDF, PNG, JPEG (raw file as the request body)");
    if (body.length === 0) throw new BadRequestException("Empty file");
    if (body.length > DOCUMENT_MAX_BYTES) throw new PayloadTooLargeException("File is larger than 5 MB");
    const detected = sniffType(body);
    const declared = (declaredType ?? "").split(";")[0]?.trim().toLowerCase();
    if (!detected || detected !== declared) throw new UnsupportedMediaTypeException("File content does not match an allowed type");
    if (detected === "application/pdf" && PDF_ACTIVE.test(body.toString("latin1"))) {
      throw new UnprocessableEntityException("PDF with scripts, launch actions or embedded files is not accepted");
    }
    const checklistItem = decodeHeader(rawChecklistItem);
    if (checklistItem && !checklistOf(app.template).includes(checklistItem)) {
      throw new BadRequestException("Unknown checklist item for this application");
    }
    if (this.of(applicationId).length >= DOCUMENT_MAX_COUNT) {
      throw new UnprocessableEntityException(`At most ${DOCUMENT_MAX_COUNT} documents per application`);
    }

    const doc: StoredDocument = {
      id: randomUUID(),
      applicationId,
      citizenId,
      checklistItem,
      fileName: safeFileName(rawName),
      contentType: detected,
      sizeBytes: body.length,
      sha256: sha256(body),
      uploadedAt: new Date().toISOString(),
    };
    await this.writeBlob(doc, body);
    this.meta.set(doc.id, doc);
    this.apps.documentsChanged(applicationId, citizenId);
    this.audit.record({
      type: "DOCUMENT_ADDED",
      actor: { type: "citizen", id: citizenId },
      applicationId,
      caseId: app.caseId,
      // No file name (may contain personal data) and no content.
      data: { documentId: doc.id, contentType: doc.contentType, sizeBytes: doc.sizeBytes, sha256: doc.sha256, checklistItem },
    });
    await Promise.all([this.meta.persist("document.add"), this.apps.persist("document.add"), this.audit.persist("document.add")]);
    return publicView(doc);
  }

  /** The file for its owner; the bytes must still match the stored SHA-256. */
  async read(applicationId: string, documentId: string, citizenId: string): Promise<{ doc: ApplicationDocument; bytes: Buffer }> {
    this.apps.owned(applicationId, citizenId);
    const doc = this.owned(applicationId, documentId);
    const bytes = await this.readBlob(doc);
    if (sha256(bytes) !== doc.sha256) {
      this.logger.error(`document ${doc.id}: integrity check failed`);
      throw new InternalServerErrorException("Document integrity check failed");
    }
    return { doc: publicView(doc), bytes };
  }

  async remove(applicationId: string, documentId: string, citizenId: string): Promise<void> {
    const app = this.apps.assertEditable(applicationId, citizenId);
    const doc = this.owned(applicationId, documentId);
    this.meta.delete(doc.id);
    await this.deleteBlob(doc);
    this.apps.documentsChanged(applicationId, citizenId);
    this.audit.record({
      type: "DOCUMENT_REMOVED",
      actor: { type: "citizen", id: citizenId },
      applicationId,
      caseId: app.caseId,
      data: { documentId: doc.id, sha256: doc.sha256 },
    });
    await Promise.all([this.meta.persist("document.remove"), this.apps.persist("document.remove"), this.audit.persist("document.remove")]);
  }

  /** Metadata for the submission package, each file re-verified against its SHA-256. */
  async forPackage(applicationId: string): Promise<ApplicationDocument[]> {
    const docs = this.of(applicationId);
    for (const d of docs) {
      if (sha256(await this.readBlob(d)) !== d.sha256) throw new InternalServerErrorException("Document integrity check failed");
    }
    return docs.map(publicView);
  }

  private of(applicationId: string): StoredDocument[] {
    return this.meta
      .values()
      .filter((d) => d.applicationId === applicationId)
      .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
  }

  /** 404 for an unknown id or a document of another application (no cross-application access). */
  private owned(applicationId: string, documentId: string): StoredDocument {
    const doc = this.meta.get(documentId);
    if (!doc || doc.applicationId !== applicationId) throw new NotFoundException("Document not found");
    return doc;
  }

  private path(doc: StoredDocument): string | null {
    return this.dir ? join(this.dir, doc.applicationId, `${doc.id}.bin`) : null;
  }

  private async writeBlob(doc: StoredDocument, bytes: Buffer): Promise<void> {
    const file = this.path(doc);
    if (!file) {
      this.memory.set(doc.id, bytes);
      return;
    }
    await withTimeout(
      (async () => {
        await mkdir(dirname(file), { recursive: true, mode: 0o700 });
        await writeFile(file, bytes, { mode: 0o600, flag: "wx" });
      })(),
      "document.write",
    );
  }

  private async readBlob(doc: StoredDocument): Promise<Buffer> {
    const file = this.path(doc);
    if (!file) {
      const b = this.memory.get(doc.id);
      if (!b) throw new NotFoundException("Document not found");
      return b;
    }
    return withTimeout(readFile(file), "document.read");
  }

  private async deleteBlob(doc: StoredDocument): Promise<void> {
    const file = this.path(doc);
    if (!file) {
      this.memory.delete(doc.id);
      return;
    }
    await withTimeout(rm(file, { force: true }), "document.delete");
  }
}
