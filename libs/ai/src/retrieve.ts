/** Qonun qidiruvi (RAG). Hozircha bitta namunaviy modda qaytaradi. */
export interface LawSource {
  id: string;        // masalan "MK-333"
  title: string;     // "Mehnat kodeksi, 333-modda"
  text: string;
  url: string;       // lex.uz havolasi
  edition_date?: string;
}

export async function retrieve(_text: string): Promise<LawSource[]> {
  // TODO(Jayhun): embedding + pgvector, top-20, reranker -> top-5
  return [
    {
      id: "MK-333",
      title: "Mehnat kodeksi, 333-modda (ish haqi kechiktirilganlik uchun kompensatsiya)",
      text: "",
      url: "https://lex.uz/docs/-6257288",
    },
  ];
}
