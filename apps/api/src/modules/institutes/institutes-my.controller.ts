import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role, type AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdateMyInstituteDto } from './dto/update-my-institute.dto';
import { InstitutesService } from './institutes.service';

/**
 * Self-service route for the institute's own members.
 *
 * The superadmin-only `InstitutesController` is for cross-tenant work; this
 * controller is the matching surface INSIDE a tenant. It is reachable by
 * any signed-in role that has an `instituteId` on their session — ADMIN,
 * TEACHER, and (for the read side) STUDENT. The actor's institute is
 * determined by the JWT, NOT a path parameter, so a probe with another
 * tenant's id is structurally impossible.
 */
@ApiTags('institutes')
@ApiBearerAuth()
@Roles('ADMIN', 'TEACHER', 'STUDENT')
@Controller({ path: 'institutes/me', version: '1' })
export class MyInstituteController {
  constructor(private readonly institutes: InstitutesService) {}

  /** GET /institutes/me — the actor's own institute. */
  @Get()
  me(@CurrentUser() user: AuthUser) {
    return this.institutes.myInstitute(user.instituteId);
  }

  /**
   * PATCH /institutes/me — rename the actor's own institute, or set/clear
   * its logo (§ institute branding). ADMIN-only override: the class-level
   * gate also lets TEACHER/STUDENT read this controller, but only an admin
   * edits their institute's identity.
   */
  @Patch()
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateMyInstituteDto) {
    return this.institutes.updateMyInstitute(user.instituteId, dto);
  }
}
