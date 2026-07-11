import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

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
}
