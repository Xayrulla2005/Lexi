/**
 * SEVINCHOY: sahifadagi barcha matnlar shu yerda.
 * Faqat qo'shtirnoq ichidagi matnni o'zgartiring, kalit nomlariga tegmang.
 */
export const texts = {
  appName: "Huquqiy dispetcher",
  tagline: "Muammongizni ayting — to'g'ri idorani topamiz, arizani tayyorlaymiz",
  inputPlaceholder: "Muammongizni oddiy so'zlar bilan yozing...",
  send: "Yuborish",
  emergency: "Favqulodda: 102",
  thinking: "Tahlil qilinmoqda...",
  resultTitle: "Nima qilish kerak",
  lawTitle: "Qonun asosi",
  sendAppeal: "Arizani yuborish",
  lawyer: "Yuristga murojaat",
  sent: "Yuborildi. Ariza raqami:",
  riskLabels: {
    red: "Qizil — juda xavfli",
    orange: "To'q sariq — jiddiy",
    yellow: "Sariq — oddiy nizo",
    green: "Yashil — ma'lumot",
  },
  routeKind: {
    emergency: "Favqulodda holat",
    verified: "Yurist tasdiqlagan yo'l",
    generic: "Umumiy yo'l — yurist bilan ham maslahatlashing",
  },
  simulator: {
    banner: "SIMULYATOR — demo rejim",
    title: "Davlat mehnat inspeksiyasi — kelgan murojaatlar",
    empty: "Hozircha murojaat yo'q",
    status: {
      received: "Qabul qilindi",
      in_review: "Ko'rib chiqilmoqda",
      answered: "Javob berildi",
      overdue: "Muddat o'tdi",
    } as Record<string, string>,
  },
};
