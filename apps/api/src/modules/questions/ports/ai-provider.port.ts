import { ParsedQuestion } from './question-import.port';

export interface AiGenerationRequest {
  subject: string;
  chapter: string;
  topic?: string;
  difficulty?: string;
  count: number;
}

/**
 * AI provider port (§2.6) — **SEAM ONLY**.
 *
 * No AI provider is implemented in this engagement: §2.6 delivers the interface
 * only, and §3.3 lists AI implementation (AI question generation, AI reports,
 * AI analytics, AI-based recommendations) as explicitly OUT OF SCOPE.
 *
 * The seam exists so a provider can be plugged in later — bind a concrete
 * adapter to this token in QuestionsModule and nothing else needs to change.
 * The default binding is {@link UnavailableAiProvider}, which fails loudly with
 * 501 Not Implemented rather than silently doing nothing.
 */
export abstract class AiProviderPort {
  abstract generateQuestions(
    request: AiGenerationRequest,
  ): Promise<ParsedQuestion[]>;

  abstract explainAnswer(questionId: string): Promise<string>;
}
