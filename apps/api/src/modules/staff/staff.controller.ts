import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { QueryStaffDto } from './dto/query-staff.dto';
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
}
