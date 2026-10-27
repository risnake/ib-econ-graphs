import { useEffect, useRef, useState } from 'react';
import { Clipboard, Download, Loader2, X } from 'lucide-react';
import { GraphSVG, layoutScene } from '~/engine/GraphSVG';
import type { GraphStyle, Overrides, Scene } from '~/engine/types';
import { canCopyImage, copyImage, downloadBlob, exportBlob, slugify, type ExportFormat } from '~/lib/export';
import { plainText } from '~/engine/richtext';
import { Button, Field, IconButton, Segmented, Switch, TextInput } from './ui';

const PREFS_KEY = 'ibeg:export';

interface Prefs {
  format: ExportFormat;
  scale: number;
  transparent: boolean;
  includeTitle: boolean;
}

function loadPrefs(style: GraphStyle): Prefs {
  const base: Prefs = { format: 'png', scale: 3, transparent: style.background === 'transparent', includeTitle: style.showTitle };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...base, ...JSON.parse(raw), includeTitle: style.showTitle };
  } catch {
    /* ignore */
  }
  return base;
}

const FORMATS: { value: ExportFormat; label: string; blurb: string }[] = [
  { value: 'png', label: 'PNG', blurb: 'Best for Word, Google Docs and slides.' },
  { value: 'svg', label: 'SVG', blurb: 'Vector — infinitely sharp, editable in design tools.' },
  { value: 'pdf', label: 'PDF', blurb: 'Vector PDF for printing (uses standard PDF fonts).' },
  { value: 'jpeg', label: 'JPG', blurb: 'Smaller files, white background.' },
];

export function ExportDialog({
  open,
  onClose,
  scene,
  style,
  overrides,
  title,
  fallbackName,
  notify,
}: {
  open: boolean;
  onClose: () => void;
  scene: Scene;
  style: GraphStyle;
  overrides: Overrides;
  title: string;
  fallbackName: string;
  notify: (msg: string) => void;
}) {
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs(style));
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<null | 'download' | 'copy'>(null);
  const [error, setError] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setPrefs((p) => ({ ...p, includeTitle: style.showTitle, transparent: p.transparent || style.background === 'transparent' }));
    setName(slugify(plainText(title) || fallbackName));
    setError('');
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ format: prefs.format, scale: prefs.scale, transparent: prefs.transparent }));
    } catch {
      /* ignore */
    }
  }, [prefs]);

  if (!open) return null;

  const raster = prefs.format === 'png' || prefs.format === 'jpeg';
  const canTransparent = prefs.format === 'png' || prefs.format === 'svg';
  const exportStyle: GraphStyle = {
    ...style,
    showTitle: prefs.includeTitle,
    background: canTransparent && prefs.transparent ? 'transparent' : 'white',
  };
  const L = layoutScene(scene, exportStyle, overrides, title);
  const pxW = Math.round(Math.ceil(L.width) * prefs.scale);
  const pxH = Math.round(Math.ceil(L.height) * prefs.scale);
  const fileName = `${(name || 'diagram').replace(/\.(png|svg|pdf|jpe?g)$/i, '')}.${prefs.format === 'jpeg' ? 'jpg' : prefs.format}`;

  const run = async (kind: 'download' | 'copy') => {
    const svg = svgRef.current;
    if (!svg) return;
    setBusy(kind);
    setError('');
    try {
      if (kind === 'copy') {
        await copyImage(svg, prefs.scale, style.font);
        notify('Image copied — paste it into your document');
      } else {
        const blob = await exportBlob(svg, prefs.format, { scale: prefs.scale, font: style.font });
        downloadBlob(blob, fileName);
        notify(`Downloaded ${fileName}`);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" role="presentation">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        tabIndex={-1}
        className="relative flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl outline-none md:flex-row"
      >
        <div className="canvas-backdrop flex min-h-[220px] flex-1 items-center justify-center overflow-auto p-4 sm:p-6">
          <div className={exportStyle.background === 'transparent' ? 'checker rounded-md shadow-card' : 'rounded-md bg-white shadow-card'}>
            <GraphSVG
              svgRef={svgRef}
              scene={scene}
              style={exportStyle}
              overrides={overrides}
              title={title}
              className="block h-auto max-h-[60vh] w-full max-w-[560px]"
            />
          </div>
        </div>
        <div className="flex w-full shrink-0 flex-col border-t border-line md:w-80 md:border-t-0 md:border-l">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 id="export-title" className="text-base font-semibold text-ink">
              Export
            </h2>
            <IconButton label="Close" onClick={onClose}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>
          <div className="scroll-thin flex-1 space-y-1 overflow-y-auto px-5 pb-4">
            <Field label="Format">
              <Segmented
                ariaLabel="Format"
                value={prefs.format}
                onChange={(v) => setPrefs((p) => ({ ...p, format: v }))}
                options={FORMATS.map((f) => ({ value: f.value, label: f.label }))}
              />
              <p className="mt-1.5 text-xs text-muted">{FORMATS.find((f) => f.value === prefs.format)?.blurb}</p>
            </Field>
            {raster && (
              <Field label="Resolution" hint={`${pxW} × ${pxH} px`}>
                <Segmented
                  ariaLabel="Resolution"
                  value={String(prefs.scale)}
                  onChange={(v) => setPrefs((p) => ({ ...p, scale: Number(v) }))}
                  options={[1, 2, 3, 4].map((s) => ({ value: String(s), label: `${s}×` }))}
                />
              </Field>
            )}
            <Switch
              checked={prefs.includeTitle}
              onChange={(v) => setPrefs((p) => ({ ...p, includeTitle: v }))}
              label="Include figure title"
              help={prefs.includeTitle ? plainText(title) : 'Many IAs put the title in the document instead.'}
            />
            {canTransparent && (
              <Switch
                checked={prefs.transparent}
                onChange={(v) => setPrefs((p) => ({ ...p, transparent: v }))}
                label="Transparent background"
              />
            )}
            <Field label="File name">
              <TextInput ariaLabel="File name" value={name} onChange={setName} />
            </Field>
            {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
          </div>
          <div className="flex gap-2 border-t border-line px-5 py-4">
            {canCopyImage() && (
              <Button
                className="flex-1"
                disabled={!!busy}
                onClick={() => run('copy')}
                icon={busy === 'copy' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clipboard className="h-4 w-4" />}
                title="Copy as PNG to paste straight into Docs, Word or Slides"
              >
                Copy image
              </Button>
            )}
            <Button
              variant="primary"
              className="flex-1"
              disabled={!!busy}
              onClick={() => run('download')}
              icon={busy === 'download' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            >
              Download
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
