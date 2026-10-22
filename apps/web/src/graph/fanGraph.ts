import type { ImpactNode } from '@impact-map/engine';
import { easeCubicOut } from 'd3-ease';
import { hierarchy, tree as d3tree, type HierarchyPointNode } from 'd3-hierarchy';
import { select, type Selection } from 'd3-selection';
import type { Transition } from 'd3-transition';
import 'd3-transition';
import { zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import { tone } from '../format';

export interface GraphView {
  collapsed: ReadonlySet<string>;
  /** focused main areas; empty = all */
  focus: ReadonlySet<string>;
  rootLabel: string;
  valueLabel: (value: number) => string;
}

export interface GraphEvents {
  toggle: (id: string) => void;
  hover: (node: ImpactNode | null, path: ImpactNode[], at: { x: number; y: number } | null) => void;
}

interface Polar {
  angle: number;
  radius: number;
}
type Point = HierarchyPointNode<ImpactNode> & Polar & { px: number; py: number };
type Sel<E extends Element, D = unknown> = Selection<E, D, null, undefined>;
/** One shared transition for all element types (D3's types cannot express that). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTransition = Transition<any, any, any, any>;

const DURATION = 420;
const LABEL_MIN = 0.05;

const polar = (p: Polar): [number, number] => [
  p.radius * Math.sin(p.angle),
  -p.radius * Math.cos(p.angle),
];

/** Smooth radial curve between two nodes (same shape as d3.linkRadial). */
export function linkPath(a: Polar, b: Polar): string {
  const mid = (a.radius + b.radius) / 2;
  const [x0, y0] = polar(a);
  const [x1, y1] = polar({ angle: a.angle, radius: mid });
  const [x2, y2] = polar({ angle: b.angle, radius: mid });
  const [x3, y3] = polar(b);
  const r = (n: number) => Math.round(n * 10) / 10;
  return `M${r(x0)},${r(y0)}C${r(x1)},${r(y1)} ${r(x2)},${r(y2)} ${r(x3)},${r(y3)}`;
}

function arcPath(radius: number, span: number): string {
  const [x0, y0] = polar({ angle: -span / 2, radius });
  const [x1, y1] = polar({ angle: span / 2, radius });
  return `M${x0},${y0}A${radius},${radius} 0 ${span > Math.PI ? 1 : 0} 1 ${x1},${y1}`;
}

/** Inner rings get relatively more room, because the first steps carry the most labels. */
export const ringRadius = (step: number, depth: number, outer: number) =>
  outer * (step / depth) ** 0.75;

export const nodeRadius = (n: ImpactNode) =>
  n.depth === 0 ? 7 : 2.4 + 8 * Math.sqrt(Math.abs(n.score));

/** Ids of all nodes that have children (used for "collapse all"). */
export function branchIds(root: ImpactNode, maxDepth = 1): string[] {
  const out: string[] = [];
  const visit = (n: ImpactNode) => {
    if (n.depth > 0 && n.depth <= maxDepth && n.children.length) out.push(n.id);
    n.children.forEach(visit);
  };
  visit(root);
  return out;
}

interface LabelPlace {
  dx: number;
  dy: number;
  anchor: 'start' | 'middle' | 'end';
  show: boolean;
}

const CHAR_WIDTH = 5.7;
const VALUE_WIDTH = 34;

/**
 * Label position for every node. Labels are placed strongest first (step 1 before the rest);
 * a label that would overlap a placed one stays hidden until hover.
 */
export function placeLabels(nodes: Point[], view: GraphView): Map<string, LabelPlace> {
  const out = new Map<string, LabelPlace>();
  const boxes: Array<[number, number, number, number]> = [];
  const rootWidth = view.rootLabel.length * 6.2;
  boxes.push([-rootWidth / 2, 10, rootWidth / 2, 30]);
  const ranked = nodes
    .filter((n) => n.depth > 0)
    .map((n) => ({ n, importance: (n.depth === 1 ? 10 : 0) + Math.abs(n.data.value) }))
    .sort((a, b) => b.importance - a.importance);
  const overlaps = (box: number[]) =>
    boxes.some((b) => box[0]! < b[2] && box[2]! > b[0] && box[1]! < b[3] && box[3]! > b[1]);
  for (const { n } of ranked) {
    const gap = nodeRadius(n.data) + 5;
    const outward = n.angle < -0.18 ? 'end' : n.angle > 0.18 ? 'start' : 'middle';
    // outward first, then right, left, above, below
    const options: Array<Omit<LabelPlace, 'show'>> = [
      {
        anchor: outward,
        dx: Math.sin(n.angle) * gap,
        dy: -Math.cos(n.angle) * gap + (outward === 'middle' ? -4 : 4),
      },
      { anchor: 'start', dx: gap, dy: 4 },
      { anchor: 'end', dx: -gap, dy: 4 },
      { anchor: 'middle', dx: 0, dy: -gap - 2 },
      { anchor: 'middle', dx: 0, dy: gap + 10 },
    ];
    const wanted =
      n.depth <= 1 || Math.abs(n.data.score) >= LABEL_MIN || view.collapsed.has(n.data.id);
    const width = n.data.label.length * CHAR_WIDTH + VALUE_WIDTH;
    const boxOf = (o: Omit<LabelPlace, 'show'>) => {
      const x = n.px + o.dx;
      const y = n.py + o.dy;
      const x0 = o.anchor === 'start' ? x : o.anchor === 'end' ? x - width : x - width / 2;
      return [x0 - 2, y - 10, x0 + width + 2, y + 3] as [number, number, number, number];
    };
    const free = wanted ? options.find((o) => !overlaps(boxOf(o))) : undefined;
    if (free) boxes.push(boxOf(free));
    out.set(n.data.id, { ...(free ?? options[0]!), show: free !== undefined });
  }
  return out;
}

/**
 * Fan tree: the decision sits at the bottom centre and its paths fan out upwards, one ring per step.
 * D3 owns this SVG; React only passes data and view state.
 */
export class FanGraph {
  private readonly svg: Sel<SVGSVGElement>;
  private readonly viewport: Sel<SVGGElement>;
  private readonly rings: Sel<SVGGElement>;
  private readonly links: Sel<SVGGElement>;
  private readonly nodes: Sel<SVGGElement>;
  private readonly zoomer: ZoomBehavior<SVGSVGElement, unknown>;
  private width = 800;
  private height = 560;
  private last = new Map<string, Point>();
  private userZoomed = false;
  private root: Point | null = null;
  private frame = { span: 0, radius: 0, depth: 1 };
  /** false where SVG transforms cannot animate (tests) or the user prefers reduced motion */
  private readonly motion: boolean;

  constructor(
    element: SVGSVGElement,
    private readonly events: GraphEvents,
  ) {
    this.svg = select(element);
    const probe = element.ownerDocument.createElementNS(
      'http://www.w3.org/2000/svg',
      'g',
    ) as SVGGElement;
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.motion = probe.transform !== undefined && !reduced;
    this.viewport = this.svg.append('g').attr('class', 'viewport');
    this.rings = this.viewport.append('g').attr('class', 'rings');
    this.links = this.viewport.append('g').attr('class', 'links');
    this.nodes = this.viewport.append('g').attr('class', 'nodes');
    this.zoomer = zoom<SVGSVGElement, unknown>()
      .extent(() => [
        [0, 0],
        [this.width, this.height],
      ])
      .scaleExtent([0.15, 6])
      .on('zoom', (event) => {
        this.viewport.attr('transform', event.transform.toString());
        if (event.sourceEvent) this.userZoomed = true;
      });
    this.svg
      .call(this.zoomer)
      .on('dblclick.zoom', null)
      .on('dblclick', () => this.fit(true));
  }

  setSize(width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    this.width = width;
    this.height = height;
    this.svg.attr('viewBox', `0 0 ${width} ${height}`);
    if (!this.userZoomed) this.fit(false);
  }

  private layout(
    data: ImpactNode,
    view: GraphView,
  ): { root: Point; span: number; radius: number; depth: number } {
    const h = hierarchy(data, (d) => (view.collapsed.has(d.id) ? null : d.children));
    const leaves = h.leaves().length;
    const depth = Math.max(1, h.height);
    // the fan fills the area: tall areas get a narrow fan, wide areas a wide one; leaves keep ~16 px apart
    const spanFor = (radius: number) =>
      Math.min(Math.PI * 0.94, Math.max(Math.PI * 0.42, (leaves * 16) / radius + 0.5));
    let radius = Math.max(180, this.height - 110);
    radius = Math.min(
      radius,
      (this.width - 220) / (2 * Math.sin(Math.min(spanFor(radius), Math.PI) / 2)),
    );
    const span = spanFor(Math.max(120, radius));
    radius = Math.max(60 * depth, radius);
    const root = d3tree<ImpactNode>()
      .size([span, 1])
      .separation((a, b) => (a.parent === b.parent ? 1 : 1.5) / Math.max(1, a.depth))(h) as Point;
    root.each((n) => {
      const p = n as Point;
      p.angle = p.x - span / 2;
      p.radius = ringRadius(p.depth, depth, radius);
      [p.px, p.py] = polar(p);
    });
    return { root, span, radius, depth };
  }

  render(data: ImpactNode | null, view: GraphView, animated = true) {
    const animate = animated && this.motion;
    const t: AnyTransition = this.svg.transition().duration(DURATION).ease(easeCubicOut);
    /** Animate with the shared transition, or set the values at once (first paint, tests). */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = (s: any): AnyTransition => (animate ? s.transition(t) : s);
    if (!data) {
      tx(this.links.selectAll('path')).attr('stroke-opacity', 0).remove();
      tx(this.nodes.selectAll('g')).attr('opacity', 0).remove();
      this.rings.selectAll('*').remove();
      this.last = new Map();
      this.root = null;
      return;
    }
    const firstRender = this.root === null;
    const { root, span, radius, depth } = this.layout(data, view);
    const ringAt = (d: number) => ringRadius(d, depth, radius);
    const nodes = root.descendants() as Point[];
    const byId = new Map(nodes.map((n) => [n.data.id, n]));
    const prev = this.last;
    const origin = (n: Point): Polar => {
      for (let a = n.parent as Point | null; a; a = a.parent as Point | null) {
        const old = prev.get(a.data.id);
        if (old) return old;
      }
      return { angle: 0, radius: 0 };
    };
    const target = (id: string): Point | Polar => {
      for (let cut = id.lastIndexOf('>'); cut > 0; cut = id.lastIndexOf('>', cut - 1)) {
        const hit = byId.get(id.slice(0, cut));
        if (hit) return hit;
      }
      return byId.get('root') ?? { angle: 0, radius: 0 };
    };
    const faded = (n: ImpactNode) => n.depth > 0 && view.focus.size > 0 && !view.focus.has(n.area);

    const steps = Array.from({ length: root.height }, (_, i) => i + 1);
    const ringEnd = (d: number) => polar({ angle: -(span + 0.12) / 2, radius: ringAt(d) });
    const rings = this.rings
      .selectAll<SVGPathElement, number>('path')
      .data(steps, (d) => d)
      .join('path')
      .attr('class', 'ring');
    tx(rings).attr('d', (d: number) => arcPath(ringAt(d), span + 0.12));
    const ringLabels = this.rings
      .selectAll<SVGTextElement, number>('text')
      .data(steps, (d) => d)
      .join('text')
      .attr('class', 'ring-label')
      .text((d) => d);
    tx(ringLabels)
      .attr('x', (d: number) => ringEnd(d)[0] - 6)
      .attr('y', (d: number) => ringEnd(d)[1]);

    const links = this.links
      .selectAll<SVGPathElement, Point>('path.link')
      .data(nodes.slice(1), (d) => d.data.id)
      .join(
        (enter) =>
          enter
            .append('path')
            .attr('d', (d) => linkPath(origin(d), origin(d)))
            .attr('stroke-opacity', 0),
        (update) => update,
        (exit) =>
          tx(exit)
            .attr('d', (d: Point) => {
              const p = target(d.data.id);
              return linkPath(p, p);
            })
            .attr('stroke-opacity', 0)
            .remove(),
      )
      .attr(
        'class',
        (d) => `link ${tone(d.data.score, d.data.uncertain)}${faded(d.data) ? ' faded' : ''}`,
      )
      .attr('data-id', (d) => d.data.id);
    tx(links)
      .attr('d', (d: Point) => linkPath(d.parent as Point, d))
      .attr('stroke-width', (d: Point) => 0.7 + 3.4 * Math.abs(d.data.score))
      .attr('stroke-opacity', (d: Point) => 0.2 + 0.5 * d.data.confidence);

    const groups = this.nodes
      .selectAll<SVGGElement, Point>('g.node')
      .data(nodes, (d) => d.data.id)
      .join(
        (enter) => {
          const g = enter
            .append('g')
            .attr('transform', (d) => {
              const [x, y] = polar(origin(d));
              return `translate(${x},${y})`;
            })
            .attr('opacity', 0);
          g.append('circle').attr('class', 'hit');
          g.append('circle').attr('class', 'mark').attr('r', 0);
          g.append('text');
          return g;
        },
        (update) => update,
        (exit) =>
          tx(exit)
            .attr('transform', (d: Point) => {
              const [x, y] = polar(target(d.data.id));
              return `translate(${x},${y})`;
            })
            .attr('opacity', 0)
            .remove(),
      );

    groups
      .attr('class', (d) => {
        const closed = d.data.children.length > 0 && view.collapsed.has(d.data.id);
        const kind = d.depth === 0 ? 'root' : tone(d.data.score, d.data.uncertain);
        return `node ${kind}${closed ? ' closed' : ''}${d.data.children.length ? ' branch' : ''}${faded(d.data) ? ' faded' : ''}`;
      })
      .attr('data-id', (d) => d.data.id)
      .attr('tabindex', (d) => (d.data.children.length ? 0 : -1))
      .attr('role', (d) => (d.data.children.length ? 'button' : null))
      .attr('aria-label', (d) =>
        d.depth === 0 ? view.rootLabel : `${d.data.label} ${view.valueLabel(d.data.score)}`,
      )
      .attr('aria-expanded', (d) =>
        d.data.children.length ? String(!view.collapsed.has(d.data.id)) : null,
      )
      .on('click', (event: MouseEvent, d) => {
        event.stopPropagation();
        if (d.data.children.length && d.depth > 0) this.events.toggle(d.data.id);
      })
      .on('keydown', (event: KeyboardEvent, d) => {
        if ((event.key === 'Enter' || event.key === ' ') && d.data.children.length && d.depth > 0) {
          event.preventDefault();
          this.events.toggle(d.data.id);
        }
      })
      .on('mouseenter focus', (event: Event, d) =>
        this.highlight(d, event.currentTarget as SVGGElement),
      )
      .on('mouseleave blur', () => this.highlight(null, null));

    tx(groups)
      .attr('transform', (d: Point) => `translate(${d.px},${d.py})`)
      .attr('opacity', 1);
    groups.select('circle.hit').attr('r', (d: Point) => Math.max(12, nodeRadius(d.data) + 6));
    tx(groups.select('circle.mark')).attr('r', (d: Point) => nodeRadius(d.data));
    const labels = placeLabels(nodes, view);
    groups.select<SVGTextElement>('text').each(function (d) {
      const text = select(this);
      text.selectAll('tspan').remove();
      if (d.depth === 0) {
        text
          .attr('class', 'label root-label')
          .attr('text-anchor', 'middle')
          .attr('x', 0)
          .attr('y', 24);
        text.append('tspan').text(view.rootLabel);
        return;
      }
      const place = labels.get(d.data.id)!;
      text
        .attr('class', `label${place.show ? '' : ' quiet'}`)
        .attr('text-anchor', place.anchor)
        .attr('x', place.dx)
        .attr('y', place.dy);
      text.append('tspan').text(d.data.label);
      text.append('tspan').attr('class', 'value').attr('dx', 4).text(view.valueLabel(d.data.score));
    });

    this.root = root;
    this.frame = { span, radius, depth };
    this.last = byId;
    if (firstRender || !this.userZoomed) this.fit(animate && !firstRender);
  }

  private highlight(d: Point | null, element: SVGGElement | null) {
    this.svg.classed('tracing', d !== null && d.depth > 0);
    this.links.selectAll<SVGPathElement, Point>('path.link').classed('hl', false);
    this.nodes.selectAll<SVGGElement, Point>('g.node').classed('hl', false).classed('twin', false);
    if (!d || d.depth === 0 || !element) {
      this.events.hover(null, [], null);
      return;
    }
    const chain = d.ancestors() as Point[];
    const ids = new Set(chain.map((n) => n.data.id));
    this.links
      .selectAll<SVGPathElement, Point>('path.link')
      .classed('hl', (n) => ids.has(n.data.id));
    this.nodes
      .selectAll<SVGGElement, Point>('g.node')
      .classed('hl', (n) => ids.has(n.data.id))
      .classed('twin', (n) => n.data.subarea === d.data.subarea && !ids.has(n.data.id));
    const box = element.getBoundingClientRect();
    const frame = (this.svg.node() as SVGSVGElement).getBoundingClientRect();
    this.events.hover(
      d.data,
      chain.reverse().map((n) => n.data),
      { x: box.left + box.width / 2 - frame.left, y: box.top - frame.top },
    );
  }

  fit(animate = true) {
    this.userZoomed = false;
    if (!this.root) return;
    let minX = 0;
    let maxX = 0;
    let minY = 0;
    let maxY = 0;
    this.root.each((n) => {
      const p = n as Point;
      minX = Math.min(minX, p.px);
      maxX = Math.max(maxX, p.px);
      minY = Math.min(minY, p.py);
      maxY = Math.max(maxY, p.py);
    });
    const outer = this.root.height ? this.frame.radius : 0;
    const [ex, ey] = polar({ angle: (this.frame.span + 0.12) / 2, radius: outer });
    minX = Math.min(minX, -ex - 16);
    maxX = Math.max(maxX, ex);
    minY = Math.min(minY, ey);
    const pad = { x: 90, top: 40, bottom: 44 };
    const w = maxX - minX + pad.x * 2;
    const h = maxY - minY + pad.top + pad.bottom;
    const k = Math.min(1.6, this.width / w, this.height / h);
    const x = this.width / 2 - (k * (minX + maxX)) / 2;
    const y = this.height - pad.bottom * k - k * maxY;
    const transform = zoomIdentity.translate(x, y).scale(k);
    const target =
      animate && this.motion
        ? this.svg.transition().duration(DURATION).ease(easeCubicOut)
        : this.svg;
    (target as Sel<SVGSVGElement>).call(this.zoomer.transform, transform);
  }

  destroy() {
    this.svg.on('.zoom', null).on('dblclick', null);
    this.svg.selectAll('*').remove();
  }
}
