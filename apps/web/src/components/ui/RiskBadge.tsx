// SEVINCHOY: xavf belgisi — rang va so'z birga (faqat rang bilan emas)
import { texts } from "@/content/texts.uz";

type Level = keyof typeof texts.riskLabels;
const COLOR: Record<Level, string> = { red: "var(--red)", orange: "var(--orange)", yellow: "var(--yellow)", green: "var(--green)" };

export function RiskBadge({ level }: { level: Level }) {
  return (
    <span style={{ display: "inline-block", padding: "6px 12px", borderRadius: 999, background: COLOR[level], color: "#fff", fontWeight: 600 }}>
      {texts.riskLabels[level]}
    </span>
  );
}
