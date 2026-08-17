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

  /**
   * SUPERADMIN seeds any institute with its first administrator; ADMIN can
   * also add a fellow administrator, scoped to their own institute (enforced
   * in the service — never trust `dto.instituteId` for an ADMIN caller).
   */
  @Post('admin')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @ApiBearerAuth()
  inviteAdmin(@CurrentUser() user: AuthUser, @Body() dto: InviteAdminDto) {
    return this.invitations.inviteAdmin(user, dto);
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

  /**
   * Public: invitee completes their account with the emailed token.
   *
   * Deliberately NOT on the tighter login budget: a token is 32 random bytes
   * (brute-forcing it is computationally infeasible regardless of any
   * reasonable rate limit, unlike a password or a 6-digit OTP), and a bulk
   * CSV import can legitimately produce dozens of invites accepted from the
   * same institute network in a short window — the exact NAT-sharing case
   * CandidateThrottlerGuard exists to not punish. Still covered by the
   * app-wide default (120/min).
   */
  @Public()
  @Post('accept')
  accept(@Body() dto: AcceptInviteDto) {
    return this.invitations.accept(dto.token, dto.password);
  }
}
