import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  Crosshair,
  Eye,
  EyeOff,
  Info,
  Minus,
  Move,
  Plus,
  RotateCcw,
  Slash,
  Spline,
  SquareDashed,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import type { AreaRole, Control, ElementOverride, Extra, GraphStyle, Scene, Template, Vec } from '~/engine/types';
import { useEditor } from '~/store/editor';
import { collectLabels, defaultLabel, EXTRA_PREFIX, findByKey, type LabelEntry } from '~/lib/scene';
import { plainText } from '~/engine/richtext';
import {
  Badge,
  Button,
  cx,
  Field,
  IconButton,
  Section,
  Segmented,
  SelectInput,
  SliderField,
  Switch,
  TextInput,
} from './ui';

type Tab = 'diagram' | 'labels' | 'style';

export function Inspector({ template, scene }: { template: Template; scene: Scene }) {
  const [tab, setTab] = useState<Tab>('diagram');
  const selected = useEditor((s) => s.selected);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {selected && <SelectionCard scene={scene} selKey={selected} />}
      <div className="border-b border-line px-3 pt-3">
        <div role="tablist" className="flex gap-1">
          {(
            [
              ['diagram', 'Diagram'],
              ['labels', 'Labels'],
              ['style', 'Style'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cx(
                '-mb-px border-b-2 px-2.5 pb-2 text-[13px] font-medium transition-colors',
                tab === k ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {tab === 'diagram' && <DiagramTab template={template} scene={scene} />}
        {tab === 'labels' && <LabelsTab scene={scene} />}
        {tab === 'style' && <StyleTab />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diagram tab

function DiagramTab({ template, scene }: { template: Template; scene: Scene }) {
  const params = useEditor((s) => s.doc.params);
  const setParams = useEditor((s) => s.setParams);
  const resetDiagram = useEditor((s) => s.resetDiagram);

  const groups = useMemo(() => {
    const out = new Map<string, Control[]>();
    for (const c of template.controls) {
      const g = c.group ?? 'Options';
      if (!out.has(g)) out.set(g, []);
      out.get(g)!.push(c);
    }
    return [...out.entries()];
  }, [template]);

  return (
    <>
      <Section>
        <div className="flex items-start gap-2">
          <p className="flex-1 text-[13px] leading-5 text-muted">{template.description}</p>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {template.hl && <Badge>HL only</Badge>}
          <Badge tone="muted">{template.topic}</Badge>
        </div>
      </Section>

      {scene.stats && scene.stats.length > 0 && (
        <Section title="Results">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg bg-surface-2 p-3">
            {scene.stats.map((s) => (
              <div key={s.label} className="min-w-0">
                <dt className="truncate text-[11px] text-muted">{s.label}</dt>
                <dd className="text-sm font-semibold text-ink tabular-nums">{s.value}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      {groups.map(([group, controls]) => {
        const visible = controls.filter((c) => !c.show || c.show(params));
        if (!visible.length) return null;
        return (
          <Section key={group} title={group}>
            {visible.map((c) => (
              <ControlInput key={c.key} control={c} value={params[c.key]} onChange={(v, coalesce) => setParams({ [c.key]: v }, coalesce ? { coalesce: `p:${c.key}` } : undefined)} />
            ))}
          </Section>
        );
      })}

      <DrawSection scene={scene} />

      <Section>
        <p className="mb-2 flex items-start gap-1.5 text-xs leading-4 text-muted">
          <Move className="mt-px h-3.5 w-3.5 shrink-0" />
          Drag any label on the graph to reposition it. Blue handles adjust curves directly.
        </p>
        <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={resetDiagram}>
          Reset this diagram
        </Button>
      </Section>
    </>
  );
}

function ControlInput({
  control: c,
  value,
  onChange,
}: {
  control: Control;
  value: unknown;
  onChange: (v: number | string | boolean, coalesce?: boolean) => void;
}) {
  switch (c.type) {
    case 'toggle':
      return <Switch checked={value === true} onChange={(v) => onChange(v)} label={c.label} help={c.help} />;
    case 'select': {
      const v = String(value ?? c.default);
      const short = c.options.length <= 3 && c.options.every((o) => o.label.length <= 12);
      return (
        <Field label={c.label}>
          {short ? (
            <Segmented value={v} onChange={(x) => onChange(x)} options={c.options} ariaLabel={c.label} />
          ) : (
            <SelectInput value={v} onChange={(x) => onChange(x)} options={c.options} ariaLabel={c.label} />
          )}
          {c.help && <p className="mt-1 text-xs text-muted">{c.help}</p>}
        </Field>
      );
    }
    case 'slider': {
      const decimals = (String(c.step).split('.')[1] ?? '').length;
      return (
        <SliderField
          label={c.label}
          value={Number(value ?? c.default)}
          min={c.min}
          max={c.max}
          step={c.step}
          format={(n) => n.toFixed(decimals)}
          onChange={(n) => onChange(n, true)}
        />
      );
    }
    case 'number':
      return (
        <Field label={c.label}>
          <input
            type="number"
            value={Number(value ?? c.default)}
            step={c.step ?? 'any'}
            min={c.min}
            max={c.max}
            onChange={(e) => {
              const n = e.target.valueAsNumber;
              if (Number.isFinite(n)) onChange(n, true);
            }}
            className="h-8.5 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink tabular-nums hover:border-line-strong focus:border-accent focus:outline-none"
          />
          {c.help && <p className="mt-1 text-xs text-muted">{c.help}</p>}
        </Field>
      );
    case 'text':
      return (
        <Field label={c.label}>
          <TextInput value={String(value ?? c.default)} placeholder={c.placeholder} onChange={(v) => onChange(v, true)} />
          {c.help && <p className="mt-1 text-xs text-muted">{c.help}</p>}
        </Field>
      );
  }
}

const DRAW_TOOLS: { kind: Extra['kind']; label: string; icon: ReactNode }[] = [
  { kind: 'curve', label: 'Line', icon: <Slash className="h-3.5 w-3.5" /> },
  { kind: 'point', label: 'Point', icon: <Crosshair className="h-3.5 w-3.5" /> },
  { kind: 'area', label: 'Shading', icon: <SquareDashed className="h-3.5 w-3.5" /> },
  { kind: 'arrow', label: 'Arrow', icon: <ArrowUpRight className="h-3.5 w-3.5" /> },
  { kind: 'text', label: 'Text', icon: <Type className="h-3.5 w-3.5" /> },
];

const EXTRA_ICON: Record<Extra['kind'], ReactNode> = {
  curve: <Spline className="h-3.5 w-3.5" />,
  point: <Crosshair className="h-3.5 w-3.5" />,
  area: <SquareDashed className="h-3.5 w-3.5" />,
  arrow: <ArrowUpRight className="h-3.5 w-3.5" />,
  text: <Type className="h-3.5 w-3.5" />,
};

function newExtra(kind: Extra['kind'], panel: Scene['panels'][number]): Extra {
  const id = Math.random().toString(36).slice(2, 8);
  const x0 = panel.xMin ?? 0;
  const y0 = panel.yMin ?? 0;
  const xr = panel.xMax - x0;
  const yr = panel.yMax - y0;
  const at = (fx: number, fy: number): Vec => [x0 + xr * fx, y0 + yr * fy];
  switch (kind) {
    case 'text':
      return { kind, id, panel: panel.id, at: at(0.5, 0.8), text: 'Label' };
    case 'arrow':
      return { kind, id, panel: panel.id, from: at(0.4, 0.75), to: at(0.58, 0.75) };
    case 'curve':
      return { kind, id, panel: panel.id, points: [at(0.15, 0.2), at(0.85, 0.8)], label: '' };
    case 'point':
      return { kind, id, panel: panel.id, at: at(0.5, 0.5), xLabel: 'Q_1', yLabel: 'P_1' };
    case 'area':
      return { kind, id, panel: panel.id, points: [at(0.3, 0.3), at(0.5, 0.3), at(0.5, 0.5), at(0.3, 0.5)], role: 'neutral', label: '' };
  }
}

function extraName(x: Extra): string {
  const label = x.kind === 'text' ? x.text : x.label;
  const kind = { curve: 'Line', point: 'Point', area: 'Shading', arrow: 'Arrow', text: 'Text' }[x.kind];
  return label ? `${kind}: ${plainText(label)}` : kind;
}

function DrawSection({ scene }: { scene: Scene }) {
  const extras = useEditor((s) => s.doc.extras);
  const selected = useEditor((s) => s.selected);
  const addExtra = useEditor((s) => s.addExtra);
  const removeExtra = useEditor((s) => s.removeExtra);
  const select = useEditor((s) => s.select);
  const [panelId, setPanelId] = useState(scene.panels[0].id);
  const panel = scene.panels.find((p) => p.id === panelId) ?? scene.panels[0];
  const keyOf = (x: Extra) => `${x.panel}.${EXTRA_PREFIX}${x.id}`;

  return (
    <Section title="Draw your own">
      <p className="mb-2 text-xs leading-4 text-muted">
        Add lines, points, shading and notes to any diagram. Points and shading snap to intersections.
      </p>
      {scene.panels.length > 1 && (
        <div className="mb-2">
          <SelectInput
            ariaLabel="Panel to draw on"
            value={panel.id}
            onChange={setPanelId}
            options={scene.panels.map((p) => ({ value: p.id, label: `Draw on: ${p.title ?? p.id}` }))}
          />
        </div>
      )}
      <div className="grid grid-cols-3 gap-1.5">
        {DRAW_TOOLS.map((t) => (
          <Button
            key={t.kind}
            size="sm"
            icon={t.icon}
            onClick={() => {
              const x = newExtra(t.kind, panel);
              addExtra(x);
              select(keyOf(x));
            }}
          >
            {t.label}
          </Button>
        ))}
      </div>
      {extras.length > 0 && (
        <ul className="mt-2.5 space-y-0.5">
          {extras.map((x) => (
            <li
              key={x.id}
              className={cx(
                'flex items-center gap-2 rounded-lg pl-2 text-[13px]',
                selected === keyOf(x) ? 'bg-accent-soft text-accent' : 'hover:bg-surface-3',
              )}
            >
              <span className="shrink-0 text-faint">{EXTRA_ICON[x.kind]}</span>
              <button type="button" className="min-w-0 flex-1 truncate py-1.5 text-left" onClick={() => select(keyOf(x))}>
                {extraName(x)}
              </button>
              <IconButton label="Delete" className="h-7 w-7" onClick={() => removeExtra(x.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Labels tab

function LabelsTab({ scene }: { scene: Scene }) {
  const overrides = useEditor((s) => s.doc.overrides);
  const setOverride = useEditor((s) => s.setOverride);
  const resetLabels = useEditor((s) => s.resetLabels);
  const select = useEditor((s) => s.select);
  const labels = useMemo(() => collectLabels(scene), [scene]);
  const multi = scene.panels.length > 1;
  const byPanel = new Map<string, LabelEntry[]>();
  for (const l of labels) {
    if (!byPanel.has(l.panelId)) byPanel.set(l.panelId, []);
    byPanel.get(l.panelId)!.push(l);
  }
  const anyOverride = Object.keys(overrides).length > 0;

  return (
    <>
      <Section>
        <p className="flex items-start gap-1.5 text-xs leading-5 text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Type <code className="rounded bg-surface-3 px-1 text-ink">_</code> for subscripts:{' '}
            <code className="rounded bg-surface-3 px-1 text-ink">P_1</code> → P₁,{' '}
            <code className="rounded bg-surface-3 px-1 text-ink">{'P_{max}'}</code> → P<sub>max</sub>. Leave a field empty to
            restore the default.
          </span>
        </p>
      </Section>
      {[...byPanel.entries()].map(([pid, items]) => (
        <Section key={pid} title={multi ? (items[0].panelTitle ?? pid) : 'All labels'}>
          <ul className="space-y-1.5">
            {items.map((l) => {
              const o = overrides[l.key];
              const hidden = !!o?.hidden;
              return (
                <li key={l.key} className="flex items-center gap-1.5">
                  <div className="min-w-0 flex-1">
                    <TextInput
                      ariaLabel={`${l.hint}: ${plainText(l.text)}`}
                      value={o?.label ?? ''}
                      placeholder={plainText(l.text) || l.text}
                      onChange={(v) => setOverride(l.key, { label: v === '' ? undefined : v }, { coalesce: `l:${l.key}` })}
                      className={cx(hidden && 'opacity-50', 'h-8')}
                    />
                  </div>
                  <span className="hidden w-20 shrink-0 truncate text-[11px] text-faint xl:block" title={l.hint}>
                    {l.hint}
                  </span>
                  <IconButton
                    label={hidden ? 'Show' : 'Hide'}
                    onClick={() => setOverride(l.key, { hidden: hidden ? undefined : true })}
                    onFocus={() => select(l.key)}
                  >
                    {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </IconButton>
                </li>
              );
            })}
          </ul>
        </Section>
      ))}
      <Section>
        <Button size="sm" variant="ghost" disabled={!anyOverride} icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={resetLabels}>
          Reset all labels, colours &amp; positions
        </Button>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Style tab

function StyleTab() {
  const style = useEditor((s) => s.style);
  const setStyle = useEditor((s) => s.setStyle);
  const title = useEditor((s) => s.doc.title);
  const setTitle = useEditor((s) => s.setTitle);
  const set = <K extends keyof GraphStyle>(k: K, v: GraphStyle[K], coalesce?: boolean) =>
    setStyle({ [k]: v } as Partial<GraphStyle>, coalesce ? { coalesce: `s:${k}` } : undefined);

  return (
    <>
      <Section title="Figure title">
        <Switch checked={style.showTitle} onChange={(v) => set('showTitle', v)} label="Show title above the graph" />
        <TextInput ariaLabel="Figure title" value={title} onChange={(v) => setTitle(v)} placeholder="Figure 1: …" />
      </Section>
      <Section title="Colour">
        <Segmented
          ariaLabel="Colour scheme"
          value={style.palette}
          onChange={(v) => set('palette', v)}
          options={[
            { value: 'color', label: 'Colour' },
            { value: 'classic', label: 'Black ink', title: 'Black curves with coloured shading' },
            { value: 'mono', label: 'Print B/W', title: 'Black and white with hatched areas' },
          ]}
        />
        <p className="mt-1.5 text-xs leading-4 text-muted">
          {style.palette === 'mono'
            ? 'Shaded areas use hatching so they survive black-and-white printing.'
            : style.palette === 'classic'
              ? 'Textbook look: black curves, coloured shading.'
              : 'Each curve type gets its own colour; labels stay black.'}
        </p>
        {style.palette !== 'mono' && (
          <SliderField
            label="Shading strength"
            value={style.areaOpacity}
            min={0.1}
            max={0.7}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => set('areaOpacity', v, true)}
          />
        )}
      </Section>
      <Section title="Text">
        <Field label="Font">
          <Segmented
            ariaLabel="Font"
            value={style.font}
            onChange={(v) => set('font', v)}
            options={[
              { value: 'sans', label: <span style={{ fontFamily: 'Inter' }}>Sans</span> },
              { value: 'serif', label: <span style={{ fontFamily: "'Source Serif 4'" }}>Serif</span> },
              { value: 'hand', label: <span style={{ fontFamily: 'Kalam' }}>Hand</span> },
            ]}
          />
        </Field>
        <SliderField
          label="Text size"
          value={style.fontScale}
          min={0.75}
          max={1.5}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => set('fontScale', v, true)}
        />
        <Field label="Axis titles">
          <Segmented
            ariaLabel="Axis title position"
            value={style.axisLabels}
            onChange={(v) => set('axisLabels', v)}
            options={[
              { value: 'end', label: 'At axis ends' },
              { value: 'center', label: 'Centred' },
            ]}
          />
        </Field>
        <Field label="Shaded-area labels">
          <SelectInput
            ariaLabel="Shaded-area labels"
            value={style.areaLabels}
            onChange={(v) => set('areaLabels', v as GraphStyle['areaLabels'])}
            options={[
              { value: 'inside', label: 'Inside the area' },
              { value: 'legend', label: 'Legend (key) below' },
              { value: 'both', label: 'Both' },
              { value: 'none', label: 'None' },
            ]}
          />
        </Field>
      </Section>
      <Section title="Lines & axes">
        <SliderField
          label="Line weight"
          value={style.strokeScale}
          min={0.6}
          max={2}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => set('strokeScale', v, true)}
        />
        <Switch checked={style.axisArrows} onChange={(v) => set('axisArrows', v)} label="Arrowheads on axes" />
        <Switch checked={style.showOrigin} onChange={(v) => set('showOrigin', v)} label="Label the origin (0)" />
        <Switch checked={style.dots} onChange={(v) => set('dots', v)} label="Dots on key points" />
        <Switch
          checked={style.background === 'transparent'}
          onChange={(v) => set('background', v ? 'transparent' : 'white')}
          label="Transparent background"
          help="For pasting onto coloured slides."
        />
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Selection card

const AREA_ROLES: { value: AreaRole; label: string }[] = [
  { value: 'neutral', label: 'Neutral (grey)' },
  { value: 'cs', label: 'Consumer surplus (blue)' },
  { value: 'ps', label: 'Producer surplus (orange)' },
  { value: 'dwl', label: 'Welfare loss (grey)' },
  { value: 'gov', label: 'Tax revenue / gov. spending (violet)' },
  { value: 'profit', label: 'Profit (green)' },
  { value: 'loss', label: 'Loss (red)' },
  { value: 'gain', label: 'Gain (aqua)' },
  { value: 'cost', label: 'Cost (yellow)' },
];

/** Insert a control point in the longest segment, nudged sideways so the line visibly bends. */
function bend(points: Vec[], scene: Scene, panelId: string): Vec[] {
  const panel = scene.panels.find((p) => p.id === panelId) ?? scene.panels[0];
  let best = 0;
  let bestLen = -1;
  for (let i = 0; i < points.length - 1; i++) {
    const l = Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
    if (l > bestLen) {
      bestLen = l;
      best = i;
    }
  }
  const a = points[best];
  const b = points[best + 1];
  const yr = panel.yMax - (panel.yMin ?? 0);
  const mid: Vec = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - yr * 0.08];
  return [...points.slice(0, best + 1), mid, ...points.slice(best + 1)];
}

const SWATCHES = ['#0b0b0b', '#2a78d6', '#eb6834', '#1baf7a', '#c98500', '#d55181', '#008300', '#6250d6', '#e34948', '#898781'];

function SelectionCard({ scene, selKey }: { scene: Scene; selKey: string }) {
  const overrides = useEditor((s) => s.doc.overrides);
  const setOverride = useEditor((s) => s.setOverride);
  const select = useEditor((s) => s.select);
  const removeExtra = useEditor((s) => s.removeExtra);
  const updateExtra = useEditor((s) => s.updateExtra);
  const extras = useEditor((s) => s.doc.extras);
  const found = findByKey(scene, selKey);
  if (!found) return null;
  const o: ElementOverride = overrides[selKey] ?? {};
  const el = found.el;
  const isPart = !!found.part || !el;
  const extra = found.extraId ? extras.find((x) => x.id === found.extraId) : undefined;
  const kindName = !el
    ? found.part === 'title'
      ? 'Panel title'
      : found.part === 'origin'
        ? 'Origin label'
        : found.part === 'x'
          ? 'Horizontal axis title'
          : 'Vertical axis title'
    : found.part
      ? found.part === 'x'
        ? 'Horizontal-axis value'
        : 'Vertical-axis value'
      : extra
        ? ({ text: 'Your text', arrow: 'Your arrow', curve: 'Your line', point: 'Your point', area: 'Your shading' } as const)[extra.kind]
        : ({ curve: 'Curve', point: 'Point', area: 'Shaded area', line: 'Arrow / line', text: 'Text', tick: 'Axis mark' } as const)[
            el.kind
          ];
  const def = defaultLabel(scene, selKey);
  const colourable = !isPart && el && el.kind !== 'tick';
  const dashable = !isPart && el && (el.kind === 'curve' || el.kind === 'line');
  const hasText = !extra && (def !== '' || o.label !== undefined || (el && el.kind !== 'area'));

  const row = (label: string, child: ReactNode) => (
    <div key={label} className="flex items-center gap-2 py-1">
      <span className="w-14 shrink-0 text-xs text-muted">{label}</span>
      <div className="min-w-0 flex-1">{child}</div>
    </div>
  );

  return (
    <div className="border-b border-line bg-accent-soft/40 px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-semibold tracking-wider text-accent uppercase">Selected · {kindName}</span>
        <div className="flex-1" />
        <IconButton label="Deselect" onClick={() => select(null)} className="h-6 w-6">
          <X className="h-3.5 w-3.5" />
        </IconButton>
      </div>
      {extra && extra.kind === 'text' &&
        row(
          'Text',
          <TextInput ariaLabel="Annotation text" value={extra.text} onChange={(v) => updateExtra(extra.id, { text: v }, { coalesce: `x:${extra.id}` })} />,
        )}
      {extra && extra.kind === 'arrow' &&
        row(
          'Label',
          <TextInput
            ariaLabel="Arrow label"
            value={extra.label ?? ''}
            placeholder="Optional"
            onChange={(v) => updateExtra(extra.id, { label: v }, { coalesce: `x:${extra.id}` })}
          />,
        )}
      {extra && extra.kind === 'curve' && (
        <>
          {row(
            'Label',
            <TextInput
              ariaLabel="Line label"
              value={extra.label ?? ''}
              placeholder="e.g. S_2 or AD_3"
              onChange={(v) => updateExtra(extra.id, { label: v }, { coalesce: `x:${extra.id}` })}
            />,
          )}
          {row(
            'Shape',
            <div className="flex items-center gap-1.5">
              <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => updateExtra(extra.id, { points: bend(extra.points, scene, extra.panel) })}>
                Add bend
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Minus className="h-3.5 w-3.5" />}
                disabled={extra.points.length <= 2}
                onClick={() => updateExtra(extra.id, { points: extra.points.filter((_, i) => i !== extra.points.length - 2) })}
              >
                Remove
              </Button>
            </div>,
          )}
        </>
      )}
      {extra && extra.kind === 'point' && (
        <>
          {row(
            'Label',
            <TextInput
              ariaLabel="Point label"
              value={extra.label ?? ''}
              placeholder="e.g. E_1 or A"
              onChange={(v) => updateExtra(extra.id, { label: v }, { coalesce: `x:${extra.id}` })}
            />,
          )}
          {(['xLabel', 'yLabel'] as const).map((k) =>
            row(
              k === 'xLabel' ? 'To x-axis' : 'To y-axis',
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={k === 'xLabel' ? 'Guide to horizontal axis' : 'Guide to vertical axis'}
                  className="h-4 w-4 accent-[var(--accent)]"
                  checked={extra[k] !== undefined}
                  onChange={(e) => updateExtra(extra.id, { [k]: e.target.checked ? (k === 'xLabel' ? 'Q_1' : 'P_1') : undefined })}
                />
                <TextInput
                  ariaLabel={k === 'xLabel' ? 'Horizontal-axis label' : 'Vertical-axis label'}
                  value={extra[k] ?? ''}
                  placeholder={extra[k] === undefined ? 'no guide' : 'guide only'}
                  onChange={(v) => updateExtra(extra.id, { [k]: v }, { coalesce: `x:${extra.id}:${k}` })}
                />
              </div>,
            ),
          )}
        </>
      )}
      {extra && extra.kind === 'area' && (
        <>
          {row(
            'Label',
            <TextInput
              ariaLabel="Shading label"
              value={extra.label ?? ''}
              placeholder="e.g. DWL or A"
              onChange={(v) => updateExtra(extra.id, { label: v }, { coalesce: `x:${extra.id}` })}
            />,
          )}
          {row(
            'Meaning',
            <SelectInput
              ariaLabel="Shading meaning"
              value={extra.role}
              onChange={(v) => updateExtra(extra.id, { role: v as AreaRole })}
              options={AREA_ROLES}
            />,
          )}
          <p className="pb-1 pl-16 text-xs text-muted">Drag the corners onto intersections — they snap.</p>
        </>
      )}
      {hasText &&
        row(
          'Text',
          <TextInput
            ariaLabel="Label text"
            value={o.label ?? ''}
            placeholder={plainText(def) || def || '(no label)'}
            onChange={(v) => setOverride(selKey, { label: v === '' ? undefined : v }, { coalesce: `l:${selKey}` })}
          />,
        )}
      {el?.kind === 'area' &&
        !isPart &&
        row(
          'Legend',
          <TextInput
            ariaLabel="Legend text"
            value={o.legend ?? ''}
            placeholder={el.legend ?? el.label ?? ''}
            onChange={(v) => setOverride(selKey, { legend: v === '' ? undefined : v }, { coalesce: `g:${selKey}` })}
          />,
        )}
      {colourable &&
        row(
          'Colour',
          <div className="flex flex-wrap items-center gap-1">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Colour ${c}`}
                onClick={() => setOverride(selKey, { color: c })}
                className={cx(
                  'h-5 w-5 rounded-full border border-black/10 transition-transform hover:scale-110',
                  o.color === c && 'ring-2 ring-accent ring-offset-1 ring-offset-surface',
                )}
                style={{ background: c }}
              />
            ))}
            <label className="relative h-5 w-5 cursor-pointer overflow-hidden rounded-full border border-line-strong bg-[conic-gradient(red,yellow,lime,aqua,blue,magenta,red)]" title="Custom colour">
              <input
                type="color"
                className="absolute inset-0 cursor-pointer opacity-0"
                value={o.color ?? '#2a78d6'}
                onChange={(e) => setOverride(selKey, { color: e.target.value }, { coalesce: `c:${selKey}` })}
              />
            </label>
            {o.color && (
              <button type="button" className="ml-1 text-xs text-muted hover:text-ink" onClick={() => setOverride(selKey, { color: undefined })}>
                Auto
              </button>
            )}
          </div>,
        )}
      {dashable &&
        row(
          'Line',
          <Segmented
            ariaLabel="Line style"
            value={(o.dash ?? (el && 'dash' in el ? el.dash : false)) ? 'dash' : 'solid'}
            onChange={(v) => setOverride(selKey, { dash: v === 'dash' })}
            options={[
              { value: 'solid', label: 'Solid' },
              { value: 'dash', label: 'Dashed' },
            ]}
          />,
        )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {extra ? (
          <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => removeExtra(extra.id)}>
            Delete
          </Button>
        ) : (
          <Button
            size="sm"
            icon={o.hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            onClick={() => setOverride(selKey, { hidden: o.hidden ? undefined : true })}
          >
            {o.hidden ? 'Show' : 'Hide'}
          </Button>
        )}
        {(o.dx || o.dy) && (
          <Button size="sm" variant="ghost" onClick={() => setOverride(selKey, { dx: undefined, dy: undefined })}>
            Reset position
          </Button>
        )}
        {Object.keys(o).length > 0 && !extra && (
          <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => setOverride(selKey, null)}>
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}
