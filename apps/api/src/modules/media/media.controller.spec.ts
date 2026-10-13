/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/unbound-method -- async mocks; route metadata is read off the prototype */
import { HEADERS_METADATA } from '@nestjs/common/constants';

import { MediaController } from './media.controller';

function controllerReturning(row: Record<string, unknown>) {
  const media = {
    read: jest.fn(async () => ({ body: Buffer.from('x'), ...row })),
  };
  return new MediaController(media as never);
}

describe('GET /media/file/:key', () => {
  it('serves an image inline WITHOUT the uploaded file name', async () => {
    const file = await controllerReturning({
      kind: 'IMAGE',
      mimeType: 'image/png',
      fileName: 'answer-B.png',
    }).file('inst-1%2Fabc.png');
    const { disposition, type } = file.getHeaders();
    expect(disposition).toBe('inline');
    expect(disposition).not.toContain('answer-B');
    expect(type).toBe('image/png');
  });

  it('still hands a document over as an attachment with its name', async () => {
    const file = await controllerReturning({
      kind: 'DOCUMENT',
      mimeType: 'application/pdf',
      fileName: 'notes.pdf',
    }).file('inst-1%2Fabc.pdf');
    expect(file.getHeaders().disposition).toBe(
      'attachment; filename="notes.pdf"',
    );
  });

  it('is cacheable by the browser only, and exempt from the per-user throttle', () => {
    const handler = MediaController.prototype.file;
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual([
      { name: 'Cache-Control', value: 'private, max-age=3600' },
    ]);
    expect(Reflect.getMetadata('THROTTLER:SKIPdefault', handler)).toBe(true);
    // Other routes keep their limit.
    expect(
      Reflect.getMetadata(
        'THROTTLER:SKIPdefault',
        MediaController.prototype.upload,
      ),
    ).toBeUndefined();
  });
});
