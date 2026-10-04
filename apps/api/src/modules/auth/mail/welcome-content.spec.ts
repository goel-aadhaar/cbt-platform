import { STAFF_LOGIN_FIELDS, STUDENT_LOGIN_FIELDS } from '@drsk/shared';

import { welcomeContent } from './mail-content';

/**
 * What a new account is told about signing in again.
 *
 * This email is the only place a student's Institute ID and Registration
 * Number are ever written down, so it has to name them exactly as the sign-in
 * form does — same fields, same order, same words — and nothing else. Both
 * sides read their labels from @drsk/shared, which is what these tests pin.
 */

const base = {
  to: 'asha@example.com',
  name: 'Asha Rao',
  loginUrl: 'https://codonmind.in/login?as=student',
};

const student = () =>
  welcomeContent({
    ...base,
    role: 'STUDENT',
    institute: 'Dr S K Institute',
    instituteSlug: 'drsk-kota',
    rollNumber: '2612340001',
  });

const teacher = () =>
  welcomeContent({
    ...base,
    to: 'teacher@example.com',
    role: 'TEACHER',
    institute: 'Dr S K Institute',
    loginUrl: 'https://codonmind.in/login?as=staff',
  });

/** The `Label: value` lines of the text part, in order. */
function credentialLines(text: string, labels: readonly string[]): string[] {
  return text
    .split('\n')
    .filter((line) => labels.some((label) => line.startsWith(`${label}: `)));
}

function expectInOrder(haystack: string, needles: string[]): void {
  const positions = needles.map((needle) => haystack.indexOf(needle));
  positions.forEach((position, i) =>
    expect({ needle: needles[i], found: position >= 0 }).toEqual({
      needle: needles[i],
      found: true,
    }),
  );
  expect([...positions].sort((a, b) => a - b)).toEqual(positions);
}

describe('welcome email', () => {
  describe('for a student', () => {
    const studentLabels = STUDENT_LOGIN_FIELDS.map((f) => f.label);

    it('lists exactly the student sign-in fields, in the form’s order', () => {
      const mail = student();

      const lines = credentialLines(mail.text, [
        ...studentLabels,
        ...STAFF_LOGIN_FIELDS.map((f) => f.label),
      ]);
      expect(lines).toEqual([
        'Institute ID: drsk-kota',
        'Registration Number: 2612340001',
        'Password: The password you set when you accepted your invitation',
      ]);
      expect(lines.map((line) => line.split(': ')[0])).toEqual(studentLabels);
    });

    it('shows the same labels and values, in order, in the HTML part', () => {
      const mail = student();
      expectInOrder(mail.html, [
        '>Institute ID</td>',
        '>drsk-kota</td>',
        '>Registration Number</td>',
        '>2612340001</td>',
        '>Password</td>',
      ]);
    });

    it('does not offer Email as a credential — students do not sign in with it', () => {
      const mail = student();
      expect(mail.text).not.toMatch(/^Email:/m);
      expect(mail.html).not.toContain('>Email</td>');
    });

    it('uses none of the retired names for the identifier', () => {
      const mail = student();
      for (const part of [mail.subject, mail.html, mail.text]) {
        expect(part).not.toMatch(/roll/i);
        expect(part).not.toMatch(/candidate id/i);
        expect(part).not.toMatch(/application number/i);
      }
    });

    it('names the institute in the introduction, not as a sign-in field', () => {
      const mail = student();
      expect(mail.text).toContain(
        'Your account at Dr S K Institute is now active.',
      );
      expect(mail.text).not.toMatch(/^Institute:/m);
    });

    it('does not mention a verification code — students are not sent one', () => {
      expect(student().text).not.toMatch(/verification code/i);
    });
  });

  describe('for staff', () => {
    it('lists exactly the staff sign-in fields: Email and Password', () => {
      const mail = teacher();
      const lines = credentialLines(mail.text, [
        ...STUDENT_LOGIN_FIELDS.map((f) => f.label),
        ...STAFF_LOGIN_FIELDS.map((f) => f.label),
      ]);
      expect(lines).toEqual([
        'Email: teacher@example.com',
        'Password: The password you set when you accepted your invitation',
      ]);
      expect(mail.html).not.toContain('Institute ID');
      expect(mail.html).not.toContain('Registration Number');
    });

    it('warns about the emailed 6-digit code the staff form asks for next', () => {
      const mail = teacher();
      expect(mail.text).toContain('6-digit verification code');
      expect(mail.html).toContain('6-digit verification code');
    });
  });

  describe('the password', () => {
    it('is described as the one they set, never as issued by the platform', () => {
      for (const mail of [student(), teacher()]) {
        expect(mail.text).toContain(
          'Password: The password you set when you accepted your invitation',
        );
        expect(mail.text).toContain(
          'this email does not include your password',
        );
        for (const part of [mail.html, mail.text]) {
          expect(part).not.toMatch(/temporary|generated|reset/i);
        }
      }
    });

    it('is not rendered as a value to copy', () => {
      // Values are monospace; the password row is prose.
      const html = student().html;
      const passwordCell = html.slice(html.indexOf('>Password</td>'));
      expect(passwordCell.slice(0, 200)).not.toContain('monospace');
    });
  });

  describe('copy-friendly values', () => {
    it('sets each literal value alone in a monospace cell', () => {
      const html = student().html;
      expect(html).toMatch(/monospace[^>]*>drsk-kota<\/td>/);
      expect(html).toMatch(/monospace[^>]*>2612340001<\/td>/);
    });
  });

  describe('escaping', () => {
    it('escapes every value rather than trusting it into the markup', () => {
      const mail = welcomeContent({
        ...base,
        name: '<b>Asha</b>',
        role: 'STUDENT',
        institute: '<img src=x onerror=alert(1)>',
        instituteSlug: '<script>alert(1)</script>',
        rollNumber: '"2612&0001"',
      });
      expect(mail.html).not.toContain('<script>');
      expect(mail.html).not.toContain('<img');
      expect(mail.html).not.toContain('<b>Asha');
      expect(mail.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(mail.html).toContain('&quot;2612&amp;0001&quot;');
      // The text part is plain text: shown as typed.
      expect(mail.text).toContain('Registration Number: "2612&0001"');
    });

    it('escapes a staff email address', () => {
      const mail = welcomeContent({
        ...base,
        to: 'a<b>@example.com',
        role: 'ADMIN',
      });
      expect(mail.html).toContain('a&lt;b&gt;@example.com');
      expect(mail.html).not.toContain('a<b>@example.com');
    });
  });
});
