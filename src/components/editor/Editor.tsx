import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  Download,
  LayoutGrid,
  Link2,
  Monitor,
  Moon,
  Redo2,
  Sun,
  Undo2,
  X,
} from 'lucide-react';
import { GraphSVG, layoutScene, type Interaction } from '~/engine/GraphSVG';
import type { Extra, Handle, Params, Scene, Template, Vec } from '~/engine/types';
import { getTemplate } from '~/templates';
import { bootEditor, shareUrl, useEditor, type SavedGraph } from '~/store/editor';
import { snap, snapTargets, withExtras } from '~/lib/scene';
import { href, templateIdFromPath } from '~/lib/paths';
import { Library } from './Library';
import { Inspector } from './Inspector';
import { ExportDialog } from './ExportDialog';
import { Badge, Button, cx, IconButton, TextInput } from './ui';

const DEFAULT_ID = 'market-equilibrium';

function safeBuild(t: Template, params: Params): { scene: Scene; error?: string } {
  try {
    return { scene: t.build(params) };
  } catch (e) {
    console.error(e);
    const fallback = getTemplate(DEFAULT_ID)!;
    return {
      scene: fallback.build(Object.fromEntries(fallback.controls.map((c) => [c.key, c.default]))),
      error: 'This combination of options could not be drawn — try another setting or reset the diagram.',
    };
  }
}

