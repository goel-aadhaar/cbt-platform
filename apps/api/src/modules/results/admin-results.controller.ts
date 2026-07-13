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
import { SetManualScoreDto } from './dto/set-manual-score.dto';
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

  @Get(':id/results')
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.results.listForExam(id);
  }

  /** Download the ranked result sheet as CSV (§2.14). */
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

  /** Remediation (§2.5/§2.9): flag a question BONUS/DROPPED/MANUAL/NORMAL, then re-evaluate. */
  @Patch(':id/questions/:questionId/scoring')
  setScoring(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: SetScoringDto,
  ) {
    return this.results.setQuestionScoring(id, questionId, dto.override);
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
