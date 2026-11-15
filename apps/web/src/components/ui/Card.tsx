// SEVINCHOY: karta ko'rinishi
import type { ReactNode } from "react";

export function Card({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 20, margin: "12px 0" }}>
      {children}
    </div>
  );
}
