/**
 * Turning a pasted YouTube link into a video id we are willing to embed.
 *
 * The teacher pastes whatever their browser gave them; what gets stored is an
 * eleven-character id and nothing else. That is the entire security property:
 * the player is later built from the id by the client, so no part of what the
 * teacher typed ever reaches the page as markup or as a URL. A teacher cannot
 * paste an <iframe>, a `javascript:` URL, or a link to some other site and
 * have it rendered, because none of those parse to an id.
 *
 * Deliberately hand-written rather than a URL-regex: the accepted shapes are a
 * short, known list, and matching them explicitly is easier to audit than one
 * expression trying to cover every YouTube URL ever issued.
 */

/** Video ids are exactly 11 chars of an unreserved alphabet. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

const ALLOWED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
]);

/**
 * The id for a supported YouTube URL, or null for anything else.
 *
 * Null is not an error here — the caller decides what an unusable link means,
 * because "reject the request" and "do not show a preview yet" are different
 * responses to the same return value.
 */
export function youtubeVideoId(input: string): string | null {
  const raw = input?.trim();
  if (!raw) return null;

  // Accept a bare id, which is what someone pasting from the address bar of an
  // already-embedded player tends to have.
  if (VIDEO_ID.test(raw)) return raw;

  let url: URL;
  try {
    // Tolerate a missing scheme (youtu.be/xyz), which browsers hide and people
    // therefore paste. Anything still unparseable is rejected below.
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  // Scheme check before host: `javascript:` and `data:` parse happily and must
  // never reach the host comparison.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return null;

  const path = url.pathname.replace(/\/+$/, '');

  // youtu.be/<id>
  if (url.hostname.toLowerCase().endsWith('youtu.be')) {
    return candidate(path.slice(1));
  }

  // youtube.com/watch?v=<id>
  if (path === '/watch') return candidate(url.searchParams.get('v') ?? '');

  // youtube.com/shorts/<id>, /embed/<id>, /live/<id>, /v/<id>
  const seg = path.match(/^\/(?:shorts|embed|live|v)\/([^/]+)$/);
  if (seg) return candidate(seg[1]);

  return null;
}

function candidate(value: string): string | null {
  const id = value.trim();
  return VIDEO_ID.test(id) ? id : null;
}

/** Canonical watch URL — what a "open on YouTube" link should point at. */
export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Thumbnail for a video id.
 *
 * `hqdefault` rather than `maxresdefault`: every video has one, where maxres is
 * absent for older or lower-resolution uploads and would show a broken image
 * for exactly the material most likely to be a scanned lecture recording.
 */
export function youtubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}
