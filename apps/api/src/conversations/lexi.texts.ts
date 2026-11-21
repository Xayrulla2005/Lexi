/**
 * Lexi's messages (Uzbek, Latin). Only conversational text: no legal statements, phone
 * numbers or deadlines live here — those come from the catalog, articles or the LLM
 * analysis with citations.
 */
export const LEXI = {
  /** After cited articles: source date, verification state, information-not-advice. */
  sourceNotice: (asOf: string | null, unverified: boolean, stale: boolean): string =>
    [
      `ℹ Manba: lex.uz${asOf ? `, matn ${asOf} holatiga ko'ra olingan` : ""}.`,
      stale ? "Matn eskirgan bo'lishi mumkin — amaldagi tahririni lex.uz da tekshiring." : "",
      unverified ? "Moddalar yurist tomonidan hali tasdiqlanmagan." : "",
      "Bu huquqiy ma'lumot, yuridik maslahat emas.",
    ]
      .filter(Boolean)
      .join(" "),
  greeting:
    "Assalomu alaykum! Men Lexi — huquqiy dispetcherman. Nima bo'lganini oddiy so'zlar bilan yozing: avval xavfsizligingizni tekshiraman, keyin huquqlaringizni tushuntirib, qayerga va qanday murojaat qilishni ko'rsataman.",
  triageQuestion: "Siz yoki boshqa birov jarohat oldimi? Hozir xavfsiz joydamisiz?",
  triageDanger: "Ha, xavf bor",
  triageSafe: "Yo'q, xavfsizman",
  emergencyRed: "Bu xavfli holat. Avval yordam chaqiring — quyidagi raqamlar:",
  emergencyAfterAnswer: "Tushundim. Avval yordam chaqiring — quyidagi raqamlar:",
  emergencyContinue: "Xavfsiz joyga o'tgach, suhbatni davom ettiramiz: huquqlaringiz va keyingi qadamlarni ko'rsataman.",
  safeOk: "Yaxshi, xavf yo'qligi ma'qul. Endi holatingizni aniqlaymiz.",
  callButton: (name: string) => `📟 ${name}ga chaqiruv (simulyator)`,
  callConfirm: (name: string) =>
    `${name}ga SIMULYATOR orqali chaqiruv yuborilsinmi? Haqiqiy xizmatga hech narsa ketmaydi. Chaqiruvda hikoyangiz matni va test fuqaro ma'lumotlari bo'ladi.`,
  callConfirmYes: "Roziman, yuborish",
  callCancel: "Bekor qilish",
  callCancelled: "Chaqiruv yuborilmadi.",
  callSent: (name: string) => `Chaqiruv yuborildi (SIMULYATOR): ${name}. Holat: ekipaj yuborildi.`,
  chooseProblem: "Holatingiz qaysi biriga yaqinroq?",
  noneOfThem: "Hech biri",
  understood: "Sizni shunday tushundim:",
  dontKnow: "Bilmayman",
  unknownValue: "ma'lum emas",
  confirmAnswer: (label: string, value: string) => `✓ ${label}: ${value}`,
  factsTitle: "Sizdan olingan ma'lumotlar:",
  explainIntro: "Qonun bo'yicha holatingiz:",
  noArticles: "Bazamizdagi moddalarda bu holat bo'yicha aniq ma'lumot topilmadi.",
  roadmapIntro: "Yo'l xaritasi:",
  roadmapLlmIntro: "Murojaat qilish mumkin bo'lgan idoralar (katalogdan):",
  noApplication: "Bu holat uchun tayyor ariza shabloni yo'q, shuning uchun men nomingizdan ariza yubora olmayman.",
  offer: (agency: string) => `Men siz nomingizdan ${agency}ga murojaat yuboraymi?`,
  yes: "Ha",
  no: "Yo'q",
  loginFirst: "Ariza yuborish uchun avval OneID simulyatori orqali kiring, keyin «Ha»ni qayta bosing.",
  applicationReady:
    "Ariza tayyor. Tekshirib chiqing, «Ma'lumotlarim to'g'ri…» belgisini qo'ying, ERI bilan imzolang va yuboring. Rozilikdan oldin hech narsa yuborilmaydi.",
  offerDeclined: "Mayli, ariza yubormayman. Yo'l xaritasi yuqorida turibdi.",
  notLegal: "Bu huquqiy masalaga o'xshamaydi. Agar baribir maslahat kerak bo'lsa:",
  notLegalPolite:
    "Bu savol huquqiy masalaga o'xshamaydi — men huquqiy yo'l-yo'riq beraman. Huquqiy masala bo'lsa, bemalol yozing. Bepul huquqiy maslahat:",
  intentAsk: "Sizga qanday yordam kerak?",
  intentDispute: "Muammo yoki nizo",
  intentProcedure: "Jarayon / qanday qilish",
  intentQuestion: "Savol",
  procedureIntro: "Yo'l xaritasi (qadam-baqadam):",
  procedureNoPlan: "Bu jarayon bo'yicha bazamizdagi moddalarda aniq qadamlar topilmadi. Rasmiy manbadan aniqlang:",
  officialSource: "Hujjatlar ro'yxati, to'lov va muddatlarni rasmiy manbadan aniqlang",
  procedureCheck:
    "Hujjatlar, to'lov va muddatlar faqat modda tasdiqlagan joyda ko'rsatildi; qolganini rasmiy manbadan aniqlang. «Umumiy yo'nalish» belgili qadamlar bazadagi moddalar bilan tasdiqlanmagan.",
  violationOffer:
    "Agar bu jarayonda huquqingiz buzilsa (asossiz rad etishsa, ortiqcha pul so'rashsa), yozing — murojaat tayyorlab beraman.",
  questionIntro: "Qonun bo'yicha qisqa javob:",
  questionNotFound: "Bazamizdagi moddalarda bu savolga aniq javob topilmadi. Taxmin qilib javob bermayman.",
  toProcedureAsk: "Batafsil yo'l xaritasi kerakmi?",
  toProcedureYes: "Ha, yo'l xaritasi",
  afterFlow: "Yangi masala bo'lsa, «Yangi suhbat» tugmasini bosing. Arizangiz holatini shu yerda kuzatib boraman.",
  cabinetLink: "Idora kabinetida qanday ko'rinishini ko'rish",
  status: {
    SUBMITTED: (agency: string, receipt: string) => `Arizangiz ${agency}ga yuborildi. Raqami: ${receipt}.`,
    RECEIVED: (agency: string) => `${agency} arizangizni qabul qildi.`,
    IN_REVIEW: (agency: string) => `${agency} arizangizni ko'rib chiqmoqda.`,
    ANSWERED: (agency: string, text: string) => `${agency}dan javob keldi: «${text}»`,
    OVERDUE: (next: string) => `Javob muddati o'tdi — ${next}ga yuboraymi?`,
    OVERDUE_NO_NEXT: "Javob muddati o'tdi.",
    ESCALATED: "Ariza yuqori idoraga yuborildi.",
  },
  escalateReady: "Yuqori idoraga ariza qoralamasi tayyor. Tekshirib, rozilik bering va imzolang.",
  escalateDeclined: "Mayli. Kerak bo'lsa keyinroq yuborishingiz mumkin.",
} as const;
