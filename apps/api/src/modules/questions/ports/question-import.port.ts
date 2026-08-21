/** An image lifted out of an imported document, still in memory. */
export interface ParsedImage {
  /** Matches the `[[IMAGE:n]]` token left in the text where it appeared. */
  token: string;
  contentType: string;
  buffer: Buffer;
}

/** A question block parsed from an imported document, before field resolution. */
export interface ParsedQuestion {
  statement: string;
  options: { key: string; text: string }[];
  answer: string | null;
  meta: Record<string, string>;
  /**
   * Image tokens that appeared inside this question, in document order.
   *
   * The importer used to read the file with `extractRawText`, which drops
   * images on the floor — a diagram question imported as unanswerable text with
   * no warning that anything had been lost.
   */
  images: ParsedImage[];
  /**
   * Row in the source spreadsheet this question came from, when there is one.
   *
   * Undefined for prose formats like DOCX, where "row 12" would be meaningless
   * — those fall back to the question's position in the file.
   */
  sourceRow?: number;
}

/**
 * Import port (§2.6) — abstract class used as the DI token, so additional import
 * formats can be added without re-architecting the platform.
 *
 * Adapters:
 *   - QuestionImportAdapter — DELIVERED. Dispatches on the file's contents:
 *     approved DOCX templates (prose, images included) and XLSX question banks
 *     (one row per question).
 *   - Other formats         — a further branch in that adapter; the service,
 *     the controller and this port stay unchanged.
 */
export abstract class QuestionImportPort {
  /** The document format this adapter handles (e.g. "docx"). */
  abstract readonly format: string;

  /** Parse an uploaded document into question blocks, images included. */
  abstract parse(buffer: Buffer): Promise<ParsedQuestion[]>;
}
