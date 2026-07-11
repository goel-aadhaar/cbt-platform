import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role } from '../auth.types';
import type { AuthUser } from '../auth.types';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';
import { Roles } from '../decorators/roles.decorator';
import {
  AcceptInviteDto,
  InviteAdminDto,
  InviteStudentDto,
  InviteTeacherDto,
} from './dto/invite.dto';
import { InvitationService } from './invitation.service';

@ApiTags('invitations')
@Controller({ path: 'invitations', version: '1' })
export class InvitationController {
  constructor(private readonly invitations: InvitationService) {}

  @Post('admin')
  @Roles(Role.SUPERADMIN)
  @ApiBearerAuth()
  inviteAdmin(@CurrentUser() user: AuthUser, @Body() dto: InviteAdminDto) {
    return this.invitations.inviteAdmin(user.userId, dto);
  }

  @Post('teacher')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  inviteTeacher(@CurrentUser() user: AuthUser, @Body() dto: InviteTeacherDto) {
    return this.invitations.inviteTeacher(user.instituteId, user.userId, dto);
  }

  @Post('student')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  inviteStudent(@CurrentUser() user: AuthUser, @Body() dto: InviteStudentDto) {
    return this.invitations.inviteStudent(user.instituteId, user.userId, dto);
  }

  /** Public: invitee completes their account with the emailed token. */
  @Public()
  @Post('accept')
  accept(@Body() dto: AcceptInviteDto) {
    return this.invitations.accept(dto.token, dto.password);
  }
}
