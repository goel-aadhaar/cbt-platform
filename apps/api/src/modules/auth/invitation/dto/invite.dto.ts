import { IsEmail, IsString, IsUUID, MinLength } from 'class-validator';

/** Superadmin invites an admin to a specific institute. */
export class InviteAdminDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  email: string;

  @IsUUID()
  instituteId: string;
}

/** Admin invites a teacher (into the admin's own institute). */
export class InviteTeacherDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  email: string;
}

/** Admin invites a student (into the admin's own institute). */
export class InviteStudentDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  rollNumber: string;

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