export default function Editor({ initialId }: { initialId?: string }) {
  const [ready, setReady] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const doc = useEditor((s) => s.doc);
  const style = useEditor((s) => s.style);
  const selected = useEditor((s) => s.selected);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const { undo, redo, select, setOverride, setParams, updateExtra, loadTemplate, loadDoc, removeExtra } =
    useEditor.getState();

  const notify = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  // boot once on the client
  useEffect(() => {
    let id = initialId;
    if (!id || !getTemplate(id)) {
      try {
        id = localStorage.getItem('ibeg:last') ?? DEFAULT_ID;
      } catch {
        id = DEFAULT_ID;
      }
      if (!getTemplate(id)) id = DEFAULT_ID;
    }
    const loaded = bootEditor(id);
    if (!initialId || loaded !== initialId) history.replaceState(null, '', href(`graph/${loaded}/`));
    setReady(true);
    const onPop = () => {
      const pid = templateIdFromPath(location.pathname);
      if (pid && getTemplate(pid)) useEditor.getState().loadTemplate(pid);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const template = getTemplate(doc.templateId) ?? getTemplate(DEFAULT_ID)!;

  useEffect(() => {
    if (ready) document.title = `${template.name} · Econ Graph Studio`;
  }, [template, ready]);

  const built = useMemo(() => safeBuild(template, doc.params), [template, doc.params]);
  const scene = useMemo(() => withExtras(built.scene, doc.extras, selected), [built.scene, doc.extras, selected]);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const snapCache = useRef<{ key: string; targets: Vec[] } | null>(null);

  const pick = useCallback(
    (id: string) => {
      if (id !== useEditor.getState().doc.templateId) {
        loadTemplate(id);
        history.pushState(null, '', href(`graph/${id}/`));
      }
      setLibraryOpen(false);
    },
    [loadTemplate],
  );

  const openSaved = useCallback(
    (g: SavedGraph) => {
      loadDoc(g.doc, g.style);
      history.pushState(null, '', href(`graph/${g.doc.templateId}/`));
      setLibraryOpen(false);
      notify(`Opened “${g.name}”`);
    },
    [loadDoc, notify],
  );

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y' && !typing) {
        e.preventDefault();
        redo();
      } else if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setExportOpen(true);
      } else if (e.key === 'Escape' && !typing) {
        select(null);
        setLibraryOpen(false);
      } else if (e.key.startsWith('Arrow') && !typing && !mod) {
        // nudge the selected label (Shift = 10px)
        const st = useEditor.getState();
        const key = st.selected;
        if (!key) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const o = st.doc.overrides[key];
        const dx = (o?.dx ?? 0) + (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0);
        const dy = (o?.dy ?? 0) + (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0);
        setOverride(key, { dx, dy }, { coalesce: `nudge:${key}` });
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing) {
        const sel = useEditor.getState().selected;
        const m = sel?.match(/\.extra-([^:]+)$/);
        if (m) {
          removeExtra(m[1]);
          select(null);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, select, removeExtra, setOverride]);

  const interaction: Interaction = useMemo(
    () => ({
      selectedKey: selected,
      onSelect: (key) => select(key),
      onLabelDrag: (key, dx, dy, done) =>
        setOverride(key, { dx: Math.round(dx * 10) / 10, dy: Math.round(dy * 10) / 10 }, { transient: !done }),
      onHandleDrag: (handle: Handle, pos: Vec, done: boolean) => {
        let p: Vec = [Math.round(pos[0] * 100) / 100, Math.round(pos[1] * 100) / 100];
        const m = handle.id.match(/^extra:([^:]+):(.+)$/);
        if (!m) {
          setParams(handle.apply(p), { transient: !done });
          return;
        }
        const x = useEditor.getState().doc.extras.find((e) => e.id === m[1]);
        if (!x) return;
        const panel = sceneRef.current.panels.find((pp) => pp.id === x.panel) ?? sceneRef.current.panels[0];
        if (x.kind === 'point' || x.kind === 'area' || x.kind === 'curve') {
          if (snapCache.current?.key !== handle.id) {
            snapCache.current = { key: handle.id, targets: snapTargets(panel, `extra-${x.id}`) };
          }
          p = snap(p, snapCache.current.targets, panel);
        }
        if (done) snapCache.current = null;
        const part = m[2];
        if (part === 'from' || part === 'to' || part === 'at') {
          updateExtra(x.id, { [part]: p } as Partial<Extra>, { transient: !done });
        } else if ('points' in x) {
          const points = x.points.slice();
          points[Number(part)] = p;
          updateExtra(x.id, { points }, { transient: !done });
        }
      },
    }),
    [selected, select, setParams, setOverride, updateExtra],
  );

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl());
      notify('Link copied — anyone with it sees this exact graph');
    } catch {
      notify('Could not access the clipboard');
    }
  };

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-13 shrink-0 items-center gap-2 border-b border-line bg-surface px-2 sm:px-3">
        <a href={href('')} className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-surface-3" title="Econ Graph Studio home">
          <Logo />
          <span className="hidden text-sm font-semibold tracking-tight text-ink md:inline">Econ Graph Studio</span>
        </a>
        <div className="mx-1 hidden h-5 w-px bg-line md:block" />
        <Button
          variant="ghost"
          size="sm"
          className="lg:hidden"
          icon={<LayoutGrid className="h-4 w-4" />}
          onClick={() => setLibraryOpen(true)}
        >
          Diagrams
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="truncate text-sm font-medium text-ink">{template.name}</h1>
          {template.hl && <Badge>HL</Badge>}
        </div>
        <div className="flex items-center gap-0.5">
          <IconButton label="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
            <Undo2 className="h-4 w-4" />
          </IconButton>
          <IconButton label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}>
            <Redo2 className="h-4 w-4" />
          </IconButton>
          <ThemeToggle />
          <div className="mx-1 h-5 w-px bg-line" />
          <IconButton label="Copy share link" onClick={copyLink}>
            <Link2 className="h-4 w-4" />
          </IconButton>
          <div className="relative">
            <IconButton label="Save to My graphs" onClick={() => setSaveOpen((v) => !v)} active={saveOpen}>
              <Bookmark className="h-4 w-4" />
            </IconButton>
            {saveOpen && (
              <SavePopover
                defaultName={doc.title || template.name}
                onClose={() => setSaveOpen(false)}
                onSave={(name) => {
                  useEditor.getState().saveCurrent(name);
                  setSaveOpen(false);
                  notify(`Saved “${name}” to My graphs`);
                }}
              />
            )}
          </div>
          <Button variant="primary" className="ml-1.5" icon={<Download className="h-4 w-4" />} onClick={() => setExportOpen(true)}>
            <span className="hidden sm:inline">Export</span>
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Library: sidebar on desktop, drawer on mobile */}
        <aside className="hidden w-68 shrink-0 border-r border-line bg-surface lg:block">
          <Library activeId={template.id} onPick={pick} onOpenSaved={openSaved} />
        </aside>
        {libraryOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setLibraryOpen(false)} />
            <div className="absolute inset-y-0 left-0 flex w-[min(320px,88vw)] flex-col bg-surface shadow-2xl">
              <div className="flex h-12 items-center justify-between border-b border-line px-3">
                <span className="text-sm font-semibold">Diagrams</span>
                <IconButton label="Close" onClick={() => setLibraryOpen(false)}>
                  <X className="h-4 w-4" />
                </IconButton>
              </div>
              <div className="min-h-0 flex-1">
                <Library activeId={template.id} onPick={pick} onOpenSaved={openSaved} />
              </div>
            </div>
          </div>
        )}

        <main className="canvas-backdrop relative flex min-h-[46vh] min-w-0 flex-1 flex-col lg:min-h-0">
          <Canvas scene={scene} ready={ready} interaction={interaction} />
          {built.error && (
            <div className="absolute inset-x-4 top-4 rounded-lg border border-danger/30 bg-surface px-3 py-2 text-sm text-danger shadow-card">
              {built.error}
            </div>
          )}
        </main>

        <aside className="flex min-h-0 flex-1 flex-col border-t border-line bg-surface lg:w-[340px] lg:flex-none lg:border-t-0 lg:border-l">
          <Inspector template={template} scene={scene} />
        </aside>
      </div>

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        scene={scene}
        style={style}
        overrides={doc.overrides}
        title={doc.title}
        fallbackName={template.name}
        notify={notify}
      />

      {toast && (
        <div
          role="status"
          className="toast-in fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-bg shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Canvas({ scene, ready, interaction }: { scene: Scene; ready: boolean; interaction: Interaction }) {
  const style = useEditor((s) => s.style);
  const doc = useEditor((s) => s.doc);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const L = layoutScene(scene, style, doc.overrides, doc.title);
  const W = Math.ceil(L.width);
  const H = Math.ceil(L.height);
  const pad = 24;
  const scale = box.w ? Math.max(0.2, Math.min((box.w - pad * 2) / W, (box.h - pad * 2) / H, 1.6)) : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={wrapRef} className="relative min-h-0 flex-1" onPointerDown={() => interaction.onSelect?.(null)}>
        {ready && scale > 0 && (
          <div
            className={cx(
              'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg shadow-card ring-1 ring-black/5',
              style.background === 'transparent' ? 'checker' : 'bg-white',
            )}
            style={{ width: W * scale, height: H * scale }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <GraphSVG
              scene={scene}
              style={style}
              overrides={doc.overrides}
              title={doc.title}
              interaction={interaction}
              className="block h-full w-full touch-none"
            />
          </div>
        )}
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">Loading editor…</div>
        )}
      </div>
      <p className="hidden shrink-0 px-4 pb-3 text-center text-xs text-faint sm:block">
        Click anything to edit it · drag labels to move them · drag the blue handles to adjust curves
      </p>
    </div>
  );
}

