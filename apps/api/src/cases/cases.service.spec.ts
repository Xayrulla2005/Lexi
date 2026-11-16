import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AiAnalysisService } from "../ai-analysis/ai-analysis.service";
import { LegalRoutingService } from "../legal-routing/legal-routing.service";
import { CasesService } from "./cases.service";

describe("CasesService", () => {
  const service = () => new CasesService(new AiAnalysisService(), new LegalRoutingService());

  it("analyzes a case and attaches an engine-produced routing decision", async () => {
    const s = service();
    const c = s.create("web", null);
    s.addMessage(c.id, "3 oydan beri oylik berishmayapti");

    const analyzed = await s.analyze(c.id);
    expect(analyzed.status).toBe("ANALYZED");
    expect(analyzed.analysis?.classification.problemId).toBe("P12");
    expect(analyzed.routingDecision?.routeId).toBe("P12");
    expect(analyzed.routingDecision?.requiresHumanReview).toBe(true);
    expect(analyzed.routingDecision?.agencies.map((a) => a.id)).toContain("mehnat_inspeksiyasi");
    expect(analyzed.routingDecision?.legalReferences.length).toBeGreaterThan(0);
    expect(analyzed.routingDecision?.reviewStatus).toBe("VERIFIED_PENDING");
    expect(analyzed.routingDecision?.reviewNotice).not.toBeNull();
  });

  it("refuses to analyze an empty case", async () => {
    const s = service();
    const c = s.create("bot", "tg-1");
    await expect(s.analyze(c.id)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws NotFound for unknown ids", () => {
    expect(() => service().get("00000000-0000-4000-8000-000000000000")).toThrow(NotFoundException);
  });
});
