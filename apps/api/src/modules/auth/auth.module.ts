import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import type { JwtModuleOptions } from '@nestjs/jwt';

import type { AuthConfig } from '../../config/auth.config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { InvitationController } from './invitation/invitation.controller';
import { InvitationService } from './invitation/invitation.service';
import { RolesGuard } from './guards/roles.guard';
import { ConsoleMailService } from './mail/console-mail.service';
import { FailoverMailService } from './mail/failover-mail.service';
import { MailService } from './mail/mail.service';
import { ResendMailService } from './mail/resend-mail.service';
import { SesMailService } from './mail/ses-mail.service';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';
import { TeacherScopeService } from './tenant/teacher-scope.service';
import { TenantContextInterceptor } from './tenant/tenant-context.interceptor';
import { TenantContextService } from './tenant/tenant-context.service';

/**
 * Authentication module.
 *
 * Increment A: RS256 JWT, argon2 password hashing, mail port.
 * Increment B: global JwtAuthGuard (stateful) + RolesGuard (RBAC), plus the
 *   per-request tenant context (AsyncLocalStorage).
 *
 * Guards + interceptor are registered globally via APP_* — secure by default;
 * routes opt out with @Public(). Coming next: invitation + login flows.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => {
        const auth = config.getOrThrow<AuthConfig>('auth');
        return {
          // RS256: private key signs, public key verifies.
          privateKey: auth.jwtPrivateKey,
          publicKey: auth.jwtPublicKey,
          signOptions: {
            algorithm: 'RS256',
            // '1d' etc.; jsonwebtoken's StringValue type can't be narrowed from
            // a runtime string, so assert the SignOptions shape.
            expiresIn: auth.jwtExpiresIn,
          } as JwtModuleOptions['signOptions'],
          verifyOptions: { algorithms: ['RS256'] },
        };
      },
    }),
  ],
  controllers: [AuthController, InvitationController],
  providers: [
    AuthService,
    InvitationService,
    PasswordService,
    OtpService,
    TenantContextService,
    TeacherScopeService,
    ConsoleMailService,
    SesMailService,
    ResendMailService,
    /**
     * Mail port (§2.6). Resend is PRIMARY, SES is SECONDARY, console logging
     * is the dev fallback until either is configured — matching MediaModule's
     * "S3 the moment a bucket is set" pattern. When BOTH are configured, a
     * failed Resend send is retried live against SES (`FailoverMailService`)
     * rather than the choice being made once at boot and never revisited.
     */
    {
      provide: MailService,
      inject: [
        ConfigService,
        ConsoleMailService,
        SesMailService,
        ResendMailService,
      ],
      useFactory: (
        config: ConfigService,
        console: ConsoleMailService,
        ses: SesMailService,
        resend: ResendMailService,
      ): MailService => {
        const auth = config.getOrThrow<AuthConfig>('auth');
        const resendReady = Boolean(auth.resendApiKey && auth.resendFromEmail);
        const sesReady = Boolean(auth.sesFromEmail);
        if (resendReady && sesReady) {
          return new FailoverMailService(resend, ses);
        }
        if (resendReady) return resend;
        if (sesReady) return ses;
        return console;
      },
    },
    // Order matters: authenticate (JwtAuthGuard) before authorize (RolesGuard).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
  exports: [
    PasswordService,
    MailService,
    TenantContextService,
    TeacherScopeService,
    InvitationService,
    JwtModule,
  ],
})
export class AuthModule {}
