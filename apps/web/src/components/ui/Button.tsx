// SEVINCHOY: tugma ko'rinishi. Ranglarni styles/globals.css dan oladi.
import type { ButtonHTMLAttributes } from "react";

type Tone = "primary" | "danger" | "plain";
type Props = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone };

const STYLE: Record<Tone, { background: string; color: string; border: string }> = {
  primary: { background: "var(--ink)", color: "#fff", border: "none" },
  danger: { background: "var(--red)", color: "#fff", border: "none" },
  plain: { background: "transparent", color: "var(--ink)", border: "1px solid var(--border)" },
};

export function Button({ tone = "primary", style, ...rest }: Props) {
  return (
    <button
      {...rest}
      style={{
        ...STYLE[tone],
        borderRadius: 10,
        padding: "12px 18px",
        fontSize: 16,
        fontWeight: 600,
        cursor: "pointer",
        ...style,
      }}
    />
  );
}
