import { describe, expect, it } from "vitest";
import { classify } from "../pipeline/classify";
import { normalize } from "../pipeline/normalize";

const pid = (t: string) => classify(normalize(t)).problemId;

describe("keyword classify", () => {
  it.each([
    ["3 oydan beri oylik berishmayapti", "P12"],
    ["Уч ойдан бери ойлик беришмаяпти", "P12"],
    ["маошимни бермаяпти", "P12"],
    ["Uch aydan beri ayliq vermeyätlär", "P12"],
    ["иш ҳақимни бермади", "P12"],
    ["eri meni urdi", "P25"],
    ["zo‘ravonlik qilyapti", "P25"],
    ["ko'chada meni so‘kdi", "P42"],
    ["meni haqorat qildi", "P42"],
    ["qo‘shnim har kecha baland ovozda musiqa qo'yadi", "P44"],
    ["kechasi shovqin qilishadi", "P44"],
    ["erim pichoq bilan o'ldiraman deyapti", null],
    ["uyni qurdi", null],
    ["Universitetdan hujjatlarimni bermayapti", null],
  ] as const)("%s -> %s", (text, expected) => {
    expect(pid(text)).toBe(expected);
  });
});
