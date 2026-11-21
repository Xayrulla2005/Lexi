import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { DOCUMENT_CHECKLIST_HEADER, DOCUMENT_NAME_HEADER, type ApplicationDocument, type ApplicationDocuments } from "@lex/contracts";
import type { AuthenticatedCitizen } from "../auth/auth-provider";
import { CitizenAuthGuard, CurrentCitizen } from "../auth/citizen-auth.guard";
import { RateLimit } from "../common/rate-limit";
import { DocumentsService } from "./documents.service";

/** RFC 6266 attachment header with a UTF-8 name; the ASCII fallback has no quotes or separators. */
const attachment = (name: string): string => {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\;]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
};

/** Supporting documents of an application. Owner only (403 otherwise). */
@Controller("applications/:id/documents")
@UseGuards(CitizenAuthGuard)
export class DocumentsController {
  constructor(@Inject(DocumentsService) private readonly docs: DocumentsService) {}

  @Get()
  list(@Param("id", ParseUUIDPipe) id: string, @CurrentCitizen() auth: AuthenticatedCitizen): ApplicationDocuments {
    return this.docs.list(id, auth.citizen.id);
  }

  /** Raw file body (Content-Type: application/pdf | image/png | image/jpeg), ≤ 5 MB. */
  @Post()
  @RateLimit("create")
  upload(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentCitizen() auth: AuthenticatedCitizen,
    @Headers("content-type") contentType?: string,
    @Headers(DOCUMENT_NAME_HEADER) name?: string,
    @Headers(DOCUMENT_CHECKLIST_HEADER) checklistItem?: string,
  ): Promise<ApplicationDocument> {
    return this.docs.add(id, auth.citizen.id, body, contentType, name, checklistItem);
  }

  /** Always a download (never rendered inline), not cached. */
  @Get(":documentId")
  @Header("Cache-Control", "no-store")
  async download(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @CurrentCitizen() auth: AuthenticatedCitizen,
  ): Promise<StreamableFile> {
    const { doc, bytes } = await this.docs.read(id, documentId, auth.citizen.id);
    return new StreamableFile(bytes, { type: doc.contentType, disposition: attachment(doc.fileName), length: bytes.length });
  }

  @Delete(":documentId")
  @HttpCode(204)
  async remove(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @CurrentCitizen() auth: AuthenticatedCitizen,
  ): Promise<void> {
    await this.docs.remove(id, documentId, auth.citizen.id);
  }
}
