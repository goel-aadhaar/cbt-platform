import { welcomeContent } from './mail-content';

/**
 * What a new account is told about signing in again.
 *
 * The student form asks for three things — Institute ID, Candidate ID and a
 * password — and this email is the only place two of them are ever written
 * down. It listed the institute's NAME, which is not what the Institute ID
 * box accepts, so a student who closed the tab had no way back in without
 * asking their administrator.
 */

const base = {
  to: 'candidate@example.com',
  name: 'Asha Rao',
  loginUrl: 'https://codonmind.in/login',
};

describe('welcome email', () => {
  it('gives a student the Institute ID their sign-in form asks for', () => {
    const mail = welcomeContent({
      ...base,
      role: 'STUDENT',
      institute: 'Dr S K Institute',
      instituteSlug: 'drsk-kota',
      rollNumber: '2612340001',
    });

    // Labelled as the form labels it, so there is nothing to translate.
    expect(mail.html).toContain('Institute ID:');
    expect(mail.html).toContain('drsk-kota');
    expect(mail.text).toContain('Institute ID: drsk-kota');

    // And still carries the other two identifiers.
    expect(mail.text).toContain('Roll number: 2612340001');
    expect(mail.text).toContain('Institute: Dr S K Institute');
  });

  it('does not put an Institute ID in a staff welcome', () => {
    const mail = welcomeContent({
      ...base,
      role: 'TEACHER',
      institute: 'Dr S K Institute',
    });

    // Staff sign in with their email address; there is no field for this on
    // their screen, so printing it would only raise a question.
    expect(mail.html).not.toContain('Institute ID');
    expect(mail.text).not.toContain('Institute ID');
    expect(mail.text).toContain('Email: candidate@example.com');
  });

  it('never includes the password', () => {
    const mail = welcomeContent({
      ...base,
      role: 'STUDENT',
      institute: 'Dr S K Institute',
      instituteSlug: 'drsk-kota',
      rollNumber: '2612340001',
    });
    // Email is not a secure channel and they chose it themselves.
    expect(mail.text.toLowerCase()).not.toContain('password');
  });

  it('escapes an institute slug rather than trusting it into the markup', () => {
    const mail = welcomeContent({
      ...base,
      role: 'STUDENT',
      institute: 'Test',
      instituteSlug: '<script>alert(1)</script>',
      rollNumber: '2612340001',
    });
    expect(mail.html).not.toContain('<script>');
  });
});
