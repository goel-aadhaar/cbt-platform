export interface QuestionSearchQuery {
  /** Tenant scope — the search must never cross institutes. */
  instituteId: string;
  /** Free-text query as typed by the user. */
  term: string;
  limit?: number;
}

/**
 * Search port (§2.6) — abstract class used as the DI token, so richer search
 * providers can be added without re-architecting the platform.
 *
 * Adapters:
 *   - PostgresFullTextSearchAdapter — DELIVERED (PostgreSQL full-text search).
 *   - LaTeX-aware / semantic / vector / AI search — future adapters, out of
 *     scope (§3.3).
 *
 * Returns matching question ids in relevance order.
 */
export abstract class QuestionSearchPort {
  abstract search(query: QuestionSearchQuery): Promise<string[]>;
}
