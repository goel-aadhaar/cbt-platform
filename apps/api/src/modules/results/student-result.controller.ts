import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { ResultsService } from './results.service';

@ApiTags('results')
@ApiBearerAuth()
@Roles(Role.STUDENT)
@Controller({ path: 'attempts', version: '1' })
export class StudentResultController {
  constructor(private readonly results: ResultsService) {}

  /** The student's own result for an attempt — only once published. */
  @Get(':id/result')
  getResult(@Param('id', ParseUUIDPipe) id: string) {
    return this.results.getForStudent(id);
  }

  /**
   * Per-question review of the candidate's own attempt. Carries answer keys,
   * so it is gated on the result being published.
   */
  @Get(':id/review')
  getReview(@Param('id', ParseUUIDPipe) id: string) {
    return this.results.getReviewForStudent(id);
  }

  /**
   * Cohort aggregates for the paper this attempt belongs to — "your score vs
   * the class average". Aggregates only, and suppressed entirely for a cohort
   * small enough that an average would identify individuals.
   */
  @Get(':id/cohort')
  getCohort(@Param('id', ParseUUIDPipe) id: string) {
    return this.results.getCohortForStudent(id);
  }

  /**
   * Leaderboard for the paper this attempt belongs to.
   *
   * Unlike `/cohort`, this one does name other candidates — abbreviated, never
   * with a roll number, and only once the caller's own result is published.
   * `scope=batch` ranks within the caller's batch instead of the institute.
   */
  @Get(':id/leaderboard')
  @ApiQuery({ name: 'scope', required: false, enum: ['overall', 'batch'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getLeaderboard(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('scope') scope?: string,
    @Query('limit') limit?: string,
  ) {
    // Clamped rather than trusted: this is what "View Full List" sends, and an
    // unbounded limit would let one request ask for every candidate's row.
    const parsed = Number(limit);
    const size = Number.isFinite(parsed)
      ? Math.min(Math.max(Math.trunc(parsed), 3), 100)
      : 10;
    return this.results.getLeaderboardForStudent(
      id,
      scope === 'batch' ? 'BATCH' : 'OVERALL',
      size,
    );
  }
}
