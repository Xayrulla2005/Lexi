/** Kirill -> lotin va ortiqcha bo'shliqlarni tozalash (soddalashtirilgan) */
const MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh", ъ: "'",
  ь: "", э: "e", ю: "yu", я: "ya", ў: "o'", қ: "q", ғ: "g'", ҳ: "h",
};

export function normalize(text: string): string {
  const lower = text.toLowerCase();
  let out = "";
  for (const ch of lower) out += MAP[ch] ?? ch;
  return out.replace(/[ʻʼ`’‘]/g, "'").replace(/\s+/g, " ").trim();
}
