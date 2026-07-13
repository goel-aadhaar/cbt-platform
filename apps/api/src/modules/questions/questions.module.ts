import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DocxImportAdapter } from './adapters/docx-import.adapter';
import { PostgresFullTextSearchAdapter } from './adapters/postgres-search.adapter';
import { UnavailableAiProvider } from './adapters/unavailable-ai.provider';
import { AiProviderPort } from './ports/ai-provider.port';
import { QuestionImportPort } from './ports/question-import.port';
import { QuestionSearchPort } from './ports/question-search.port';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';

/**
 * Question bank (§2.4/§2.5) plus the platform ports from §2.6. Search, import
 * and AI sit behind abstraction interfaces so future providers (semantic search,
 * new import formats, an AI provider) can be bound here without touching the
 * service. AI is a seam only — no provider is implemented (§3.3).
 */
@Module({
  imports: [AuthModule], // for TenantContextService
  controllers: [QuestionsController],
  providers: [
    QuestionsService,
    { provide: QuestionSearchPort, useClass: PostgresFullTextSearchAdapter },
    { provide: QuestionImportPort, useClass: DocxImportAdapter },
    { provide: AiProviderPort, useClass: UnavailableAiProvider },
  ],
})
export class QuestionsModule {}
