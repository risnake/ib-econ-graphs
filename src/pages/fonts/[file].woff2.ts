import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

/**
 * Web fonts at stable URLs (/fonts/inter-400.woff2 …) so the API Worker can
 * embed them in SVGs on request. Copied from @fontsource at build time.
 */
const FILES: Record<string, string> = {
  'inter-400': '@fontsource/inter/files/inter-latin-400-normal.woff2',
  'inter-500': '@fontsource/inter/files/inter-latin-500-normal.woff2',
  'inter-600': '@fontsource/inter/files/inter-latin-600-normal.woff2',
  'source-serif-4-400': '@fontsource/source-serif-4/files/source-serif-4-latin-400-normal.woff2',
  'source-serif-4-600': '@fontsource/source-serif-4/files/source-serif-4-latin-600-normal.woff2',
  'kalam-400': '@fontsource/kalam/files/kalam-latin-400-normal.woff2',
  'kalam-700': '@fontsource/kalam/files/kalam-latin-700-normal.woff2',
};

export function getStaticPaths() {
  return Object.keys(FILES).map((file) => ({ params: { file } }));
}

export const GET: APIRoute = async ({ params }) => {
  const spec = FILES[params.file!];
  if (!spec) return new Response('Not found', { status: 404 });
  const bytes = await readFile(createRequire(import.meta.url).resolve(spec));
  return new Response(bytes, { headers: { 'Content-Type': 'font/woff2' } });
};
