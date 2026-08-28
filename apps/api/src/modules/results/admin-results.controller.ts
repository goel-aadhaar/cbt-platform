import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { QueryResultsDto } from './dto/query-results.dto';
import { SetManualScoreDto } from './dto/set-manual-score.dto';
import { SetManualScoresDto } from './dto/set-manual-scores.dto';
import { SetScoringDto } from './dto/set-scoring.dto';
import { ResultsService } from './results.service';

@ApiTags('results')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller({ path: 'exams', version: '1' })
export class AdminResultsController {
  constructor(private readonly results: ResultsService) {}

  /** Evaluate all submitted attempts: score, rank, percentile. Idempotent. */
  @Post(':id/evaluate')
  @HttpCode(HttpStatus.OK)
  evaluate(@Param('id', ParseUUIDPipe) id: string) {
    return this.results.evaluate(id);
  }

  @Roles(Role.ADMIN, Role.TEACHER)
  @Get(':id/results')
  list(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryResultsDto,
  ) {
    return this.results.listForExam(id, query);
  }

  /** Download the ranked result sheet as CSV (§2.14). */
  @Roles(Role.ADMIN, Role.TEACHER)
  @Get(':id/results/export/csv')
  async exportCsv(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { filename, csv } = await this.results.exportResultsCsv(id);
    return new StreamableFile(Buffer.from(csv, 'utf8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  /** Download the ranked result sheet as an Excel workbook (§2.14). */
  @Roles(Role.ADMIN, Role.TEACHER)
  @Get(':id/results/export/xlsx')
  async exportXlsx(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { filename, buffer } = await this.results.exportResultsXlsx(id);
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  /** Download the ranked result sheet as a PDF (§2.14). */
  @Roles(Role.ADMIN, Role.TEACHER)
  @Get(':id/results/export/pdf')
  async exportPdf(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { filename, buffer } = await this.results.exportResultsPdf(id);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  /** The exam's questions with their answer-key decision and hit rate (§2.9). */
  @Roles(Role.ADMIN, Role.TEACHER)
  @Get(':id/questions/scoring')
  listScoring(@Param('id', ParseUUIDPipe) id: string) {
    return this.results.listQuestionScoring(id);
  }

  /** Remediation (§2.5/§2.9): flag a question BONUS/DROPPED/MANUAL/NORMAL; recalculates. */
  @Patch(':id/questions/:questionId/scoring')
  setScoring(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: SetScoringDto,
  ) {
    return this.results.setQuestionScoring(id, questionId, dto.override);
  }

  /**
   * Manual evaluation (§2.5): the grading list for one question — every
   * candidate, their submitted answer, and what they have been awarded so far.
   * A read, so it follows the same ADMIN+TEACHER gate as the hit-rate list and
   * is batch-scoped for a teacher.
   */
  @Roles(Role.ADMIN, Role.TEACHER)
  @Get(':id/questions/:questionId/manual')
  manualRoster(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
  ) {
    return this.results.manualRoster(id, questionId);
  }

  /**
   * Manual evaluation (§2.5): award marks to many candidates in one call.
   *
   * Declared before the single-candidate route below — Nest matches in
   * declaration order, the same reason `/students/import` precedes
   * `/students/:id`.
   */
  @Put(':id/results/manual/bulk')
  @HttpCode(HttpStatus.OK)
  setManualScores(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetManualScoresDto,
  ) {
    return this.results.setManualScores(id, dto);
  }

  /** Manual evaluation (§2.5): award marks to one candidate for one question. */
  @Put(':id/results/manual')
  @HttpCode(HttpStatus.OK)
  setManualScore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetManualScoreDto,
  ) {
    return this.results.setManualScore(id, dto);
  }

  @Post(':id/results/publish')
  @HttpCode(HttpStatus.OK)
  @ApiQuery({ name: 'batchId', required: false })
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('batchId', new ParseUUIDPipe({ optional: true })) batchId?: string,
  ) {
    return this.results.publish(id, batchId);
  }

  @Post(':id/results/hold')
  @HttpCode(HttpStatus.OK)
  @ApiQuery({ name: 'batchId', required: false })
  hold(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('batchId', new ParseUUIDPipe({ optional: true })) batchId?: string,
  ) {
    return this.results.hold(id, batchId);
  }
}
