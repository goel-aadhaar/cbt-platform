import { Injectable, NotImplementedException } from '@nestjs/common';

import { AiProviderPort } from '../ports/ai-provider.port';
import { ParsedQuestion } from '../ports/question-import.port';

/**
 * Default binding for {@link AiProviderPort}. This engagement delivers the AI
 * seam only — no AI provider is implemented (§2.6, and §3.3 lists AI as out of
 * scope). Any attempt to use AI fails loudly with 501 Not Implemented rather
 * than silently degrading; swap this binding for a real adapter to enable it.
 */
@Injectable()
export class UnavailableAiProvider extends AiProviderPort {
  private unavailable(): never {
    throw new NotImplementedException(
      'No AI provider is configured. The AI Provider Interface is delivered as a seam only (§2.6); AI implementation is out of scope (§3.3).',
    );
  }

  generateQuestions(): Promise<ParsedQuestion[]> {
    return this.unavailable();
  }

  explainAnswer(): Promise<string> {
    return this.unavailable();
  }
}
