import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { analyze } from "@lex/ai";
import type { AnalysisResult, RoutePlan } from "@lex/contracts";
import { RoutingService } from "../routing/routing.service";

export interface CaseMessage { id: string; role: "user" | "assistant"; text: string }
export interface CaseRecord {
  id: string;
  channel: "bot" | "web";
  status: "open" | "analyzed" | "appealed" | "closed";
  messages: CaseMessage[];
  analysis?: AnalysisResult;
  route?: RoutePlan;
}

/** Hozircha xotirada. TODO(Xayrulla): Prisma + PostgreSQL ga ko'chirish (prisma/schema.prisma) */
@Injectable()
export class CasesService {
  private readonly cases = new Map<string, CaseRecord>();

  // @Inject aniq yozilgan: tsx (esbuild) dekorator metadata chiqarmaydi
  constructor(@Inject(RoutingService) private readonly routing: RoutingService) {}

  create(channel: "bot" | "web"): CaseRecord {
    const c: CaseRecord = { id: randomUUID(), channel, status: "open", messages: [] };
    this.cases.set(c.id, c);
    return c;
  }

  get(id: string): CaseRecord {
    const c = this.cases.get(id);
    if (!c) throw new NotFoundException("Murojaat topilmadi");
    return c;
  }

  addMessage(id: string, text: string): CaseMessage {
    const msg: CaseMessage = { id: randomUUID(), role: "user", text };
    this.get(id).messages.push(msg);
    return msg;
  }

  async analyze(id: string): Promise<CaseRecord> {
    const c = this.get(id);
    const story = c.messages.filter((m) => m.role === "user").map((m) => m.text).join("\n");
    c.analysis = await analyze({ text: story });
    c.route = this.routing.plan(c.analysis);
    c.status = "analyzed";
    return c;
  }
}
