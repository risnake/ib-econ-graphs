import { create } from 'zustand';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { ElementOverride, Extra, GraphDoc, GraphStyle, Params, Template } from '~/engine/types';
import { DEFAULT_STYLE } from '~/engine/theme';
import { defaultParams, getTemplate } from '~/templates';

interface Snapshot {
  doc: GraphDoc;
  style: GraphStyle;
}

export interface SavedGraph {
  id: string;
  name: string;
  savedAt: number;
  doc: GraphDoc;
  style: GraphStyle;
}

interface EditorState extends Snapshot {
  selected: string | null;
  past: Snapshot[];
  future: Snapshot[];
  saved: SavedGraph[];

  loadTemplate: (id: string) => void;
  loadDoc: (doc: GraphDoc, style?: GraphStyle) => void;
  setParams: (patch: Params, opts?: ChangeOpts) => void;
  setOverride: (key: string, patch: ElementOverride | null, opts?: ChangeOpts) => void;
  setStyle: (patch: Partial<GraphStyle>, opts?: ChangeOpts) => void;
  setTitle: (title: string, opts?: ChangeOpts) => void;
  addExtra: (extra: Extra) => void;
  updateExtra: (id: string, patch: Partial<Extra>, opts?: ChangeOpts) => void;
  removeExtra: (id: string) => void;
  resetDiagram: () => void;
  resetLabels: () => void;
  select: (key: string | null) => void;
  undo: () => void;
  redo: () => void;

  saveCurrent: (name: string) => void;
  deleteSaved: (id: string) => void;
}

export interface ChangeOpts {
  /** Live update while dragging: no history entry until a committing change. */
  transient?: boolean;
  /** Consecutive commits with the same key within a short window merge into one undo step. */
  coalesce?: string;
}

const LS = {
  style: 'ibeg:style',
  doc: (id: string) => `ibeg:doc:${id}`,
  last: 'ibeg:last',
  saved: 'ibeg:saved',
};

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: autosave is a convenience */
  }
}

export function freshDoc(t: Template): GraphDoc {
  return {
    v: 1,
    templateId: t.id,
    params: defaultParams(t),
    overrides: {},
    extras: [],
    title: t.caption ?? t.name,
  };
}

/** Saved docs may predate new controls: fill in defaults, drop unknown keys. */
function normaliseDoc(doc: GraphDoc, t: Template): GraphDoc {
  const params = defaultParams(t);
  for (const c of t.controls) if (doc.params?.[c.key] !== undefined) params[c.key] = doc.params[c.key];
  return {
    v: 1,
    templateId: t.id,
    params,
    overrides: doc.overrides ?? {},
    extras: doc.extras ?? [],
    title: doc.title ?? t.caption ?? t.name,
  };
}

const HISTORY_LIMIT = 120;
let pending: Snapshot | null = null;
let lastCoalesce: { key: string; at: number } | null = null;

