import { Body, Controller, Get, Headers, Inject, Param, ParseUUIDPipe, Patch, Post, StreamableFile } from "@nestjs/common";
import { ConsentRequest, SIM_SESSION_HEADER, UpdateApplicationFieldsRequest, type Application } from "@lex/contracts";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { OneIdSimulatorService } from "../sim/oneid.service";
import { ApplicationsService } from "./applications.service";

/** Citizen-side application endpoints. All require a (simulated) OneID session. */
@Controller()
export class ApplicationsController {
  constructor(
    @Inject(ApplicationsService) private readonly apps: ApplicationsService,
    @Inject(OneIdSimulatorService) private readonly oneId: OneIdSimulatorService,
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

  @Get("applications/:id/pdf")
  async pdf(@Param("id", ParseUUIDPipe) id: string, @Headers(SIM_SESSION_HEADER) token?: string): Promise<StreamableFile> {
    this.apps.owned(id, this.oneId.session(token).citizen.id);
    return new StreamableFile(await this.apps.pdf(id), {
      type: "application/pdf",
      disposition: 'inline; filename="ariza.pdf"',
    });
  }
}
