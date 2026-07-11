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
import { BatchesService } from './batches.service';
import { CreateBatchDto } from './dto/create-batch.dto';
import { UpdateBatchDto } from './dto/update-batch.dto';

@ApiTags('batches')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller({ path: 'batches', version: '1' })
export class BatchesController {
  constructor(private readonly batches: BatchesService) {}

  @Post()
  create(@Body() dto: CreateBatchDto) {
    return this.batches.create(dto);
  }

  @Get()
  findAll(
    @Query('classId', new ParseUUIDPipe({ optional: true })) classId?: string,
  ) {
    return this.batches.findAll(classId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.batches.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBatchDto) {
    return this.batches.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.batches.remove(id);
  }
}
