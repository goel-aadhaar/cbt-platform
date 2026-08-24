import { validateEnv } from './env.schema';

/**
 * The environment validator is the only thing standing between a half-filled
 * .env and a production box that boots into a broken state, so its edge cases
 * are worth pinning down — particularly the ones that decide whether the app
 * starts at all.
 */
describe('validateEnv', () => {
  /** The smallest env the API will actually boot on. */
  const base = () => ({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://u:p@db.example.neon.tech/app?sslmode=require',
    JWT_PRIVATE_KEY: 'base64-private',
    JWT_PUBLIC_KEY: 'base64-public',
    FRONTEND_URL: 'https://app.example.com',
  });

  /** The same env with one key left out, for the "missing key" cases. */
  const without = (key: keyof ReturnType<typeof base>) => {
    const env: Record<string, unknown> = { ...base() };
    delete env[key];
    return env;
  };

  it('accepts a minimal valid environment', () => {
    const env = validateEnv(base());
    expect(env.PORT).toBe(4000);
    expect(env.THROTTLE_LIMIT).toBe(120);
  });

  /**
   * `.env.example` ships every optional setting as a bare `KEY=` line, and a
   * dotenv file cannot express "unset" any other way. Before this was handled,
   * copying the template verbatim produced `AWS_SES_FROM_EMAIL: Invalid email
   * address` and the API refused to start — on a variable left blank on
   * purpose.
   */
  it('treats a blank optional variable as absent, not as an invalid value', () => {
    const env = validateEnv({
      ...base(),
      AWS_SES_FROM_EMAIL: '',
      AWS_SES_FROM_NAME: '',
      LOG_LEVEL: '',
    });

    expect(env.AWS_SES_FROM_EMAIL).toBeUndefined();
    expect(env.AWS_SES_FROM_NAME).toBeUndefined();
    expect(env.LOG_LEVEL).toBeUndefined();
  });

  it('still rejects a non-blank value that is genuinely malformed', () => {
    expect(() =>
      validateEnv({ ...base(), AWS_SES_FROM_EMAIL: 'not-an-address' }),
    ).toThrow(/AWS_SES_FROM_EMAIL/);

    expect(() => validateEnv({ ...base(), LOG_LEVEL: 'chatty' })).toThrow(
      /LOG_LEVEL/,
    );
  });

  it('refuses to start when a required key is missing', () => {
    expect(() => validateEnv(without('JWT_PRIVATE_KEY'))).toThrow(
      /JWT_PRIVATE_KEY/,
    );
  });

  it('rejects a connection string that is not PostgreSQL', () => {
    expect(() =>
      validateEnv({ ...base(), DATABASE_URL: 'mysql://u:p@host/db' }),
    ).toThrow(/DATABASE_URL/);
  });

  describe('the CHANGE_ME placeholder', () => {
    it('is rejected in production, including on optional keys', () => {
      // CORS_ORIGINS is optional, so the schema alone would let this through
      // and the failure would surface much later as every browser request
      // being blocked.
      expect(() =>
        validateEnv({ ...base(), CORS_ORIGINS: 'CHANGE_ME' }),
      ).toThrow(/CORS_ORIGINS/);
    });

    it('is tolerated outside production, where part-filled copies are normal', () => {
      expect(() =>
        validateEnv({
          ...base(),
          NODE_ENV: 'development',
          CORS_ORIGINS: 'CHANGE_ME',
        }),
      ).not.toThrow();
    });
  });

  it('defaults FRONTEND_URL rather than failing, so dev needs no config', () => {
    const env = validateEnv({
      ...without('FRONTEND_URL'),
      NODE_ENV: 'development',
    });
    expect(env.FRONTEND_URL).toBe('http://localhost:3000');
  });
});
