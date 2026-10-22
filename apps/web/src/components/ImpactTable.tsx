import type { AreaResult, Lang, SubareaResult } from '@impact-map/engine';
import { Fragment, useState } from 'react';
import { percent, signed, tone } from '../format';
import type { Dict } from '../i18n';

interface Props {
  t: Dict;
  lang: Lang;
  areas: AreaResult[];
  deltas: Record<string, number> | null;
  focus: ReadonlySet<string>;
}

function Bar({
  score,
  range,
  uncertain,
}: {
  score: number;
  range: [number, number];
  uncertain: boolean;
}) {
  const left = (v: number) => `${((v + 1) / 2) * 100}%`;
  const from = Math.min(0, score);
  return (
    <span className="bar" aria-hidden="true">
      <span
        className="band"
        style={{ left: left(range[0]), width: `${((range[1] - range[0]) / 2) * 100}%` }}
      />
      <span
        className={`fill ${tone(score, uncertain)}`}
        style={{ left: left(from), width: `${(Math.abs(score) / 2) * 100}%` }}
      />
      <span className="zero" />
    </span>
  );
}

/** Share of the direct or indirect part in the impact, e.g. "96%". */
function share(part: number, s: SubareaResult): string {
  const whole = Math.abs(s.direct) + Math.abs(s.indirect);
  return whole < 1e-9 ? '–' : `${percent(Math.abs(part) / whole)}%`;
}

export function ImpactTable({ t, lang, areas, deltas, focus }: Props) {
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const visible = (s: SubareaResult) => showAll || Math.abs(s.score) >= 0.005;
  const flip = (id: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="table-wrap">
      <label className="small muted toggle">
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />{' '}
        {t.table.showAll}
      </label>
      <table className="impact-table">
        <thead>
          <tr>
            <th scope="col">{t.table.area}</th>
            <th scope="col" className="num">
              {t.table.impact}
            </th>
            <th scope="col" className="barcol" aria-label={t.table.range} />
            <th scope="col" className="num">
              {t.table.direct}
            </th>
            <th scope="col" className="num">
              {t.table.indirect}
            </th>
            {deltas && (
              <th scope="col" className="num" title={t.table.changeHint}>
                {t.table.change}
              </th>
            )}
            <th scope="col">{t.table.when}</th>
            <th scope="col">{t.table.evidence}</th>
            <th scope="col">{t.table.path}</th>
          </tr>
        </thead>
        <tbody>
          {areas.map((a) => {
            const rows = a.children.filter(visible);
            const open = !closed.has(a.id) && rows.length > 0;
            const dim = focus.size > 0 && !focus.has(a.id);
            return (
              <Fragment key={a.id}>
                <tr className={`area-row${dim ? ' faded' : ''}`}>
                  <th scope="row">
                    <button
                      type="button"
                      className="disclose"
                      aria-expanded={open}
                      onClick={() => flip(a.id)}
                      disabled={!rows.length}
                    >
                      <span className="caret">{open ? '▾' : '▸'}</span> {a.label}
                    </button>
                  </th>
                  <td className={`num strong ${tone(a.score, a.uncertain)}-text`}>
                    {signed(a.score, lang)}
                  </td>
                  <td className="barcol">
                    <Bar score={a.score} range={a.range} uncertain={a.uncertain} />
                  </td>
                  <td colSpan={deltas ? 6 : 5} />
                </tr>
                {open &&
                  rows.map((s) => (
                    <tr key={s.id} className={`sub-row${dim ? ' faded' : ''}`} data-id={s.id}>
                      <th scope="row" className="sub-label">
                        {s.label}
                        {s.uncertain && (
                          <span className="unc-text" title={t.view.uncertain}>
                            {' '}
                            ?
                          </span>
                        )}
                      </th>
                      <td className={`num ${tone(s.score, s.uncertain)}-text`}>
                        {signed(s.score, lang)}
                      </td>
                      <td
                        className="barcol"
                        title={`${signed(s.range[0], lang)} … ${signed(s.range[1], lang)}`}
                      >
                        <Bar score={s.score} range={s.range} uncertain={s.uncertain} />
                      </td>
                      <td className="num muted">{share(s.direct, s)}</td>
                      <td className="num muted">{share(s.indirect, s)}</td>
                      {deltas && <td className="num">{signed(deltas[s.id] ?? 0, lang)}</td>}
                      <td className="muted">{s.lag ? t.lag[s.lag] : '–'}</td>
                      <td className="muted" title={s.evidence ? t.evidence[s.evidence] : ''}>
                        {s.evidence ?? '–'}
                      </td>
                      <td className="path muted">
                        {s.path.map((p) => p.toLabel).join(' → ') || '–'}
                      </td>
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
