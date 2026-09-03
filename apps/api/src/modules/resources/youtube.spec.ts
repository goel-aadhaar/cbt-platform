import {
  youtubeThumbnailUrl,
  youtubeVideoId,
  youtubeWatchUrl,
} from './youtube';

/**
 * What we are willing to embed.
 *
 * This is a security boundary, not a convenience parser: whatever survives here
 * is later turned into a player by the client, so anything that is not a real
 * YouTube video id must not survive. The rejection cases below matter more than
 * the acceptance ones.
 */
describe('youtubeVideoId', () => {
  const ID = 'dQw4w9WgXcQ';

  describe('accepts the shapes people actually paste', () => {
    it.each([
      [`https://www.youtube.com/watch?v=${ID}`, 'desktop watch page'],
      [`http://youtube.com/watch?v=${ID}`, 'http, no www'],
      [`https://m.youtube.com/watch?v=${ID}`, 'mobile'],
      [`https://music.youtube.com/watch?v=${ID}`, 'YouTube Music'],
      [`https://youtu.be/${ID}`, 'share link'],
      [`youtu.be/${ID}`, 'share link with the scheme stripped by the browser'],
      [`https://www.youtube.com/shorts/${ID}`, 'short'],
      [`https://www.youtube.com/embed/${ID}`, 'embed URL'],
      [`https://www.youtube.com/live/${ID}`, 'live stream'],
      [`  https://youtu.be/${ID}  `, 'surrounding whitespace'],
      [ID, 'a bare id'],
    ])('%s (%s)', (input) => {
      expect(youtubeVideoId(input)).toBe(ID);
    });

    it('keeps the id when extra query parameters ride along', () => {
      // Sharing from a timestamp or a playlist appends these; the id is still
      // the id, and dropping the rest is the normalisation this exists for.
      expect(
        youtubeVideoId(
          `https://www.youtube.com/watch?v=${ID}&t=42s&list=PLabc`,
        ),
      ).toBe(ID);
    });
  });

  describe('refuses everything else', () => {
    it.each([
      ['', 'empty'],
      ['   ', 'blank'],
      ['not a url at all', 'free text'],
      ['https://vimeo.com/123456', 'another video host'],
      ['https://example.com/watch?v=dQw4w9WgXcQ', 'right shape, wrong host'],
      [
        'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',
        'host that merely starts with youtube.com',
      ],
      ['https://www.youtube.com/watch?v=short', 'id of the wrong length'],
      ['https://www.youtube.com/', 'no video at all'],
      ['https://www.youtube.com/results?search_query=physics', 'search page'],
      ['https://www.youtube.com/@somechannel', 'a channel, not a video'],
    ])('%s (%s)', (input) => {
      expect(youtubeVideoId(input)).toBeNull();
    });

    it('refuses a javascript: URL that names youtube', () => {
      // Parses as a URL and contains the host, so only the scheme check stops
      // it. This is the case that would otherwise become an XSS sink.
      expect(
        youtubeVideoId(
          'javascript:alert(1)//www.youtube.com/watch?v=dQw4w9WgXcQ',
        ),
      ).toBeNull();
    });

    it('refuses a data: URL', () => {
      expect(
        youtubeVideoId('data:text/html,<script>alert(1)</script>'),
      ).toBeNull();
    });

    it('refuses embed markup even when it contains a valid id', () => {
      // A teacher pasting the "copy embed code" output gets a clear rejection
      // rather than having the markup stored.
      expect(
        youtubeVideoId(
          `<iframe src="https://www.youtube.com/embed/${ID}"></iframe>`,
        ),
      ).toBeNull();
    });

    it('refuses an id with a character outside the alphabet', () => {
      expect(youtubeVideoId('https://youtu.be/abcdefghij!')).toBeNull();
    });
  });

  describe('derived URLs are built from the id, never from input', () => {
    it('builds the canonical watch URL', () => {
      expect(youtubeWatchUrl(ID)).toBe(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      );
    });

    it('builds a thumbnail URL that exists for every video', () => {
      // hqdefault, not maxresdefault: the latter 404s for older uploads.
      expect(youtubeThumbnailUrl(ID)).toBe(
        'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      );
    });
  });
});
