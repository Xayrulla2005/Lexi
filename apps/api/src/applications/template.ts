import { NotFoundException } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../common/paths";

const TEMPLATES_DIR = join(REPO_ROOT, "legal-knowledge/templates");
const PLACEHOLDER = /\{\{([a-z0-9_]+)\}\}/g;
/** Leading metadata comment, e.g. "<!-- T12 · Ish haqini ... -->". Not part of the application text. */
const LEADING_COMMENT = /^\s*<!--[\s\S]*?-->\s*\n?/;

/** Reads legal-knowledge/templates/<id>.md. The text is returned unchanged except for the leading comment. */
export function loadTemplate(templateId: string): string {
  if (!/^T\d{2}$/.test(templateId)) throw new NotFoundException(`Unknown template ${templateId}`);
  let raw: string;
  try {
    raw = readFileSync(join(TEMPLATES_DIR, `${templateId}.md`), "utf8");
  } catch {
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
