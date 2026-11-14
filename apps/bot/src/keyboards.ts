/**
 * DILFUZA: tugmalar shu yerda. Faqat tugma matnlarini va tartibini o'zgartiring.
 * Ikkinchi qiymatni (masalan "send_yes") o'zgartirmang — kod shunga qarab ishlaydi.
 */
import { InlineKeyboard } from "grammy";

export const consentKeyboard = () =>
  new InlineKeyboard()
    .text("Ha, yubor", "send_yes")
    .row()
    .text("Avval ko'rib chiqay", "send_preview")
    .row()
    .text("Yo'q", "send_no");

export const emergencyKeyboard = () =>
  new InlineKeyboard().url("📞 102 ga qo'ng'iroq", "tel:102");
