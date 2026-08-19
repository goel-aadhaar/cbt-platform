import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

/**
 * Invite an administrator. Two callers, two scopes:
 *   - SUPERADMIN must name the institute (`instituteId`) — a platform owner
 *     has no institute of their own to default to.
 *   - ADMIN invites into their own institute, taken from their session, so
 *     `instituteId` is not read from the body for them even if present — an
 *     admin cannot use this to reach into another tenant.
 */
export class InviteAdminDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsUUID()
  instituteId?: string;
}

/**
 * Admin invites a teacher (into the admin's own institute). `batchIds` is
 * optional — a teacher can be invited with no assignment yet and given one
 * later via `PUT /staff/:id/batches`.
 */
export class InviteTeacherDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  batchIds?: string[];
}

/**
 * Admin invites a student (into the admin's own institute). No rollNumber
 * field — it's always server-generated ({yy}{institute code}{sequence}),
 * never caller-supplied.
 */
export class InviteStudentDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  email: string;

  @IsUUID()
  batchId: string;
}

/** Invitee completes their account via the emailed link. */
export class AcceptInviteDto {
  @IsString()
  @MinLength(1)
  token: string;

  @IsString()
  @MinLength(8)
  password: string;
}
