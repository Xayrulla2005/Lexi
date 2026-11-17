/**
 * Prints the top-k article chunks for a query.
 * Run: pnpm rag:query "3 oydan beri oylik berishmayapti" [k]
 */
import { retrieve } from "../rag/legal-index";

async function main(): Promise<void> {
  const query = process.argv[2];
  const k = Number(process.argv[3] ?? 5);
  if (!query) {
    console.error('Usage: pnpm rag:query "<matn>" [k]');
    process.exitCode = 1;
    return;
  }
  const hits = await retrieve(query, k);
  hits.forEach((h, i) => {
    const part = h.parts > 1 ? ` (${h.part}/${h.parts})` : "";
    console.log(`${i + 1}. [${h.score.toFixed(3)}] ${h.document} — ${h.article}-modda${part}. ${h.title}`);
    console.log(`   ${h.sourceUrl}  (${h.status}; muammolar: ${h.problemIds.join(", ")})`);
  });
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
