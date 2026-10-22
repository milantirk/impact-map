import type { AreaResult, Lang } from '@impact-map/engine';
import {
  DURATION_PRESETS,
  integer,
  peopleFromSlider,
  signed,
  sliderFromPeople,
  tone,
  WINDOW_PRESETS,
} from '../format';
import type { Dict } from '../i18n';
import type { Settings } from '../state';

interface Props {
  t: Dict;
  lang: Lang;
  settings: Settings;
  onSettings: (patch: Partial<Settings>) => void;
  textDurationDays: number | null;
  areas: AreaResult[];
  focus: ReadonlySet<string>;
  onFocus: (areaId: string | null) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onFit: () => void;
  onShare: () => void;
  onReset: () => void;
  shareStatus: string | null;
  hasFactors: boolean;
}

export function OptionsPanel(props: Props) {
  const { t, lang, settings, onSettings, areas, focus } = props;
  const durationValue =
    typeof settings.duration === 'number' ? String(settings.duration) : settings.duration;
  const autoLabel =
    props.textDurationDays === null
      ? `${t.options.durationAuto} (${t.options.durationSustained})`
      : `${t.options.durationAuto} (${integer(props.textDurationDays, lang)} d)`;

  return (
    <aside className="panel options" aria-labelledby="options-title">
      <h2 id="options-title" className="eyebrow">
        {t.options.title}
      </h2>
      <p className="muted small">{t.options.subtitle}</p>

      <label className="field">
        <span>
          {t.options.steps} <output className="num">{settings.steps}</output>
        </span>
        <input
          type="range"
          min={1}
          max={7}
          step={1}
          value={settings.steps}
          onChange={(e) => onSettings({ steps: Number(e.target.value) })}
          aria-describedby="steps-hint"
        />
        <small id="steps-hint" className="muted">
          {t.options.stepsHint}
        </small>
      </label>

      <label className="field">
        <span>
          {t.options.people}{' '}
          <output className="num">
            {integer(settings.people, lang)} {t.options.peopleUnit}
          </output>
        </span>
        <input
          type="range"
          min={0}
          max={9}
          step={0.5}
          value={sliderFromPeople(settings.people)}
          onChange={(e) => onSettings({ people: peopleFromSlider(Number(e.target.value)) })}
        />
      </label>

      <label className="field">
        <span>{t.options.window}</span>
        <select
          value={settings.windowDays}
          onChange={(e) => onSettings({ windowDays: Number(e.target.value) })}
          disabled={settings.people === 1}
          aria-describedby="window-hint"
        >
          {WINDOW_PRESETS.map((d) => (
            <option key={d} value={d}>
              {t.windows[d]}
            </option>
          ))}
        </select>
        <small id="window-hint" className="muted">
          {t.options.windowHint}
        </small>
      </label>

      <label className="field">
        <span>{t.options.duration}</span>
        <select
          value={durationValue}
          onChange={(e) => {
            const v = e.target.value;
            onSettings({ duration: v === 'auto' || v === 'sustained' ? v : Number(v) });
          }}
        >
          <option value="auto">{autoLabel}</option>
          <option value="sustained">{t.options.durationSustained}</option>
          {DURATION_PRESETS.map((d) => (
            <option key={d} value={d}>
              {t.durations[d]}
            </option>
          ))}
        </select>
      </label>

      <div className="field">
        <span>{t.options.detail}</span>
        <div className="segmented" role="radiogroup" aria-label={t.options.detail}>
          {t.options.detailLevels.map((label, i) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={settings.detail === i}
              className={settings.detail === i ? 'active' : ''}
              onClick={() => onSettings({ detail: i as Settings['detail'] })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>
          {t.options.areas}{' '}
          {focus.size > 0 && (
            <button type="button" className="link small" onClick={() => props.onFocus(null)}>
              {t.options.all}
            </button>
          )}
        </span>
        <ul className="area-list" aria-label={t.options.areasHint}>
          {areas.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className={`area-pick${focus.has(a.id) ? ' active' : ''}${focus.size && !focus.has(a.id) ? ' off' : ''}`}
                aria-pressed={focus.has(a.id)}
                onClick={() => props.onFocus(a.id)}
              >
                <i className={`dot ${tone(a.score, a.uncertain)}`} />
                <span>{a.label}</span>
                <span className="num muted">{signed(a.score, lang)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="row wrap">
        <button type="button" className="link" onClick={props.onExpandAll}>
          {t.options.expandAll}
        </button>
        <button type="button" className="link" onClick={props.onCollapseAll}>
          {t.options.collapseAll}
        </button>
        <button type="button" className="link" onClick={props.onFit}>
          {t.options.fit}
        </button>
        <button type="button" className="link" onClick={props.onReset}>
          {t.options.reset}
        </button>
      </div>

      <button
        type="button"
        className="primary"
        onClick={props.onShare}
        disabled={!props.hasFactors}
      >
        {t.options.share}
      </button>
      <p className="small muted" role="status" aria-live="polite">
        {props.shareStatus ?? ''}
      </p>
    </aside>
  );
}
