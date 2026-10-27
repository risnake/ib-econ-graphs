# Econ Graph Studio

A web app for drawing IB Economics diagrams (SL and HL) for internal assessments, notes and revision. You pick a diagram, adjust it, and export it as PNG, SVG, PDF or JPG.

**What's included**

- **88 diagrams across all four units:**
  - Unit 1 · Introduction: PPCs.
  - Unit 2 · Micro: demand & supply, elasticities, taxes and subsidies, price controls, externalities, tradable permits, linear demand/supply functions (HL), and the full HL theory of the firm (costs, perfect competition, monopoly, natural monopoly, monopolistic competition, kinked demand, price discrimination).
  - Unit 3 · Macro: business cycle, AD/AS (new classical and Keynesian), output gaps, inflation and deflation, unemployment, Phillips curves (HL), money market, multiplier (HL), crowding out, Lorenz curve with Gini.
  - Unit 4 · Global: free trade, tariffs, quotas, production and export subsidies, comparative advantage (HL), floating, fixed and managed exchange rates, J-curve (HL).
  - A blank canvas for anything else.
- **Drawn the IB way:** subscripted labels (P₁, Q\*, P<sub>max</sub>), dashed guides to the axes, and shaded welfare areas placed at the correct vertices. Cost curves come from real cost functions, so MC always cuts AVC and ATC at their minima.
- **Edit anything:**
  - Each diagram has its own options (elasticities, shift direction, policy responses, shading).
  - Drag the blue handles to move curves, and drag labels to reposition them (arrow keys nudge a selected label).
  - Rename or hide any label, and recolour or dash any curve.
- **Draw your own:** add lines and curves, points with axis guides, shading, arrows and text on top of any diagram. Points and shading corners snap to intersections.
- **Styles:**
  - Colour, black-ink, or black-and-white print with hatched areas.
  - Sans, serif or handwritten font, with adjustable text size and line weight.
  - Axis titles at the ends or centred; area labels inside the shapes, as a key, or both.
- **Export:**
  - PNG at 1–4×, SVG and JPG, all with embedded fonts.
  - Vector PDF.
  - Copy-to-clipboard, for pasting straight into Google Docs, Word or Slides.
- **Your work is kept:**
  - Edits autosave per diagram in the browser, with undo/redo.
  - "My graphs" stores finished figures.
  - Share links encode the whole graph in the URL.

## Tech

- [Astro](https://astro.build) 7 for the static pages, with one React 19 island for the editor.
- Tailwind CSS 4 and Zustand.
- A custom SVG renderer (`src/engine`). The diagrams are schematic, so they are drawn as geometry rather than as data charts.
- jsPDF + svg2pdf.js for PDF export. Both are loaded only when a PDF is exported.

## Getting started

Requires Node 22.22+ (Astro 7).

```sh
npm install
npm run dev       # http://localhost:4321
npm test          # geometry + every template/variant builds cleanly
npm run build     # static site in dist/
```

While `npm run dev` is running, `/dev/catalog` renders every template on one page. Useful query parameters:

- `?id=tariff,subsidy` limits the page to those templates.
- `&variants=1` adds every option variant.
- `&style={"palette":"mono"}` overrides the style.

This page is not part of the production build.

## Project layout

```
src/
  engine/       scene types, geometry (intersections, clipping, splines), theme, SVG renderer
  templates/    one file per syllabus area; kit.ts has the shared building blocks
  components/   the editor island (library, canvas, inspector, export dialog)
  store/        editor state: undo/redo, autosave, saved graphs, share links
  lib/          export (PNG/SVG/PDF/clipboard), scene helpers, paths
  pages/        landing page + gallery, /graph/[id] editor pages, /thumbs/[id].svg previews
```

## Adding a diagram

A template is a `Template` object: metadata, a list of `controls`, and a `build(params)` function. `build` returns panels of elements in data coordinates, on a 0–10 box by default.

- The helpers in `src/templates/kit.ts` do most of the work: `sd()`, `sdLine()`, `eqPoint()`, `area()`, `shiftArrow()`, `costModel()`, `linearDemand()` and `dragHandle()`.
- Add the template to a file's exported array; it then appears in the library, the gallery and the tests automatically.
- `npm test` builds every option combination, including slider extremes, and fails on NaNs or duplicate ids.

## Deploying

The build output is a fully static site, so any static host works (Netlify, Vercel, Cloudflare Pages, GitHub Pages). For a sub-path deployment such as GitHub Pages, set `BASE_PATH`:

```sh
SITE=https://<user>.github.io BASE_PATH=/ib-econ-graphs npm run build
```

---

Not affiliated with or endorsed by the International Baccalaureate Organization.
