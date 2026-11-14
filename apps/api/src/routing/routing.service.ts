import { Injectable } from "@nestjs/common";
import type { AnalysisResult, Category, RoutePlan, RouteStep } from "@lex/contracts";

/**
 * Idorani AI emas, shu servis tanlaydi.
 * TODO(Xayrulla): VERIFIED va DEFAULT_AGENCY ni data/raw dagi CSV dan bazaga import qilib o'qish.
 */
const VERIFIED: Record<string, RouteStep[]> = {
  ish_haqi_tolanmagan: [
    { order: 1, agency_id: "ish_beruvchi", action: "Ish beruvchiga yozma talabnoma", deadline_days: 10, document_template: "talabnoma_ish_haqi" },
    { order: 2, agency_id: "mehnat_inspeksiyasi", action: "Davlat mehnat inspeksiyasiga ariza", deadline_days: 15, document_template: "ariza_mehnat_inspeksiyasi" },
    { order: 3, agency_id: "sud", action: "Tuman (shahar) sudiga da'vo arizasi", deadline_days: null, document_template: null },
  ],
};

const DEFAULT_AGENCY: Partial<Record<Category, string>> = {
  mehnat: "mehnat_inspeksiyasi",
  zoravonlik: "profilaktika_inspektori",
  qoshnichilik: "profilaktika_inspektori",
  bank_firibgarlik: "bank",
  ijro: "mib",
  istemolchi: "raqobat_qomitasi",
};

@Injectable()
export class RoutingService {
  plan(a: AnalysisResult): RoutePlan {
    if (a.risk.level === "red") {
      return {
        kind: "emergency",
        steps: [{ order: 1, agency_id: "iiv_102", action: "Darhol 102 ga qo'ng'iroq qiling", deadline_days: 0, document_template: null }],
      };
    }

    if (a.subcase && VERIFIED[a.subcase]) {
      return { kind: "verified", steps: VERIFIED[a.subcase] };
    }

    const first = a.agency_candidates[0] ?? DEFAULT_AGENCY[a.category] ?? "advice_uz";
    return {
      kind: "generic",
      steps: [
        { order: 1, agency_id: first, action: "Vakolatli idoraga yozma murojaat", deadline_days: 15, document_template: null },
        { order: 2, agency_id: "yurist", action: "Yurist bilan maslahatlashish", deadline_days: null, document_template: null },
      ],
    };
  }
}
