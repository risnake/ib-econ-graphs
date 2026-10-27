import type { APIRoute } from 'astro';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GraphSVG } from '~/engine/GraphSVG';
import { DEFAULT_STYLE } from '~/engine/theme';
import { TEMPLATES, defaultParams, getTemplate } from '~/templates';

export function getStaticPaths() {
  return TEMPLATES.map((t) => ({ params: { id: t.id } }));
}

/** Static SVG preview of each template's default state, used by the gallery. */
export const GET: APIRoute = ({ params }) => {
  const t = getTemplate(params.id!);
  if (!t) return new Response('Not found', { status: 404 });
  const markup = renderToStaticMarkup(
    createElement(GraphSVG, {
      scene: t.build(defaultParams(t)),
      style: { ...DEFAULT_STYLE, fontScale: 1.1, strokeScale: 1.15 },
      ariaLabel: t.name,
    }),
  );
  return new Response(markup, {
    headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
};
