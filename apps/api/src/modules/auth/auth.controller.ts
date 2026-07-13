import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import type { LoginResult } from './auth.service';
import { AuthService } from './auth.service';
import type { AuthUser } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto, StudentLoginDto } from './dto/login.dto';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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
      role: result.user.role,
      instituteId: result.user.instituteId,
      sessionId: '',
    };
  }
}
