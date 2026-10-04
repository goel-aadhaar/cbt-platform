import {
  type ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import {
  STAFF_LOGIN_FIELDS,
  STUDENT_LOGIN_FIELDS,
  type LoginField,
} from '@drsk/shared';
import { getMetadataStorage } from 'class-validator';

import { LoginDto, StudentLoginDto } from './login.dto';

/**
 * The login page, the credentials email and the real endpoint must agree on
 * which fields a sign-in takes. The page and the email both read
 * @drsk/shared; these tests tie the endpoint's DTOs to the same list, and
 * check that what a 400 says is what the student actually sees on screen.
 */

/** Same options as the global pipe in app.module.ts. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

async function messagesFor(
  metatype: ArgumentMetadata['metatype'],
  body: Record<string, unknown>,
): Promise<string[]> {
  try {
    await pipe.transform(body, { type: 'body', metatype });
  } catch (err) {
    expect(err).toBeInstanceOf(BadRequestException);
    const response = (err as BadRequestException).getResponse() as {
      message: string[];
    };
    return response.message;
  }
  return [];
}

function validatedProperties(target: new () => object): string[] {
  const names = getMetadataStorage()
    .getTargetValidationMetadatas(target, '', true, false)
    .map((m) => m.propertyName);
  return [...new Set(names)].sort();
}

const keys = (fields: readonly LoginField[]) => fields.map((f) => f.key).sort();

describe('login DTOs', () => {
  describe('match the shared sign-in field definitions', () => {
    it('StudentLoginDto validates exactly the student form fields', () => {
      expect(validatedProperties(StudentLoginDto)).toEqual(
        keys(STUDENT_LOGIN_FIELDS),
      );
      expect(keys(STUDENT_LOGIN_FIELDS)).toEqual([
        'instituteSlug',
        'password',
        'rollNumber',
      ]);
    });

    it('LoginDto validates exactly the staff form fields', () => {
      expect(validatedProperties(LoginDto)).toEqual(keys(STAFF_LOGIN_FIELDS));
    });

    it('accepts a body built from the student field keys, and nothing else', async () => {
      const body = Object.fromEntries(
        STUDENT_LOGIN_FIELDS.map((f) => [f.key, 'x']),
      );
      expect(await messagesFor(StudentLoginDto, body)).toEqual([]);
      expect(
        await messagesFor(StudentLoginDto, { ...body, email: 'a@b.co' }),
      ).toHaveLength(1);
    });
  });

  describe('student validation messages', () => {
    it('name each empty field by its on-screen label, once', async () => {
      const messages = await messagesFor(StudentLoginDto, {
        instituteSlug: '',
        rollNumber: '',
        password: '',
      });
      expect(messages).toEqual(
        STUDENT_LOGIN_FIELDS.map((f) => `${f.label} is required`),
      );
    });

    it('say the same for a missing field, without repeating it', async () => {
      const messages = await messagesFor(StudentLoginDto, {
        instituteSlug: 'drsk-kota',
        password: 'secret',
      });
      expect(messages).toEqual(['Registration Number is required']);
    });

    it('never expose a request field name', async () => {
      const messages = await messagesFor(StudentLoginDto, {});
      for (const message of messages) {
        expect(message).not.toMatch(/rollNumber|instituteSlug|roll/i);
      }
    });

    it('still accept what the old IsString + MinLength(1) accepted', async () => {
      expect(
        await messagesFor(StudentLoginDto, {
          instituteSlug: 'drsk-kota',
          rollNumber: '2612340001',
          password: ' ',
        }),
      ).toEqual([]);
    });
  });

  describe('staff validation messages', () => {
    it('ask for an Email that is missing', async () => {
      expect(await messagesFor(LoginDto, { password: 'secret' })).toEqual([
        'Email is required',
      ]);
      expect(
        await messagesFor(LoginDto, { email: '', password: 'secret' }),
      ).toEqual(['Email is required']);
    });

    it('reject a malformed Email in words the form uses', async () => {
      expect(
        await messagesFor(LoginDto, { email: 'nope', password: 'secret' }),
      ).toEqual(['Email must be a valid email address']);
    });

    it('ask for a missing Password', async () => {
      expect(
        await messagesFor(LoginDto, { email: 'a@b.co', password: '' }),
      ).toEqual(['Password is required']);
    });
  });
});
