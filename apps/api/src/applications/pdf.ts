import { dirname, join } from "node:path";
import PDFDocument from "pdfkit";

/** DejaVu Sans covers Uzbek latin incl. o‘ g‘ ʻ ’ (U+2018, U+02BB, U+2019). */
const FONT = join(dirname(require.resolve("dejavu-fonts-ttf/package.json")), "ttf/DejaVuSans.ttf");

/** Marks the document as a demo artefact. Printed below the application text, never inside it. */
export const PDF_SIM_FOOTER = "SIMULYATOR: demo hujjat. Haqiqiy davlat idorasiga yuborilmagan.";

/** Renders the filled application text to PDF bytes. */
export function renderApplicationPdf(text: string): Promise<Buffer> {
  return new Promise((resolvePdf, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 56,
      info: { Title: "Ariza", Producer: "LEX-DISPATCHER (simulyator)" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolvePdf(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("body", FONT);
    doc.font("body").fontSize(12).text(text, { lineGap: 3 });
    doc.moveDown(2).fontSize(8).fillColor("#666666").text(PDF_SIM_FOOTER);
    doc.end();
  });
}
