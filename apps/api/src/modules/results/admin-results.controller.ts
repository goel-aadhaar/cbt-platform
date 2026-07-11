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
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
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

  /** Grace marks (§2.9): flag a question BONUS/DROPPED/NORMAL, then re-evaluate. */
  @Patch(':id/questions/:questionId/scoring')
  setScoring(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: SetScoringDto,
  ) {
    return this.results.setQuestionScoring(id, questionId, dto.override);
  }

  @Post(':id/results/publish')
  @HttpCode(HttpStatus.OK)
  publish(@Param('id', ParseUUIDPipe) id: string) {
    return this.results.publish(id);
  }

  @Post(':id/results/hold')
  @HttpCode(HttpStatus.OK)
  hold(@Param('id', ParseUUIDPipe) id: string) {
    return this.results.hold(id);
  }
}
