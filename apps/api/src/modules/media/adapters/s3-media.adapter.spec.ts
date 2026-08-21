import type { ConfigService } from '@nestjs/config';

import { S3MediaAdapter } from './s3-media.adapter';

/**
 * How a question diagram reaches a browser decides who is allowed to see it.
 *
 * A raw bucket URL resolves only for a public-read object, so handing one out
 * either breaks every image (private bucket, the correct setting) or publishes
 * every exam figure to anyone holding the link — bypassing the tenant and
 * enrolment checks on `GET /media/file/:key` entirely. Configuring storage must
 * not silently decide that.
 */
describe('S3MediaAdapter.publicUrl', () => {
  const build = (env: Record<string, string | undefined>) =>
    new S3MediaAdapter({
      get: (k: string) => env[k],
    } as unknown as ConfigService);

  const KEY = 'inst-1/abc.png';

  it('keeps media behind the API when only a bucket is configured', () => {
    const adapter = build({
      AWS_S3_BUCKET: 'drsk-media',
      AWS_REGION: 'ap-south-1',
    });

    // null means "the API serves this", which is where the auth checks live.
    expect(adapter.publicUrl(KEY)).toBeNull();
  });

  it('never hands out a raw bucket URL', () => {
    const adapter = build({ AWS_S3_BUCKET: 'drsk-media' });

    // Coerced, because null is the desired answer here — the assertion is
    // about what must never come back, not about the shape of what does.
    expect(String(adapter.publicUrl(KEY) ?? '')).not.toMatch(
      /s3[.-].*amazonaws\.com/,
    );
  });

  it('uses a CDN only when one was explicitly configured', () => {
    const adapter = build({
      AWS_S3_BUCKET: 'drsk-media',
      MEDIA_CDN_URL: 'https://cdn.example.com/',
    });

    // The trailing slash on the configured origin must not double up.
    expect(adapter.publicUrl(KEY)).toBe(`https://cdn.example.com/${KEY}`);
  });

  it('serves through the API when nothing is configured at all', () => {
    expect(build({}).publicUrl(KEY)).toBeNull();
  });
});
