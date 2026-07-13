import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import {
  QuestionSearchPort,
  QuestionSearchQuery,
} from '../ports/question-search.port';

/**
 * PostgreSQL full-text search adapter (§2.6, delivered implementation).
 *
 * Matches against the DB-generated, weighted `search_vector` (statement=A,
 * subject/chapter/topic=B, tags=C) with a GIN index. `websearch_to_tsquery`
 * gives users familiar syntax (quoted phrases, OR, `-exclude`) and results are
 * ordered by `ts_rank`. Tenant-scoped in SQL — never crosses institutes.
 */
@Injectable()
export class PostgresFullTextSearchAdapter extends QuestionSearchPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async search({
    instituteId,
    term,
    limit = 200,
  }: QuestionSearchQuery): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id
      FROM "questions"
      WHERE "institute_id" = ${instituteId}::uuid
        AND "search_vector" @@ websearch_to_tsquery('english', ${term})
      ORDER BY
        ts_rank("search_vector", websearch_to_tsquery('english', ${term})) DESC,
        "created_at" DESC
      LIMIT ${limit}
    `);
    return rows.map((r) => r.id);
  }
}
