import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Post } from "@nestjs/common";
import { AGENCY_GATEWAY, type AgencyGateway, type AppealDto } from "../simulator/agency-gateway";

@Controller("appeals")
export class AppealsController {
  constructor(@Inject(AGENCY_GATEWAY) private readonly gateway: AgencyGateway) {}

  @Post()
  submit(@Body() body: AppealDto & { consent?: boolean }) {
    // Inson roziligisiz hech narsa yuborilmaydi
    if (body.consent !== true) throw new BadRequestException("Foydalanuvchi roziligi kerak");
    return this.gateway.submit(body);
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    const a = await this.gateway.getStatus(id);
    if (!a) throw new NotFoundException("Murojaat topilmadi");
    return a;
  }
}