function SavePopover({ defaultName, onSave, onClose }: { defaultName: string; onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(defaultName);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('pointerdown', onDown);
    ref.current?.querySelector('input')?.select();
    return () => window.removeEventListener('pointerdown', onDown);
  }, [onClose]);
  return (
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name);
      }}
      className="absolute top-10 right-0 z-30 w-72 rounded-xl border border-line bg-surface p-3 shadow-xl"
    >
      <label className="mb-1.5 block text-xs font-medium text-muted">Save to My graphs as</label>
      <TextInput ariaLabel="Graph name" value={name} onChange={setName} />
      <div className="mt-2.5 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" type="submit">
          Save
        </Button>
      </div>
    </form>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    if (t === 'light' || t === 'dark') setTheme(t);
  }, []);
  const next = () => {
    const order = ['system', 'light', 'dark'] as const;
    const n = order[(order.indexOf(theme) + 1) % 3];
    setTheme(n);
    try {
      if (n === 'system') {
        localStorage.removeItem('ibeg:theme');
        delete document.documentElement.dataset.theme;
      } else {
        localStorage.setItem('ibeg:theme', n);
        document.documentElement.dataset.theme = n;
      }
    } catch {
      /* ignore */
    }
  };
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  return (
    <IconButton label={`Theme: ${theme}`} onClick={next}>
      <Icon className="h-4 w-4" />
    </IconButton>
  );
}

export function Logo({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#191917" />
      <path d="M8 7v17h17" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 10l13 12" stroke="#3987e5" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M10 21l13-11" stroke="#eb6834" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
