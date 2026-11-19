/**
 * Lexi's messages (Uzbek, Latin). Only conversational text: no legal statements, phone
 * numbers or deadlines live here — those come from the catalog, articles or the LLM
 * analysis with citations.
 */
export const LEXI = {
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
