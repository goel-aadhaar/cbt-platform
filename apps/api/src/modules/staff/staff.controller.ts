import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { QueryStaffDto } from './dto/query-staff.dto';
import { SetStaffBatchesDto } from './dto/set-staff-batches.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { StaffService } from './staff.service';

@ApiTags('staff')
@ApiBearerAuth()
@Roles(Role.TEACHER, Role.ADMIN)
@Controller({ path: 'staff', version: '1' })
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  /**
   * Staff roster. Teachers are created through `POST /invitations/teacher`;
   * this is the read side the console needs. TEACHERs may read it too — they
   * must pick an admin as the reviewer when submitting an exam for approval —
   * and it exposes nothing beyond institute colleagues' names/emails.
   */
  @Get()
  findAll(@Query() query: QueryStaffDto) {
    return this.staff.findAll(query);
  }

  /**
   * Self-service. Declared before `:id/batches` — Nest matches routes in
   * declaration order, same trick `/students/import` relies on ahead of
   * `/students/:id`.
   */
  @Get('me/batches')
  @Roles(Role.TEACHER)
  myBatches() {
    return this.staff.myBatches();
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.staff.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStaffDto) {
    return this.staff.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.staff.deactivate(id);
  }

  @Post(':id/reactivate')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  reactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.staff.reactivate(id);
  }

  @Post(':id/resend-invite')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  resendInvite(@Param('id', ParseUUIDPipe) id: string) {
    return this.staff.resendInvite(id);
  }

  @Get(':id/batches')
  @Roles(Role.ADMIN)
  getBatches(@Param('id', ParseUUIDPipe) id: string) {
    return this.staff.getBatches(id);
  }

  @Put(':id/batches')
  @Roles(Role.ADMIN)
  setBatches(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetStaffBatchesDto,
  ) {
    return this.staff.setBatches(id, dto.batchIds);
  }
}
