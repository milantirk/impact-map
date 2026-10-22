import { analyze } from '@impact-map/engine';
import { describe, expect, it } from 'vitest';
import { branchIds, FanGraph, linkPath, ringRadius, type GraphView } from '../src/graph/fanGraph';

const gym =
  'Elmegyek az üzletbe, veszek egy sportcipőt, elmegyek a legközelebbi edzőterembe, veszek egy havi bérletet, és elkezdek edzeni, mert túlsúlyos lettem az elmúlt 1 hónapban egy sérülés miatt.';

function mount(width = 924, height = 774) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  document.body.appendChild(svg);
  const toggled: string[] = [];
  const graph = new FanGraph(svg, { toggle: (id) => toggled.push(id), hover: () => undefined });
  graph.setSize(width, height);
  return { svg, graph, toggled };
}

const view = (collapsed: string[] = []): GraphView => ({
  collapsed: new Set(collapsed),
  focus: new Set(),
  rootLabel: 'decision',
  valueLabel: (v) => v.toFixed(2),
});

describe('fan graph', () => {
  it('draws one node per visible path and one link per non-root node', () => {
    const map = analyze({ text: gym });
    const { svg, graph } = mount();
    graph.render(map.tree, view(), false);
    const nodes = svg.querySelectorAll('g.node');
    expect(nodes.length).toBe(map.treeStats!.nodes + 1);
    expect(svg.querySelectorAll('path.link').length).toBe(map.treeStats!.nodes);
    expect(svg.querySelectorAll('g.node.root').length).toBe(1);
  });

  it('keeps every step-1 label visible for the gym decision', () => {
    const map = analyze({ text: gym });
    const { svg, graph } = mount();
    graph.render(map.tree, view(), false);
    const strong = map.tree!.children.filter((c) => Math.abs(c.score) >= 0.1).map((c) => c.id);
    const hidden = strong.filter((id) =>
      svg.querySelector(`g.node[data-id="${id}"] text`)?.classList.contains('quiet'),
    );
    expect(hidden).toEqual([]);
  });

  it('hides the subtree of a collapsed node and toggles on click', () => {
    const map = analyze({ text: gym });
    const { svg, graph, toggled } = mount();
    const branch = branchIds(map.tree!)[0]!;
    graph.render(map.tree, view([branch]), false);
    const inside = svg.querySelectorAll(`g.node[data-id^="${branch}>"]`).length;
    expect(inside).toBe(0);
    expect(svg.querySelector(`g.node[data-id="${branch}"]`)!.classList.contains('closed')).toBe(
      true,
    );
    svg
      .querySelector<SVGGElement>(`g.node[data-id="${branch}"]`)!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(toggled).toEqual([branch]);
  });

  it('builds smooth radial links and growing rings', () => {
    expect(linkPath({ angle: 0, radius: 0 }, { angle: 0, radius: 100 })).toBe(
      'M0,0C0,-50 0,-50 0,-100',
    );
    expect(ringRadius(1, 3, 300)).toBeGreaterThan(100);
    expect(ringRadius(3, 3, 300)).toBe(300);
  });

  it('clears the drawing without a tree', () => {
    const { svg, graph } = mount();
    graph.render(analyze({ text: gym }).tree, view(), false);
    graph.render(null, view(), false);
    expect(svg.querySelectorAll('g.rings *').length).toBe(0);
  });
});
