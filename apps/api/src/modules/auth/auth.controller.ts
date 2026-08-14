import {
  Body,
  Controller,
  UnauthorizedException,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import type { LoginResult } from './auth.service';
import { AuthService } from './auth.service';
import type { AuthUser } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import {
  GoogleLoginDto,
  LoginDto,
  SelectRoleDto,
  StudentLoginDto,
} from './dto/login.dto';
import { ChangePasswordDto, UpdateMyProfileDto } from './dto/profile.dto';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async loginStaff(@Body() dto: LoginDto, @Req() req: Request) {
    const result = await this.auth.loginStaff(
      dto.email,
      dto.password,
      this.meta(req),
    );
    this.attachActor(req, result);
    return result;
  }

  @Public()
  @Post('student/login')
  @HttpCode(HttpStatus.OK)
  async loginStudent(@Body() dto: StudentLoginDto, @Req() req: Request) {
    const result = await this.auth.loginStudent(
      dto.instituteSlug,
      dto.rollNumber,
      dto.password,
      this.meta(req),
    );
    this.attachActor(req, result);
    return result;
  }

  /**
   * Platform owner sign-in. Separate from the institute login on purpose: the
   * account that can cross tenants does not share a door with the accounts that
   * cannot, and /auth/login refuses SUPERADMIN even with valid credentials.
   */
  @Public()
  @Post('platform/login')
  @HttpCode(HttpStatus.OK)
  async loginPlatform(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.loginPlatform(dto.email, dto.password, this.meta(req));
  }

  /**
   * Staff sign-in with Google. The role and institute come from the existing
   * account matched by verified email — never from the request.
   */
  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  async loginWithGoogle(@Body() dto: GoogleLoginDto, @Req() req: Request) {
    return this.auth.loginStaffWithGoogle(dto.credential, this.meta(req));
  }

  /**
   * Choose which role this session acts as, when the account holds more than
   * one. Until this is called the session can do nothing else — the guard
   * refuses every other route with ROLE_NOT_SELECTED.
   *
   * @Public because the session has no usable role yet, which is exactly what
   * this fixes. The session id comes from the bearer token and the pick is
   * validated against the account's own roles, so being public grants nothing.
   */
  /**
   * Choose which role this session acts as, when the account holds more than
   * one. Until this is called the session can do nothing else — the guard
   * refuses every other route with ROLE_NOT_SELECTED.
   *
   * @Public because the session has no usable role yet, which is exactly what
   * this fixes. The session id comes from the bearer token and the pick is
   * validated against the account's own roles, so being public grants nothing.
   */
  @Public()
  @Post('session/role')
  @HttpCode(HttpStatus.OK)
  async selectRole(@Body() dto: SelectRoleDto, @Req() req: Request) {
    const sessionId = await this.sessionIdFromRequest(req);
    return this.auth.selectRole(sessionId, dto.role);
  }

  /**
   * Switch the role this session is acting as, without re-authenticating.
   *
   * The chooser (`session/role`) refuses once a session is already committed,
   * which is the right rule at login but the wrong one for the in-console
   * switcher. The dedup is by URL: /auth/session/switch is the only endpoint
   * that rewrites the active role on a live session.
   *
   * Authorisation: the pick is validated against the account's own roles, so
   * the in-console switcher cannot be used to gain a role the account does
   * not hold. It does NOT validate against the current active role — switching
   * away is the point.
   */
  @Public()
  @Post('session/switch')
  @HttpCode(HttpStatus.OK)
  async switchRole(@Body() dto: SelectRoleDto, @Req() req: Request) {
    const sessionId = await this.sessionIdFromRequest(req);
    return this.auth.switchRole(sessionId, dto.role);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  async logout(@CurrentUser() user: AuthUser): Promise<{ success: boolean }> {
    await this.auth.logout(user.sessionId);
    return { success: true };
  }

  @Get('me')
  @ApiBearerAuth()
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId);
  }

  /**
   * Full profile for the signed-in user — identity plus, for a candidate, the
   * roll number, batch and programme that live on other tables.
   */
  @Get('me/profile')
  @ApiOkResponse({ description: "The caller's own profile." })
  myProfile(@CurrentUser() user: AuthUser) {
    return this.auth.myProfile(user.userId);
  }

  /** Self-service edits. Email and roll number are not changeable here. */
  @Patch('me/profile')
  updateMyProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateMyProfileDto,
  ) {
    return this.auth.updateMyProfile(user.userId, dto);
  }

  /**
   * Change your own password. Requires the current one; revokes every OTHER
   * session so a stolen password cannot keep an intruder signed in.
   */
  @Post('me/password')
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(
      user.userId,
      user.sessionId,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  /**
   * Read the session id out of the bearer token for a @Public route.
   *
   * Verifies the signature — an unsigned or tampered token names no session —
   * but deliberately does not check the session's state; selectRole does that,
   * because a session with no role yet is precisely the case being served.
   */
  private async sessionIdFromRequest(req: Request): Promise<string> {
    const header = req.headers.authorization;
    const [scheme, token] = header?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Missing bearer token');
    }
    try {
      const payload = await this.jwt.verifyAsync<{ sid: string }>(token);
      return payload.sid;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private meta(req: Request): { userAgent?: string; ip?: string } {
    return { userAgent: req.headers['user-agent'], ip: req.ip };
  }

  /**
   * Attach the just-authenticated identity to the request so the audit
   * interceptor records WHO logged in (§2.13). Login routes are @Public, so
   * JwtAuthGuard never populates `request.user` — without this, the audit entry
   * would have a null actor.
   */
  private attachActor(req: Request, result: LoginResult): void {
    (req as Request & { user?: AuthUser }).user = {
      userId: result.user.id,
      // No role chosen yet when the account holds several — record the first
      // selectable one so the audit entry still names a plausible actor rather
      // than dropping the login from the log entirely (§2.13).
      role: result.user.role ?? result.selectableRoles[0],
      roles: result.user.roles,
      instituteId: result.user.instituteId,
      sessionId: '',
    };
  }
}
