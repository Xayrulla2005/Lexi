/**
 * @lex/contracts — single source of truth for data shared between
 * apps/api, apps/web, apps/bot, ai/ and packages/legal-engine.
 *
 * Every contract is a zod schema (runtime validation) plus an inferred
 * TypeScript type with the same name. Changing a contract is a breaking
 * change for all consumers: update docs/api/contracts.md in the same PR.
 */
export * from "./common";
export * from "./classification";
export * from "./analysis";
export * from "./routing";
export * from "./case";
export * from "./submission";
export * from "./legal-source";
