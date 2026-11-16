// SEVINCHOY: sariq ogohlantirish bloki (masalan, yo'l hali yurist tomonidan tekshirilmagan bo'lsa)
import type { ReactNode } from "react";

export function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      role="note"
      style={{
        background: "var(--warning-bg)",
        border: "1px solid var(--warning-border)",
        borderLeft: "6px solid var(--warning-border)",
        borderRadius: 10,
        padding: "10px 14px",
        margin: "12px 0",
      }}
    >
      <b>⚠ {title}:</b> {children}
    </div>
  );
}
