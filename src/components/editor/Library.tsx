import { useMemo, useState } from 'react';
import { Bookmark, ChevronRight, Search, Trash2, X } from 'lucide-react';
import type { Template } from '~/engine/types';
import { groupedTemplates } from '~/templates';
import { useEditor, type SavedGraph } from '~/store/editor';
import { Badge, cx, IconButton } from './ui';

function matches(t: Template, q: string): boolean {
  if (!q) return true;
  const hay = [t.name, t.topic, t.description, ...(t.keywords ?? []), t.hl ? 'hl higher level' : '']
    .join(' ')
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export function Library({
  activeId,
  onPick,
  onOpenSaved,
}: {
  activeId: string;
  onPick: (id: string) => void;
  onOpenSaved: (g: SavedGraph) => void;
}) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'all' | 'saved'>('all');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const saved = useEditor((s) => s.saved);
  const deleteSaved = useEditor((s) => s.deleteSaved);

  const groups = useMemo(
    () =>
      groupedTemplates()
        .map((g) => ({
          ...g,
          topics: g.topics
            .map((tp) => ({ ...tp, items: tp.items.filter((t) => matches(t, query)) }))
            .filter((tp) => tp.items.length),
        }))
        .filter((g) => g.topics.length),
    [query],
  );
  const count = groups.reduce((s, g) => s + g.topics.reduce((a, t) => a + t.items.length, 0), 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2.5 border-b border-line p-3">
        <div className="flex rounded-lg bg-surface-3 p-0.5 text-xs font-medium">
          {(['all', 'saved'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cx(
                'flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md transition-colors',
                tab === k ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
              )}
            >
              {k === 'all' ? 'All diagrams' : 'My graphs'}
              {k === 'saved' && saved.length > 0 && <span className="text-faint tabular-nums">{saved.length}</span>}
            </button>
          ))}
        </div>
        {tab === 'all' && (
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search diagrams… e.g. tariff"
              aria-label="Search diagrams"
              className="h-8.5 w-full rounded-lg border border-line bg-surface pr-7 pl-8 text-[13px] text-ink placeholder:text-faint hover:border-line-strong focus:border-accent focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery('')}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-faint hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      <nav className="scroll-thin min-h-0 flex-1 overflow-y-auto pb-6" aria-label="Diagram library">
        {tab === 'all' ? (
          <>
            {query && (
              <p className="px-4 pt-3 text-xs text-muted">
                {count} {count === 1 ? 'match' : 'matches'}
              </p>
            )}
            {groups.map(({ unit, topics }) => {
              const isCollapsed = !query && collapsed[unit.id];
              return (
                <div key={unit.id} className="pt-2">
                  <button
                    type="button"
                    onClick={() => setCollapsed((c) => ({ ...c, [unit.id]: !c[unit.id] }))}
                    className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[11px] font-semibold tracking-wider text-faint uppercase hover:text-muted"
                    aria-expanded={!isCollapsed}
                  >
                    <ChevronRight className={cx('h-3 w-3 transition-transform', !isCollapsed && 'rotate-90')} />
                    {unit.name}
                  </button>
                  {!isCollapsed &&
                    topics.map(({ topic, items }) => (
                      <div key={topic} className="mb-1">
                        <div className="px-4 pt-1.5 pb-1 text-xs font-medium text-muted">{topic}</div>
                        <ul>
                          {items.map((t) => (
                            <li key={t.id}>
                              <button
                                type="button"
                                onClick={() => onPick(t.id)}
                                aria-current={t.id === activeId ? 'page' : undefined}
                                className={cx(
                                  'group flex w-full items-center gap-2 py-1.5 pr-3 pl-6 text-left text-[13px] leading-5 transition-colors',
                                  t.id === activeId
                                    ? 'bg-accent-soft font-medium text-accent'
                                    : 'text-ink/85 hover:bg-surface-3 hover:text-ink',
                                )}
                              >
                                <span className="min-w-0 flex-1">{t.name}</span>
                                {t.hl && <Badge>HL</Badge>}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                </div>
              );
            })}
            {count === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted">
                No diagrams match “{query}”.
              </p>
            )}
          </>
        ) : saved.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Bookmark className="mx-auto mb-3 h-6 w-6 text-faint" />
            <p className="text-sm font-medium text-ink">No saved graphs yet</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              Use <span className="font-medium text-ink">Save</span> in the toolbar to keep a finished graph — handy when
              your IA needs several figures.
            </p>
          </div>
        ) : (
          <ul className="py-2">
            {saved.map((g) => (
              <li key={g.id} className="group flex items-center gap-1 pr-2 hover:bg-surface-3">
                <button
                  type="button"
                  onClick={() => onOpenSaved(g)}
                  className="min-w-0 flex-1 py-2 pl-4 text-left"
                >
                  <span className="block truncate text-[13px] font-medium text-ink">{g.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {new Date(g.savedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ·{' '}
                    {g.doc.templateId.replace(/-/g, ' ')}
                  </span>
                </button>
                <IconButton
                  label={`Delete ${g.name}`}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                  onClick={() => deleteSaved(g.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </div>
  );
}