export const useEditor = create<EditorState>((set, get) => {
  /** Apply a change with undo bookkeeping. */
  const change = (mut: (s: Snapshot) => Partial<Snapshot>, opts: ChangeOpts = {}) => {
    const s = get();
    const current: Snapshot = { doc: s.doc, style: s.style };
    const next = mut(current);
    if (opts.transient) {
      if (!pending) pending = current;
      set(next);
      return;
    }
    const base = pending ?? current;
    pending = null;
    const now = Date.now();
    const merge = opts.coalesce && lastCoalesce?.key === opts.coalesce && now - lastCoalesce.at < 900;
    lastCoalesce = opts.coalesce ? { key: opts.coalesce, at: now } : null;
    set({
      ...next,
      past: merge ? s.past : [...s.past, base].slice(-HISTORY_LIMIT),
      future: [],
    });
  };

  const initialTemplate = getTemplate('market-equilibrium')!;

  return {
    doc: freshDoc(initialTemplate),
    style: DEFAULT_STYLE,
    selected: null,
    past: [],
    future: [],
    saved: [],

    loadTemplate: (id) => {
      const t = getTemplate(id);
      if (!t) return;
      const stored = read<GraphDoc>(LS.doc(id));
      pending = null;
      set({
        doc: stored ? normaliseDoc(stored, t) : freshDoc(t),
        selected: null,
        past: [],
        future: [],
      });
    },

    loadDoc: (doc, style) => {
      const t = getTemplate(doc.templateId);
      if (!t) return;
      pending = null;
      set({
        doc: normaliseDoc(doc, t),
        style: style ? { ...DEFAULT_STYLE, ...style } : get().style,
        selected: null,
        past: [],
        future: [],
      });
    },

    setParams: (patch, opts) =>
      change((s) => ({ doc: { ...s.doc, params: { ...s.doc.params, ...patch } } }), opts),

    setOverride: (key, patch, opts) =>
      change((s) => {
        const overrides = { ...s.doc.overrides };
        if (patch === null) delete overrides[key];
        else {
          const merged: ElementOverride = { ...overrides[key], ...patch };
          for (const k of Object.keys(merged) as (keyof ElementOverride)[]) {
            if (merged[k] === undefined) delete merged[k];
          }
          if (Object.keys(merged).length) overrides[key] = merged;
          else delete overrides[key];
        }
        return { doc: { ...s.doc, overrides } };
      }, opts),

    setStyle: (patch, opts) => change((s) => ({ style: { ...s.style, ...patch } }), opts),

    setTitle: (title, opts) => change((s) => ({ doc: { ...s.doc, title } }), { coalesce: 'title', ...opts }),

    addExtra: (extra) => change((s) => ({ doc: { ...s.doc, extras: [...s.doc.extras, extra] } })),

    updateExtra: (id, patch, opts) =>
      change(
        (s) => ({
          doc: {
            ...s.doc,
            extras: s.doc.extras.map((e) => (e.id === id ? ({ ...e, ...patch } as Extra) : e)),
          },
        }),
        opts,
      ),

    removeExtra: (id) =>
      change((s) => ({ doc: { ...s.doc, extras: s.doc.extras.filter((e) => e.id !== id) } })),

    resetDiagram: () => {
      const t = getTemplate(get().doc.templateId);
      if (!t) return;
      change(() => ({ doc: freshDoc(t) }));
      set({ selected: null });
    },

    resetLabels: () => change((s) => ({ doc: { ...s.doc, overrides: {} } })),

    select: (key) => set({ selected: key }),

    undo: () => {
      const { past, future, doc, style } = get();
      if (!past.length) return;
      pending = null;
      const prev = past[past.length - 1];
      set({ ...prev, past: past.slice(0, -1), future: [{ doc, style }, ...future] });
    },

    redo: () => {
      const { past, future, doc, style } = get();
      if (!future.length) return;
      pending = null;
      const next = future[0];
      set({ ...next, past: [...past, { doc, style }], future: future.slice(1) });
    },

    saveCurrent: (name) => {
      const { doc, style, saved } = get();
      const entry: SavedGraph = {
        id: Math.random().toString(36).slice(2, 10),
        name: name.trim() || doc.title || 'Untitled graph',
        savedAt: Date.now(),
        doc,
        style,
      };
      const next = [entry, ...saved].slice(0, 200);
      set({ saved: next });
      write(LS.saved, next);
    },

    deleteSaved: (id) => {
      const next = get().saved.filter((g) => g.id !== id);
      set({ saved: next });
      write(LS.saved, next);
    },
  };
});

// ---------------------------------------------------------------------------
// Boot + persistence (client only)

let booted = false;

/** Load persisted state; `templateId` comes from the URL. Returns the id actually loaded. */
export function bootEditor(templateId: string): string {
  const st = useEditor.getState();
  if (!booted) {
    booted = true;
    const style = read<Partial<GraphStyle>>(LS.style);
    const saved = read<SavedGraph[]>(LS.saved) ?? [];
    useEditor.setState({ style: { ...DEFAULT_STYLE, ...(style ?? {}) }, saved });
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    useEditor.subscribe((s, prev) => {
      if (s.doc === prev.doc && s.style === prev.style) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const cur = useEditor.getState();
        write(LS.style, cur.style);
        write(LS.doc(cur.doc.templateId), cur.doc);
        write(LS.last, cur.doc.templateId);
      }, 250);
    });
  }
  const shared = readShareHash();
  if (shared && getTemplate(shared.doc.templateId)) {
    st.loadDoc(shared.doc, shared.style);
    history.replaceState(history.state, '', location.pathname);
    return shared.doc.templateId;
  }
  useEditor.getState().loadTemplate(templateId);
  return templateId;
}

// ---------------------------------------------------------------------------
// Share links: the whole doc + style, compressed into the URL hash.

export function shareUrl(): string {
  const { doc, style } = useEditor.getState();
  const payload = compressToEncodedURIComponent(JSON.stringify({ doc, style }));
  return `${location.origin}${location.pathname}#g=${payload}`;
}

function readShareHash(): Snapshot | null {
  const m = location.hash.match(/^#g=(.+)$/);
  if (!m) return null;
  try {
    const json = decompressFromEncodedURIComponent(m[1]);
    if (!json) return null;
    const data = JSON.parse(json) as Snapshot;
    return data?.doc?.templateId ? data : null;
  } catch {
    return null;
  }
}
