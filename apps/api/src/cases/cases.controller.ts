import { Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";
import { CasesService } from "./cases.service";

@Controller("cases")
export class CasesController {
  constructor(@Inject(CasesService) private readonly cases: CasesService) {}

  @Post()
  create(@Body() body: { channel?: "bot" | "web" }) {
    return this.cases.create(body.channel ?? "web");
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.cases.get(id);
  }

  @Post(":id/messages")
  addMessage(@Param("id") id: string, @Body() body: { text?: string; audio_url?: string }) {
    // TODO(Xayrulla+Jayhun): audio_url -> STT -> matn
    return this.cases.addMessage(id, body.text ?? "");
  }

  @Post(":id/analyze")
  analyze(@Param("id") id: string) {
    return this.cases.analyze(id);
  }
}
