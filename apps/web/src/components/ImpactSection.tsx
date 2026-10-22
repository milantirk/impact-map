import type { ImpactMap, Lang } from '@impact-map/engine';
import { forwardRef, useState } from 'react';
import { integer, percent, signed, tone } from '../format';
import { fill, type Dict } from '../i18n';
import { ImpactGraph, type GraphHandle } from './ImpactGraph';
import { ImpactTable } from './ImpactTable';

interface Props {
  t: Dict;
  lang: Lang;
  map: ImpactMap;
  deltas: Record<string, number> | null;
  collapsed: ReadonlySet<string>;
  focus: ReadonlySet<string>;
  onToggle: (id: string) => void;
}

export const ImpactSection = forwardRef<GraphHandle, Props>(function ImpactSection(props, ref) {
  const { t, lang, map, deltas, collapsed, focus, onToggle } = props;
  const [view, setView] = useState<'graph' | 'table'>('graph');
  const subs = map.areas.flatMap((a) => a.children).filter((s) => Math.abs(s.score) >= 0.02);
  const top = (sign: 1 | -1) =>
    subs
      .filter((s) => Math.sign(s.score) === sign && !s.uncertain)
      .sort((a, b) => sign * (b.score - a.score))
      .slice(0, 3)
      .map((s) => s.label);
  const uncertain = subs.filter((s) => s.uncertain).map((s) => s.label);
  const empty = map.factors.length === 0;
  const p = map.params;

  return (
    <section className="impact" aria-label={t.view.graph}>
      <div className="impact-bar">
        <div className="tabs" role="tablist">
          {(['graph', 'table'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              className={view === v ? 'active' : ''}
              onClick={() => setView(v)}
            >
              {t.view[v]}
            </button>
          ))}
        </div>
        {!empty && (
          <p className="summary small">
            <span>
              {t.view.overall}{' '}
              <b className={`num ${tone(map.net)}-text`}>{signed(map.net, lang)}</b>
            </span>
            {top(1).length > 0 && (
              <span>
                <i className="dot pos" /> {t.view.improves}: {top(1).join(', ')}
              </span>
            )}
            {top(-1).length > 0 && (
              <span>
                <i className="dot neg" /> {t.view.worsens}: {top(-1).join(', ')}
              </span>
            )}
            {uncertain.length > 0 && (
              <span>
                <i className="dot unc" /> {t.view.uncertain}: {uncertain.slice(0, 3).join(', ')}
              </span>
            )}
          </p>
        )}
      </div>

      {!empty && (p.people > 1 || map.treeStats) && (
        <p className="meta small muted">
          {p.people > 1 && (
            <span>
              {fill(t.view.scenario, {
                people: integer(p.people, lang),
                window: t.windows[p.windowDays] ?? `${p.windowDays} d`,
              })}
            </span>
          )}
          {map.treeStats && (
            <span>
              {integer(map.treeStats.nodes, lang)} {t.view.nodes} ·{' '}
              {fill(t.view.coverage, { p: percent(map.treeStats.coverage) })}
              {map.treeStats.truncated ? ` · ${t.view.truncated}` : ''}
            </span>
          )}
        </p>
      )}

      {empty ? (
        <p className="empty muted">{t.view.empty}</p>
      ) : view === 'graph' ? (
        <>
          <ImpactGraph
            ref={ref}
            t={t}
            lang={lang}
            tree={map.tree}
            collapsed={collapsed}
            focus={focus}
            rootLabel={map.tree?.label ?? t.view.decision}
            onToggle={onToggle}
          />
          <div className="legend small muted">
            <span>
              <i className="dot root" /> {t.view.decision}
            </span>
            <span>
              <i className="dot pos" /> {t.view.improves}
            </span>
            <span>
              <i className="dot neg" /> {t.view.worsens}
            </span>
            <span>
              <i className="dot unc" /> {t.view.uncertain}
            </span>
            <span className="hint-line">{t.view.hint}</span>
          </div>
        </>
      ) : (
        <ImpactTable t={t} lang={lang} areas={map.areas} deltas={deltas} focus={focus} />
      )}
    </section>
  );
});
