/** A question block parsed from an imported document, before field resolution. */
export interface ParsedQuestion {
  statement: string;
  options: { key: string; text: string }[];
  answer: string | null;
  meta: Record<string, string>;
}

/**
 * Import port (§2.6) — abstract class used as the DI token, so additional import
 * formats can be added without re-architecting the platform.
 *
 * Adapters:
 *   - DocxImportAdapter — DELIVERED (approved DOCX templates).
 *   - Other formats     — future adapters, out of scope (§3.3).
 */
export abstract class QuestionImportPort {
  /** The document format this adapter handles (e.g. "docx"). */
  abstract readonly format: string;

  /** Parse an uploaded document into question blocks. */
  abstract parse(buffer: Buffer): Promise<ParsedQuestion[]>;
}
