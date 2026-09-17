import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateDppDto, QueryDppDto, UpdateDppDto } from './dto/dpp.dto';
import { DppService } from './dpp.service';

/**
 * Daily Practice Papers (§ Product Structure) — the teacher/admin authoring
 * side. Created directly from the Question Bank: filter, tick, name it,
 * assign batches. No approval step — curating practice content, like the
 * practice library before it, is a teaching decision.
 */
@ApiTags('dpps')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.TEACHER)
@Controller({ path: 'dpps', version: '1' })
export class DppController {
  constructor(private readonly dpps: DppService) {}

  @Get()
  list(@Query() query: QueryDppDto) {
    return this.dpps.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.dpps.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateDppDto) {
    return this.dpps.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDppDto) {
    return this.dpps.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.dpps.remove(id);
  }
}

/** Student-facing: DPPs assigned to my own batch. */
@ApiTags('dpps')
@ApiBearerAuth()
@Roles(Role.STUDENT)
@Controller({ path: 'me/dpps', version: '1' })
export class MyDppController {
  constructor(private readonly dpps: DppService) {}

  @Get()
  listForMe() {
    return this.dpps.listForMe();
  }
}
