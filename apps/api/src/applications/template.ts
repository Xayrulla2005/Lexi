import { NotFoundException } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { REPO_ROOT } from "../common/paths";
import { OperationTimeoutError, withTimeout } from "../common/timeout";

const TEMPLATES_DIR = join(REPO_ROOT, "legal-knowledge/templates");
const PLACEHOLDER = /\{\{([a-z0-9_]+)\}\}/g;
/** Leading metadata comment, e.g. "<!-- T12 · Ish haqini ... -->". Not part of the application text. */
const LEADING_COMMENT = /^\s*<!--[\s\S]*?-->\s*\n?/;

/** Reads legal-knowledge/templates/<id>.md. The text is returned unchanged except for the leading comment. */
export async function loadTemplate(templateId: string): Promise<string> {
  if (!/^T\d{2}$/.test(templateId)) throw new NotFoundException(`Unknown template ${templateId}`);
  let raw: string;
  try {
    raw = await withTimeout(readFile(join(TEMPLATES_DIR, `${templateId}.md`), "utf8"), `template:${templateId}`);
  } catch (e) {
    if (e instanceof OperationTimeoutError) throw e;
    throw new NotFoundException(`Template ${templateId} not found`);
  }
  return raw.replace(/\r\n/g, "\n").replace(LEADING_COMMENT, "");
}

/** Placeholder keys in order of first appearance. */
export function fieldKeys(template: string): string[] {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((m) => m[1] as string))];
}

/** Replaces placeholders; empty ones are rendered by `blank(key)`. Nothing else in the text changes. */
export function fillTemplate(
  template: string,
  values: ReadonlyMap<string, string>,
  blank: (key: string) => string,
): string {
  return template.replace(PLACEHOLDER, (_m, key: string) => values.get(key) ?? blank(key));
}

/** Facts about the overdue submission that an escalation draft refers to. */
export interface PreviousSubmission {
  receiptId: string;
  /** Already formatted for the text, e.g. "17.11.2026". */
  submittedOn: string;
  agencyName: string;
}

const ADDRESSEE_LINE = /^Kimga:.*$/m;
const SIGNATURE_LINE = /^.*Imzo:.*$/m;

/**
 * Escalation draft text from the original template:
 *  - the "Kimga:" header line names the target agency (catalog name) — a header, not legal text;
 *  - one factual line about the previous submission is inserted before the signature line.
 * Nothing else in the template changes.
 */
export function escalationTemplate(template: string, targetAgencyName: string, previous: PreviousSubmission): string {
  const addressee = `Kimga: ${targetAgencyName}`;
  let text = ADDRESSEE_LINE.test(template) ? template.replace(ADDRESSEE_LINE, addressee) : `${addressee}\n${template}`;
  const fact =
    `Avvalgi murojaat: № ${previous.receiptId}, ${previous.submittedOn}, ${previous.agencyName}ga yuborilgan; ` +
    "belgilangan muddatda javob olinmadi.";
  const sig = SIGNATURE_LINE.exec(text);
  text = sig ? `${text.slice(0, sig.index)}${fact}\n\n${text.slice(sig.index)}` : `${text.trimEnd()}\n\n${fact}\n`;
  return text;
}
