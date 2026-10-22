import type { ImpactNode, Lang } from '@impact-map/engine';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { percent, signed } from '../format';
import { FanGraph } from '../graph/fanGraph';
import type { Dict } from '../i18n';

interface Props {
  t: Dict;
  lang: Lang;
  tree: ImpactNode | null;
  collapsed: ReadonlySet<string>;
  focus: ReadonlySet<string>;
  rootLabel: string;
  onToggle: (id: string) => void;
}

export interface GraphHandle {
  fit: () => void;
}

interface Hover {
  node: ImpactNode;
  path: ImpactNode[];
  x: number;
  y: number;
}

export const ImpactGraph = forwardRef<GraphHandle, Props>(function ImpactGraph(props, ref) {
  const { t, lang, tree, collapsed, focus, rootLabel, onToggle } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const graph = useRef<FanGraph | null>(null);
  const toggle = useRef(onToggle);
  const [hover, setHover] = useState<Hover | null>(null);

  useEffect(() => {
    toggle.current = onToggle;
  }, [onToggle]);

  useEffect(() => {
    const instance = new FanGraph(svgRef.current!, {
      toggle: (id) => toggle.current(id),
      hover: (node, path, at) => setHover(node && at ? { node, path, ...at } : null),
    });
    graph.current = instance;
    const box = boxRef.current!;
    const measure = () => instance.setSize(box.clientWidth, box.clientHeight);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(box);
    return () => {
      observer?.disconnect();
      instance.destroy();
      graph.current = null;
    };
  }, []);

  useEffect(() => {
    graph.current?.render(tree, {
      collapsed,
      focus,
      rootLabel,
      valueLabel: (v) => signed(v, lang),
    });
  }, [tree, collapsed, focus, rootLabel, lang]);

  useImperativeHandle(ref, () => ({ fit: () => graph.current?.fit(true) }), []);

  const n = hover?.node;
  return (
    <div className="graph" ref={boxRef}>
      <svg ref={svgRef} className="graph-svg" role="img" aria-label={rootLabel} />
      {n && hover && (
        <div className="tip" role="tooltip" style={{ left: hover.x, top: hover.y }}>
          <div className="tip-title">
            <i className={`dot ${n.uncertain ? 'unc' : n.score > 0 ? 'pos' : 'neg'}`} />
            {n.label} <span className="muted">· {n.areaLabel}</span>
          </div>
          <dl>
            <dt>{t.tip.degree}</dt>
            <dd className="num">{signed(n.score, lang)}</dd>
            <dt>{t.tip.contribution}</dt>
            <dd className="num">{signed(n.value, lang, 3)}</dd>
            <dt>{t.tip.path}</dt>
            <dd>
              {hover.path
                .slice(1)
                .map((p) => p.label)
                .join(' → ')}
            </dd>
            <dt>{t.tip.evidence}</dt>
            <dd>
              {n.evidence} · {n.evidence ? t.evidence[n.evidence] : ''}
            </dd>
            <dt>{t.tip.when}</dt>
            <dd>{n.lag ? t.lag[n.lag] : ''}</dd>
            <dt>{t.tip.confidence}</dt>
            <dd className="num">{percent(n.confidence)}%</dd>
            {n.drivers.length > 0 && (
              <>
                <dt>{t.tip.drivers}</dt>
                <dd>
                  {n.drivers.map((d) => (
                    <div key={d.factorId}>
                      {d.label} <span className="num muted">{signed(d.value, lang, 3)}</span>
                    </div>
                  ))}
                </dd>
              </>
            )}
            {n.via && (
              <>
                <dt>{t.tip.link}</dt>
                <dd className="num">{signed(n.via.w, lang, 3)}</dd>
              </>
            )}
          </dl>
          {n.children.length > 0 && <div className="muted small">{t.tip.toggle}</div>}
        </div>
      )}
    </div>
  );
});
