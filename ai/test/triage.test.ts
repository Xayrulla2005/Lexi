import { describe, expect, it } from "vitest";
import { answerMeansDanger, detectTriage, emergencyAgencyOrder } from "../pipeline/triage";

describe("detectTriage", () => {
  it("finds danger signals in Uzbek (Latin/Cyrillic) and Russian", () => {
    expect(detectTriage("Avariya bo'ldim").signals).toEqual(["accident"]);
    expect(detectTriage("Erim urdi, hozir uyda qo'rqyapman").signals).toEqual(["violence", "threat"]);
    expect(detectTriage("Уйимизда ёнғин чиқди").signals).toContain("fire");
    expect(detectTriage("o'zimni o'ldirmoqchiman").signals).toContain("self_harm");
    expect(detectTriage("3 oydan beri oylik berishmayapti").signals).toEqual([]);
  });

  it("red keywords are flagged for the immediate emergency card", () => {
    expect(detectTriage("erim pichoq bilan o'ldiraman deyapti").red).toBe(true);
    expect(detectTriage("Avariya bo'ldim").red).toBe(false);
  });
});

describe("answerMeansDanger", () => {
  it("clear 'no' answers are safe; everything else counts as danger", () => {
    expect(answerMeansDanger("Yo'q, xavfsizman")).toBe(false);
    expect(answerMeansDanger("hech kim jarohat olmadi, hammasi joyida")).toBe(false);
    expect(answerMeansDanger("Ha, xavf bor")).toBe(true);
    expect(answerMeansDanger("bilmadim, oyog'im og'riyapti")).toBe(true);
    expect(answerMeansDanger("Нет")).toBe(false);
  });
});

describe("emergencyAgencyOrder", () => {
  it("medical first for accidents, police first for violence", () => {
    expect(emergencyAgencyOrder(["accident"])).toEqual(["tez_yordam", "iiv", "ishonch_1146"]);
    expect(emergencyAgencyOrder(["violence"])).toEqual(["iiv", "ishonch_1146", "tez_yordam"]);
  });
});

describe("triage with Cyrillic/Russian input (transliterate -> normalize)", () => {
  it.each([
    ["Он сказал: убью тебя", "threat"],
    ["ОН КРИЧИТ УБЬЮ", "threat"],
    ["Я попал в аварию", "accident"],
    ["Авария бўлди", "accident"],
    ["Муж избил меня", "violence"],
    ["Меня избили на улице", "violence"],
    ["В доме пожар", "fire"],
    ["Эрим урди, қўрқяпман", "violence"],
    ["Угрожают убить", "threat"],
  ])("%s -> %s", (text, signal) => {
    expect(detectTriage(text).signals).toContain(signal);
  });

  it("Russian threat to kill is red (emergency card at once)", () => {
    expect(detectTriage("Он сказал: убью тебя").red).toBe(true);
  });
});
