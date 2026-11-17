import { Body, Controller, Get, Headers, Inject, Param, ParseUUIDPipe, Patch, Post, StreamableFile } from "@nestjs/common";
import {
  ConsentRequest,
  SIM_SESSION_HEADER,
  UpdateApplicationFieldsRequest,
  type Application,
  type SignatureVerification,
} from "@lex/contracts";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { EriSimulatorService } from "../sim/eri.service";
import { OneIdSimulatorService } from "../sim/oneid.service";
import { ApplicationsService } from "./applications.service";

/** Citizen-side application endpoints. All require a (simulated) OneID session. */
@Controller()
export class ApplicationsController {
  constructor(
    @Inject(ApplicationsService) private readonly apps: ApplicationsService,
    @Inject(OneIdSimulatorService) private readonly oneId: OneIdSimulatorService,
    @Inject(EriSimulatorService) private readonly eri: EriSimulatorService,
  ) {}

  @Post("cases/:id/application")
  create(@Param("id", ParseUUIDPipe) caseId: string, @Headers(SIM_SESSION_HEADER) token?: string): Application {
    return this.apps.createForCase(caseId, this.oneId.session(token).citizen);
  }

  @Get("applications")
  mine(@Headers(SIM_SESSION_HEADER) token?: string): Application[] {
    return this.apps.listForCitizen(this.oneId.session(token).citizen.id);
  }

  @Get("applications/:id")
  get(@Param("id", ParseUUIDPipe) id: string, @Headers(SIM_SESSION_HEADER) token?: string): Application {
    return this.apps.owned(id, this.oneId.session(token).citizen.id);
  }

  @Patch("applications/:id/fields")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateApplicationFieldsRequest)) body: UpdateApplicationFieldsRequest,
    @Headers(SIM_SESSION_HEADER) token?: string,
  ): Application {
    return this.apps.updateFields(id, this.oneId.session(token).citizen.id, body.values);
  }

  /** Body must be `{ consent: true }`; the server stores the consent time. */
  @Post("applications/:id/consent")
  consent(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ConsentRequest)) _body: ConsentRequest,
    @Headers(SIM_SESSION_HEADER) token?: string,
  ): Application {
    return this.apps.consent(id, this.oneId.session(token).citizen.id);
  }

  /** SIMULATED ERI: signs the SHA-256 of the final PDF with the test citizen's Ed25519 key. */
  @Post("applications/:id/sign")
  sign(@Param("id", ParseUUIDPipe) id: string, @Headers(SIM_SESSION_HEADER) token?: string): Promise<Application> {
    return this.apps.sign(id, this.oneId.session(token).citizen.id, this.eri);
  }

  @Get("applications/:id/verify")
  async verify(
    @Param("id", ParseUUIDPipe) id: string,
    @Headers(SIM_SESSION_HEADER) token?: string,
  ): Promise<SignatureVerification> {
    const app = this.apps.owned(id, this.oneId.session(token).citizen.id);
    if (!app.signature) return { valid: false, message: "Imzo buzilgan" };
    return this.eri.verify(await this.apps.pdf(id), app.signature);
  }

  @Get("applications/:id/pdf")
  async pdf(@Param("id", ParseUUIDPipe) id: string, @Headers(SIM_SESSION_HEADER) token?: string): Promise<StreamableFile> {
    this.apps.owned(id, this.oneId.session(token).citizen.id);
    return new StreamableFile(await this.apps.pdf(id), {
      type: "application/pdf",
      disposition: 'inline; filename="ariza.pdf"',
    });
  }
}
