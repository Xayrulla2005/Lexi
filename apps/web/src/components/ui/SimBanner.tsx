// SEVINCHOY: simulyator ekranlari uchun katta ogohlantirish yozuvi (haqiqiy davlat tizimiga o'xshamasin)
export function SimBanner({ text }: { text: string }) {
  return (
    <div
      role="status"
      style={{
        background: "repeating-linear-gradient(45deg, var(--accent), var(--accent) 12px, #f0c25a 12px, #f0c25a 24px)",
        color: "var(--ink)",
        padding: "14px 16px",
        borderRadius: 10,
        fontWeight: 800,
        fontSize: 20,
        textAlign: "center",
        letterSpacing: 0.5,
        margin: "0 0 16px",
      }}
    >
      {text}
    </div>
  );
}
