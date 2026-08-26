import { FailoverMailService } from './failover-mail.service';
import { MailService, OtpEmail } from './mail.service';
import { ResendMailService } from './resend-mail.service';

/**
 * Resend adapter + primary/secondary failover (§2.6). The SES adapter's own
 * content (subject/HTML/text) is exercised indirectly through these same
 * `mail-content` builders and isn't re-tested here — this file is about the
 * two things that are actually new: the Resend HTTP contract, and the
 * fallback behavior when the primary provider fails.
 */
describe('ResendMailService', () => {
  const OTP: OtpEmail = {
    to: 'student@example.com',
    name: 'Priya',
    code: '123456',
    expiresInMinutes: 5,
  };

  function build() {
    const config = {
      getOrThrow: () => ({
        resendApiKey: 're_test_key',
        resendFromEmail: 'hello@codonmind.in',
        resendFromName: 'Codonmind Nexus',
        contactEmail: 'hello@codonmind.in',
      }),
    };
    const service = new ResendMailService(config as never);
    return service;
  }

  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('POSTs to the Resend transactional email endpoint with the documented shape', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'abc-123' }),
    });
    global.fetch = fetchMock as never;

    await build().sendLoginOtp(OTP);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer re_test_key');
    expect(headers['content-type']).toBe('application/json');

    const body = JSON.parse(init.body as string) as {
      from: string;
      to: string;
      subject: string;
      html: string;
      text: string;
    };
    expect(body.from).toBe('Codonmind Nexus <hello@codonmind.in>');
    expect(body.to).toBe('student@example.com');
    expect(body.subject).toContain('123456');
    expect(body.html).toContain('123456');
    expect(body.text).toContain('123456');
  });

  it('sets reply_to to the visitor for a contact-form message', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'abc-123' }),
    });
    global.fetch = fetchMock as never;

    await build().sendContactMessage({
      name: 'Visitor',
      email: 'visitor@example.com',
      message: 'Tell me more about the platform.',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      to: string;
      reply_to: string;
    };
    // The contact inbox, not the sender identity, is the destination.
    expect(body.to).toBe('hello@codonmind.in');
    expect(body.reply_to).toBe('visitor@example.com');
  });

  it('surfaces the { statusCode, name, message } error body Resend returns on a rejected send', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () =>
        Promise.resolve({
          statusCode: 401,
          name: 'missing_api_key',
          message: 'Missing API key in the authorization header',
        }),
    });
    global.fetch = fetchMock as never;

    await expect(build().sendLoginOtp(OTP)).rejects.toThrow(/Missing API key/);
  });
});

describe('FailoverMailService', () => {
  /**
   * Returns the service AND the bare jest.fn() driving it — asserting on
   * the free-standing function (rather than `service.sendLoginOtp`) avoids
   * the "unbound method" lint trap of reading a method off an object as a
   * value.
   */
  function stub(behavior: 'succeed' | 'fail') {
    const fn =
      behavior === 'succeed'
        ? jest.fn().mockResolvedValue(undefined)
        : jest.fn().mockRejectedValue(new Error('provider down'));
    const service = {
      sendInvitation: fn,
      sendLoginOtp: fn,
      sendWelcome: fn,
      sendContactMessage: fn,
    } as unknown as MailService;
    return { service, fn };
  }

  const OTP: OtpEmail = {
    to: 'student@example.com',
    name: 'Priya',
    code: '123456',
    expiresInMinutes: 5,
  };

  it('sends through the primary only when it succeeds', async () => {
    const primary = stub('succeed');
    const secondary = stub('succeed');
    await new FailoverMailService(
      primary.service,
      secondary.service,
    ).sendLoginOtp(OTP);
    expect(primary.fn).toHaveBeenCalledTimes(1);
    expect(secondary.fn).not.toHaveBeenCalled();
  });

  it('falls back to the secondary when the primary throws', async () => {
    const primary = stub('fail');
    const secondary = stub('succeed');
    await expect(
      new FailoverMailService(primary.service, secondary.service).sendLoginOtp(
        OTP,
      ),
    ).resolves.toBeUndefined();
    expect(primary.fn).toHaveBeenCalledTimes(1);
    expect(secondary.fn).toHaveBeenCalledTimes(1);
  });

  it('propagates the secondary error when both providers fail', async () => {
    const primary = stub('fail');
    const secondary = stub('fail');
    await expect(
      new FailoverMailService(primary.service, secondary.service).sendLoginOtp(
        OTP,
      ),
    ).rejects.toThrow('provider down');
  });
});
