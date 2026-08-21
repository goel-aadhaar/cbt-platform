import { PasswordService } from './password.service';

/**
 * The failure this guards against is invisible on screen: a password copied
 * out of an email or a chat message arrives with a trailing space, sign-in
 * refuses it as "Invalid credentials", and the field looks perfectly correct.
 */
describe('PasswordService', () => {
  const passwords = new PasswordService();
  const PLAIN = 'Cm-8vtpPdzUCG-71';

  it('accepts a password that picked up whitespace in transit', async () => {
    const hashed = await passwords.hash(PLAIN);

    await expect(passwords.verify(hashed, `${PLAIN} `)).resolves.toBe(true);
    await expect(passwords.verify(hashed, ` ${PLAIN}`)).resolves.toBe(true);
    await expect(passwords.verify(hashed, `${PLAIN}\n`)).resolves.toBe(true);
  });

  it('lets a password set with stray whitespace be typed back cleanly', async () => {
    // The half that makes trimming safe: normalising on the way in as well as
    // on the way out means the two can never disagree.
    const hashed = await passwords.hash(` ${PLAIN} `);

    await expect(passwords.verify(hashed, PLAIN)).resolves.toBe(true);
  });

  it('still refuses a genuinely wrong password', async () => {
    const hashed = await passwords.hash(PLAIN);

    await expect(passwords.verify(hashed, 'Cm-8vtpPdzUCG-72')).resolves.toBe(
      false,
    );
    await expect(passwords.verify(hashed, PLAIN.toLowerCase())).resolves.toBe(
      false,
    );
    // Whitespace is stripped from the ends only — never from the middle.
    await expect(passwords.verify(hashed, 'Cm-8vtp PdzUCG-71')).resolves.toBe(
      false,
    );
  });
});
