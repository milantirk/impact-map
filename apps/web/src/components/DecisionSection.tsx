import type { Catalog, ImpactMap, Interpretation, Lang } from '@impact-map/engine';
import { useId, useState } from 'react';
import { percent } from '../format';
import type { Dict } from '../i18n';
import { INTENSITY_LEVELS } from '../state';

interface Props {
  t: Dict;
  lang: Lang;
  text: string;
  onText: (text: string) => void;
  interpretation: Interpretation;
  map: ImpactMap;
  catalog: Catalog;
  onRemove: (id: string) => void;
  onAdd: (id: string) => void;
  onIntensity: (id: string, intensity: number) => void;
  onExample: (text: string) => void;
}

const nextLevel = (value: number) => {
  const i = INTENSITY_LEVELS.findIndex((l) => l >= value - 1e-9);
  return INTENSITY_LEVELS[(i + 1) % INTENSITY_LEVELS.length]!;
};

export function DecisionSection({
  t,
  text,
  onText,
  interpretation,
  map,
  catalog,
  onRemove,
  onAdd,
  onIntensity,
  onExample,
}: Props) {
  const [query, setQuery] = useState('');
  const listId = useId();
  const generic = new Set(interpretation.factors.filter((f) => f.generic).map((f) => f.id));
  const profile = map.profile;
  const precision = map.params.precision;

  const pick = (value: string) => {
    const hit = catalog.factors.find((f) => f.label.toLowerCase() === value.trim().toLowerCase());
    setQuery(value);
    if (hit) {
      onAdd(hit.id);
      setQuery('');
    }
  };

  return (
    <section className="panel decision" aria-labelledby="decision-title">
      <h2 id="decision-title" className="eyebrow">
        {t.decision.title}
      </h2>
      <textarea
        className="decision-text"
        value={text}
        onChange={(e) => onText(e.target.value)}
        placeholder={t.decision.placeholder}
        maxLength={5000}
        rows={3}
        aria-label={t.decision.title}
        spellCheck
      />
      <div className="examples" aria-label={t.decision.examples}>
        <span className="muted">{t.decision.examples}:</span>
        {catalog.examples.slice(0, 7).map((x) => (
          <button key={x.id} type="button" className="link" onClick={() => onExample(x.text)}>
            {x.title}
          </button>
        ))}
      </div>

      <div className="decision-grid">
        <div>
          <h3 className="eyebrow">{t.decision.factors}</h3>
          <ul className="chips" aria-live="polite">
            {map.factors.length === 0 && <li className="muted small">{t.decision.none}</li>}
            {map.factors.map((f) => (
              <li
                key={f.id}
                className={`chip${generic.has(f.id) ? ' generic' : ''}`}
                data-factor={f.id}
              >
                <span>{f.label}</span>
                {generic.has(f.id) && <em className="muted"> · {t.decision.generic}</em>}
                <button
                  type="button"
                  className="dots"
                  title={t.decision.intensity}
                  aria-label={`${t.decision.intensity}: ${f.label} ${Math.round(f.intensity * 100)}%`}
                  onClick={() => onIntensity(f.id, nextLevel(f.intensity))}
                >
                  {INTENSITY_LEVELS.map((level) => (
                    <i key={level} className={f.intensity >= level - 1e-9 ? 'on' : ''} />
                  ))}
                </button>
                <button
                  type="button"
                  className="x"
                  aria-label={`${t.decision.remove}: ${f.label}`}
                  onClick={() => onRemove(f.id)}
                >
                  ×
                </button>
              </li>
            ))}
            <li className="chip add">
              <input
                value={query}
                onChange={(e) => pick(e.target.value)}
                list={listId}
                placeholder={t.decision.add}
                aria-label={t.decision.addPlaceholder}
              />
              <datalist id={listId}>
                {catalog.factors.map((f) => (
                  <option key={f.id} value={f.label} />
                ))}
              </datalist>
            </li>
          </ul>
          {interpretation.negated.length > 0 && (
            <p className="muted small">
              {t.decision.negated}: {interpretation.negated.map((n) => n.label).join(', ')}
            </p>
          )}
        </div>

        <div>
          <h3 className="eyebrow" title={t.decision.precisionHint}>
            {t.decision.precision} <span className="num">{percent(precision)}%</span>
          </h3>
          <div
            className="meter"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Number(percent(precision))}
            aria-label={t.decision.precision}
          >
            <div style={{ width: `${percent(precision)}%` }} />
          </div>
          {interpretation.missing.length > 0 && (
            <p className="small hints">
              <span className="muted">{t.decision.addDetail}</span>
              {interpretation.missing.map((f) => (
                <span key={f} className="hint" title={t.facets[f][1]}>
                  {t.facets[f][0]}
                  <span className="muted"> ({t.facets[f][1]})</span>
                </span>
              ))}
            </p>
          )}
        </div>

        <div>
          <h3 className="eyebrow" title={t.decision.categoriesHint}>
            {t.decision.categories}
          </h3>
          {profile ? (
            <ul className="chips quiet" aria-label={t.decision.categoriesHint}>
              {profile.domains.map((d) => (
                <li key={d.id} className="chip">
                  {d.label} <span className="muted num">{percent(d.share)}%</span>
                </li>
              ))}
              <li className="chip">{t.scope[profile.reach]}</li>
              <li className="chip">{t.horizon[profile.horizon]}</li>
              <li className="chip">{t.magnitude[profile.magnitude]}</li>
              <li className={`chip${profile.certainty === 'low' ? ' unc' : ''}`}>
                {t.certainty[profile.certainty]}
              </li>
              <li className="chip">
                <span className="num">{percent(profile.positiveShare)}%</span>{' '}
                {t.decision.improving}
              </li>
            </ul>
          ) : (
            <p className="muted small">—</p>
          )}
        </div>
      </div>
    </section>
  );
}
