import { catalog as buildCatalog, type Lang } from '@impact-map/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadDecision, saveDecision, shareUrl } from './api';
import { DecisionSection } from './components/DecisionSection';
import type { GraphHandle } from './components/ImpactGraph';
import { ImpactSection } from './components/ImpactSection';
import { MethodDialog } from './components/MethodDialog';
import { OptionsPanel } from './components/OptionsPanel';
import { branchIds } from './graph/fanGraph';
import { dictionaries } from './i18n';
import {
  DEFAULT_SETTINGS,
  durationDays,
  effectiveFactors,
  loadStored,
  NO_OVERRIDES,
  overridesFor,
  runAnalysis,
  saveStored,
  type Overrides,
  type Settings,
} from './state';
import { useDebounced } from './useDebounced';

type ShareStatus =
  { kind: 'shared'; url: string } | { kind: 'failed' } | { kind: 'loadFailed' } | null;

const browserLang = (): Lang => (navigator.language?.toLowerCase().startsWith('hu') ? 'hu' : 'en');

export function App() {
  const [stored] = useState(loadStored);
  const [lang, setLang] = useState<Lang>(() => stored.lang ?? browserLang());
  const [theme, setTheme] = useState<'light' | 'dark' | null>(stored.theme ?? null);
  const [text, setText] = useState(stored.text ?? '');
  const [overrides, setOverrides] = useState<Overrides>(stored.overrides ?? NO_OVERRIDES);
  const [settings, setSettings] = useState<Settings>(() => ({
    ...DEFAULT_SETTINGS,
    ...stored.settings,
  }));
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [focus, setFocus] = useState<ReadonlySet<string>>(new Set());
  const [methodOpen, setMethodOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState<ShareStatus>(null);
  const graphRef = useRef<GraphHandle>(null);
  const t = dictionaries[lang];

  const settledText = useDebounced(text, 180);
  const catalog = useMemo(() => buildCatalog(lang), [lang]);
  const analysis = useMemo(
    () => runAnalysis(settledText, overrides, settings, lang),
    [settledText, overrides, settings, lang],
  );

  useEffect(() => {
    document.documentElement.lang = lang;
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    saveStored({ text, overrides, settings, lang, theme });
  }, [text, overrides, settings, lang, theme]);

  useEffect(() => {
    const id = new URLSearchParams(location.search).get('d');
    if (!id) return;
    loadDecision(id)
      .then((saved) => {
        const s = saved.settings;
        setText(saved.text);
        setLang(s.lang);
        setSettings((prev) => ({
          ...prev,
          steps: s.steps,
          people: s.people,
          windowDays: s.windowDays,
          duration: s.durationDays === null ? 'auto' : s.durationDays,
        }));
        setOverrides(
          overridesFor(
            runAnalysis(saved.text, NO_OVERRIDES, DEFAULT_SETTINGS, s.lang).interpretation,
            saved.factors,
          ),
        );
      })
      .catch(() => setShareStatus({ kind: 'loadFailed' }));
  }, []);

  const changeText = (value: string) => {
    setText(value);
    setShareStatus(null);
  };
  const useExample = (value: string) => {
    setText(value);
    setOverrides(NO_OVERRIDES);
    setCollapsed(new Set());
  };
  const toggle = useCallback(
    (id: string) =>
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );
  const changeFocus = (areaId: string | null) =>
    setFocus((prev) => {
      if (areaId === null) return new Set();
      const next = new Set(prev);
      if (next.has(areaId)) next.delete(areaId);
      else next.add(areaId);
      return next;
    });

  const share = async () => {
    const factors = effectiveFactors(analysis.interpretation, overrides);
    const edited =
      overrides.removed.length + overrides.added.length + Object.keys(overrides.intensity).length >
      0;
    try {
      const { id } = await saveDecision({
        text,
        factors: edited ? factors : null,
        settings: {
          steps: settings.steps,
          people: settings.people,
          windowDays: settings.windowDays,
          durationDays: durationDays(settings) ?? null,
          lang,
        },
      });
      const url = shareUrl(id);
      history.replaceState(null, '', url);
      await navigator.clipboard?.writeText(url).catch(() => undefined);
      setShareStatus({ kind: 'shared', url });
    } catch {
      setShareStatus({ kind: 'failed' });
    }
  };

  const reset = () => {
    setOverrides(NO_OVERRIDES);
    setSettings(DEFAULT_SETTINGS);
    setCollapsed(new Set());
    setFocus(new Set());
  };

  const { map, interpretation, deltas } = analysis;
  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <b>{t.brand}</b> <span className="muted">{t.tagline}</span>
        </div>
        <nav className="row">
          <button type="button" className="link" onClick={() => setMethodOpen(true)}>
            {t.method}
          </button>
          <button
            type="button"
            className="link"
            onClick={() => setLang(lang === 'hu' ? 'en' : 'hu')}
            aria-label="language"
          >
            {lang === 'hu' ? 'EN' : 'HU'}
          </button>
          <button
            type="button"
            className="link"
            title={t.theme}
            aria-label={t.theme}
            onClick={() => {
              const dark = theme
                ? theme === 'dark'
                : matchMedia?.('(prefers-color-scheme: dark)').matches;
              setTheme(dark ? 'light' : 'dark');
            }}
          >
            ◐
          </button>
        </nav>
      </header>

      <main>
        <DecisionSection
          t={t}
          lang={lang}
          text={text}
          onText={changeText}
          interpretation={interpretation}
          map={map}
          catalog={catalog}
          onExample={useExample}
          onRemove={(id) =>
            setOverrides((o) => ({
              ...o,
              removed: [...o.removed, id],
              added: o.added.filter((x) => x !== id),
            }))
          }
          onAdd={(id) =>
            setOverrides((o) => ({
              ...o,
              added: [...o.added, id],
              removed: o.removed.filter((x) => x !== id),
            }))
          }
          onIntensity={(id, intensity) =>
            setOverrides((o) => ({ ...o, intensity: { ...o.intensity, [id]: intensity } }))
          }
        />
        <div className="workspace">
          <OptionsPanel
            t={t}
            lang={lang}
            settings={settings}
            onSettings={(patch) => setSettings((s) => ({ ...s, ...patch }))}
            textDurationDays={interpretation.durationDays}
            areas={map.areas}
            focus={focus}
            onFocus={changeFocus}
            onExpandAll={() => setCollapsed(new Set())}
            onCollapseAll={() => setCollapsed(new Set(map.tree ? branchIds(map.tree) : []))}
            onFit={() => graphRef.current?.fit()}
            onShare={share}
            onReset={reset}
            shareStatus={
              shareStatus?.kind === 'shared'
                ? `${t.options.shared} ${shareStatus.url}`
                : shareStatus?.kind === 'failed'
                  ? t.options.shareFailed
                  : shareStatus?.kind === 'loadFailed'
                    ? t.options.loadFailed
                    : null
            }
            hasFactors={map.factors.length > 0}
          />
          <ImpactSection
            ref={graphRef}
            t={t}
            lang={lang}
            map={map}
            deltas={deltas}
            collapsed={collapsed}
            focus={focus}
            onToggle={toggle}
          />
        </div>
      </main>
      <MethodDialog lang={lang} open={methodOpen} onClose={() => setMethodOpen(false)} />
    </div>
  );
}
