import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, StreamableFile, UseGuards } from "@nestjs/common";
import {
  ConsentRequest,
  IntakeAnswerRequest,
  UpdateApplicationFieldsRequest,
  type Application,
  type AuditEvent,
  type SignatureVerification,
} from "@lex/contracts";
import type { AuthenticatedCitizen } from "../auth/auth-provider";
import { CitizenAuthGuard, CurrentCitizen } from "../auth/citizen-auth.guard";
import { RateLimit } from "../common/rate-limit";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AuditService } from "../audit/audit.service";
import { EriSimulatorService } from "../sim/eri.service";
import { ApplicationsService } from "./applications.service";

/** Citizen-side application endpoints. All require an authenticated citizen and ownership. */
@Controller()
@UseGuards(CitizenAuthGuard)
export class ApplicationsController {
  constructor(
    @Inject(ApplicationsService) private readonly apps: ApplicationsService,
    @Inject(EriSimulatorService) private readonly eri: EriSimulatorService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Post("cases/:id/application")
  async create(@Param("id", ParseUUIDPipe) caseId: string, @CurrentCitizen() auth: AuthenticatedCitizen): Promise<Application> {
    const app = await this.apps.createForCase(caseId, auth.citizen);
    await this.apps.persist("application.create");
    return app;
  }

  @Get("applications")
  mine(@CurrentCitizen() auth: AuthenticatedCitizen): Application[] {
    return this.apps.listForCitizen(auth.citizen.id);
  }

  @Get("applications/:id")
  get(@Param("id", ParseUUIDPipe) id: string, @CurrentCitizen() auth: AuthenticatedCitizen): Application {
    return this.apps.owned(id, auth.citizen.id);
  }

  @Patch("applications/:id/fields")
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateApplicationFieldsRequest)) body: UpdateApplicationFieldsRequest,
    @CurrentCitizen() auth: AuthenticatedCitizen,
  ): Promise<Application> {
    const app = this.apps.updateFields(id, auth.citizen.id, body.values);
    await this.apps.persist("application.fields");
    return app;
  }

  /** Body must be `{ consent: true }`; the server stores the consent time. */
  @Post("applications/:id/consent")
  async consent(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ConsentRequest)) _body: ConsentRequest,
    @CurrentCitizen() auth: AuthenticatedCitizen,
  ): Promise<Application> {
    const app = this.apps.consent(id, auth.citizen.id);
    await this.apps.persist("application.consent");
    return app;
  }

  /** Lexi: extract stated values from the story and prepare at most 3 questions (once). */
  @Post("applications/:id/intake")
  @RateLimit("ai")
  async intake(@Param("id", ParseUUIDPipe) id: string, @CurrentCitizen() auth: AuthenticatedCitizen): Promise<Application> {
    const app = await this.apps.runIntake(id, auth.citizen.id);
    await this.apps.persist("application.intake");
    return app;
  }

  /** Answer to one question; "Bilmayman" leaves the field empty. */
  @Post("applications/:id/answer")
  async answer(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(IntakeAnswerRequest)) body: IntakeAnswerRequest,
    @CurrentCitizen() auth: AuthenticatedCitizen,
  ): Promise<Application> {
    const app = this.apps.answer(id, auth.citizen.id, body.key, body.answer);
    await this.apps.persist("application.answer");
    return app;
  }

  /** SIMULATED ERI: signs the SHA-256 of the final PDF with the test citizen's Ed25519 key. */
  @Post("applications/:id/sign")
  sign(@Param("id", ParseUUIDPipe) id: string, @CurrentCitizen() auth: AuthenticatedCitizen): Promise<Application> {
    return this.apps.sign(id, auth.citizen.id, this.eri);
  }

  @Get("applications/:id/verify")
  async verify(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentCitizen() auth: AuthenticatedCitizen,
  ): Promise<SignatureVerification> {
    const app = this.apps.owned(id, auth.citizen.id);
    if (!app.signature) return { valid: false, message: "Imzo buzilgan" };
    return this.eri.verify(await this.apps.pdf(id), app.signature);
  }

  /** The application's audit trail (consent, signature, submission, receipt, statuses). Owner only. */
  @Get("applications/:id/audit")
  auditTrail(@Param("id", ParseUUIDPipe) id: string, @CurrentCitizen() auth: AuthenticatedCitizen): AuditEvent[] {
    const app = this.apps.owned(id, auth.citizen.id);
    return this.audit.forApplication(id, app.submissionId ? [app.submissionId] : []);
  }

  @Get("applications/:id/pdf")
  async pdf(@Param("id", ParseUUIDPipe) id: string, @CurrentCitizen() auth: AuthenticatedCitizen): Promise<StreamableFile> {
    this.apps.owned(id, auth.citizen.id);
    return new StreamableFile(await this.apps.pdf(id), {
      type: "application/pdf",
      disposition: 'inline; filename="ariza.pdf"',
    });
  }
}
