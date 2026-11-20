/**
 * Uzbek Cyrillic -> Latin transliteration and text cleanup.
 *
 * - transliterate(): script conversion only, preserving case, punctuation and structure.
 *   Used to give the LLM a single script (the catalog and prompt are Latin Uzbek).
 * - normalize(): aggressive form for keyword matching and BM25 — transliterate, then
 *   lowercase, unify apostrophes and collapse whitespace.
 */
const MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
  ъ: "'", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
  ў: "o'", қ: "q", ғ: "g'", ҳ: "h",
};

const isUpperLetter = (ch: string | undefined): boolean =>
  !!ch && ch === ch.toUpperCase() && ch !== ch.toLowerCase();

/** Cyrillic -> Latin, keeping case and everything that is not Cyrillic unchanged. */
export function transliterate(text: string): string {
  const chars = [...text];
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    const lower = ch.toLowerCase();
    const latin = MAP[lower];
    if (latin === undefined) {
      out += ch;
    } else if (ch === lower || latin.length === 0) {
      out += latin; // lowercase, or soft sign (ь -> "")
    } else if (isUpperLetter(chars[i - 1]) || isUpperLetter(chars[i + 1])) {
      out += latin.toUpperCase(); // inside an all-caps run: "ШОВҚИН" -> "SHOVQIN"
    } else {
      out += latin[0]!.toUpperCase() + latin.slice(1); // title case: "Ш" -> "Sh", "Ё" -> "Yo"
    }
  }
  return out;
}

export function normalize(text: string): string {
  return transliterate(text)
    .toLowerCase()
    .replace(/[ʻʼ`’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
