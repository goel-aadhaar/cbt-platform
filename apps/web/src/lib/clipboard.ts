/**
 * Copy text to the clipboard, including on plain HTTP.
 *
 * `navigator.clipboard` is only defined in a **secure context** — HTTPS, or
 * localhost. This platform is currently served over plain HTTP on an IP
 * address, so on the deployment the object does not exist at all and
 * `navigator.clipboard.writeText(...)` throws a TypeError before it copies
 * anything. It worked in local development and nowhere else, which is why the
 * copy button looked correct in the code and did nothing on the box.
 *
 * The fallback is the pre-Clipboard-API approach: put the text in an offscreen
 * textarea, select it, and ask the document to copy the selection.
 * `document.execCommand` is deprecated and every browser still implements it,
 * precisely because of this gap. Once the platform is behind TLS the modern
 * path takes over on its own — nothing here needs removing then.
 *
 * Returns whether the text actually made it, so the caller can say so rather
 * than showing a tick regardless.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission refused, or a browser that exposes the object but blocks
      // the call. Fall through rather than giving up.
    }
  }

  try {
    const area = document.createElement("textarea");
    area.value = text;
    // Kept in the layout but out of sight: `display:none` and `visibility:
    // hidden` elements cannot be selected, so the copy would silently fail.
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
