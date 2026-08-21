import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchService } from './search.service';

/**
 * Console-wide search across students, exams and questions.
 *
 * TEACHER is allowed because the teacher console has the same search box; the
 * service applies the caller's batch scope, so a teacher sees only the students
 * they teach. Students have no console and are not permitted here.
 */
@ApiTags('search')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.TEACHER)
@Controller({ path: 'search', version: '1' })
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  find(@Query() query: SearchQueryDto) {
    return this.search.search(query.q ?? '');
  }
}
