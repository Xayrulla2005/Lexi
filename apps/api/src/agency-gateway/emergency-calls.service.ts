import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { EmergencyCall, type SimCitizen } from "@lex/contracts";
import { JsonStore } from "../common/json-store";
import { runtimeFile } from "../common/paths";
import { LegalRoutingService } from "../legal-routing/legal-routing.service";

/** Catalog emergency services that the simulator can "call". */
export const EMERGENCY_SIM_AGENCIES = ["iiv", "tez_yordam", "ishonch_1146"] as const;

/**
 * SIMULATOR of an emergency dispatch ("Navbatchi qism"). Nothing real is called:
 * a record appears in the agency cabinet (/idora) with status "Ekipaj yuborildi".
 * Created only after the user's explicit confirmation in the conversation.
 */
@Injectable()
export class EmergencyCallsService {
  private readonly store = new JsonStore<EmergencyCall>(runtimeFile("emergency-calls.json"), EmergencyCall);

  constructor(@Inject(LegalRoutingService) private readonly routing: LegalRoutingService) {}

  async create(agencyId: string, description: string, conversationId: string, citizen: SimCitizen | null): Promise<EmergencyCall> {
    if (!(EMERGENCY_SIM_AGENCIES as readonly string[]).includes(agencyId)) {
      throw new BadRequestException(`${agencyId} is not an emergency service`);
    }
    const agency = this.routing.agencies().find((a) => a.id === agencyId);
    const call: EmergencyCall = {
      id: randomUUID(),
      agencyId,
      agencyName: agency?.name ?? agencyId,
      phone: agency?.phone ?? null,
      description: description.slice(0, 1000),
      citizen,
      conversationId,
      createdAt: new Date().toISOString(),
      status: "CREW_DISPATCHED",
    };
    this.store.set(call.id, call);
    await this.store.persist("emergency.call");
    return call;
  }

  list(agencyId: string): EmergencyCall[] {
    return this.store
      .values()
      .filter((c) => c.agencyId === agencyId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
