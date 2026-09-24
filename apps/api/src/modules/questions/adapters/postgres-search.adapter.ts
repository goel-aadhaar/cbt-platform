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
    // DEF-001: raw $queryRaw isn't intercepted by the tenant RLS extension
    // (it only hooks model operations) — batched with the GUC set so both
    // run on the same connection/transaction. `instituteId` (not the
    // caller's ambient tenant context) is the source of truth here, same as
    // it already is for the WHERE clause below.
    const [, rows] = await this.prisma.raw.$transaction([
      this.prisma.raw
        .$executeRaw`SELECT set_config('app.current_institute_id', ${instituteId}, TRUE)`,
      this.prisma.raw.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id
        FROM "questions"
        WHERE "institute_id" = ${instituteId}::uuid
          AND "search_vector" @@ websearch_to_tsquery('english', ${term})
        ORDER BY
          ts_rank("search_vector", websearch_to_tsquery('english', ${term})) DESC,
          "created_at" DESC
        LIMIT ${limit}
      `),
    ]);
    return rows.map((r) => r.id);
  }
}
