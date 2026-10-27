/** Base-path aware URLs (the site may be deployed under a sub-path). */
const BASE = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;

export const href = (path: string) => `${BASE}${path.replace(/^\//, '')}`;

export function templateIdFromPath(pathname: string): string | null {
  const m = pathname.match(/\/graph\/([^/]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
}
