/**
 * Gallery thumbnails (#4489).
 *
 * Every script image is a 1080x1920 Cloudinary PNG. Mobile Safari decodes to an
 * uncompressed bitmap regardless of file size — roughly 8.3 MB per image — so a
 * 47-image gallery is ~390 MB of bitmap and the tab gets killed. Requesting a
 * resized derivative instead drops that by ~90%.
 *
 * The transform is applied at render time by string-inserting after "/upload/",
 * never by rewriting the stored URL, so the full-resolution original stays
 * available for the lightbox and for download.
 */

/** Rendered thumbnail box, 9:16 to match the source assets. */
export const THUMB_WIDTH = 400;
export const THUMB_HEIGHT = 711;

/** True once a URL already carries a transform segment we would otherwise double up on. */
function hasTransform(path: string) {
  return /(^|\/)(w_|h_|c_|f_|q_|dpr_)/.test(path);
}

/**
 * Returns a width-limited derivative of a Cloudinary URL. Any non-Cloudinary or
 * already-transformed URL is returned untouched.
 */
export function cloudinaryThumb(url: string, width: number = THUMB_WIDTH): string {
  if (!url || !url.includes("res.cloudinary.com")) return url;

  const marker = "/upload/";
  const at = url.indexOf(marker);
  if (at === -1) return url;

  const rest = url.slice(at + marker.length);
  if (hasTransform(rest)) return url;

  return `${url.slice(0, at + marker.length)}w_${width},f_auto,q_auto,dpr_auto/${rest}`;
}
