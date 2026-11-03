import { describe, expect, test } from 'bun:test';

import { connectorPath, layoutPath, NODE_SIZE } from './path-layout';

const lessons = (count: number) =>
  Array.from({ length: count }, () => ({ size: NODE_SIZE.lesson, hasBubble: false }));

describe('layoutPath', () => {
  test('zigzags around the center and mirrors on alternate units', () => {
    const normal = layoutPath(lessons(6), 300, false).nodes.map((node) => node.x);
    const mirrored = layoutPath(lessons(6), 300, true).nodes.map((node) => node.x);
    expect(normal).toEqual([150, 198, 222, 198, 150, 102]);
    expect(mirrored).toEqual([150, 102, 78, 102, 150, 198]);
  });

  test('stacks nodes top to bottom and reports the total height', () => {
    const { nodes, height } = layoutPath(lessons(3), 300, false);
    const tops = nodes.map((node) => node.top);
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
    expect(height).toBeGreaterThan(nodes[2]!.top + NODE_SIZE.lesson);
  });

  test('makes room above the node that shows a bubble', () => {
    const plain = layoutPath(lessons(2), 300, false).nodes[1]!.top;
    const withBubble = layoutPath(
      [
        { size: NODE_SIZE.lesson, hasBubble: false },
        { size: NODE_SIZE.lesson, hasBubble: true },
      ],
      300,
      false,
    ).nodes[1]!.top;
    expect(withBubble - plain).toBe(40);
  });

  test('uses the larger quiz node size for its center', () => {
    const [node] = layoutPath([{ size: NODE_SIZE.quiz, hasBubble: false }], 300, false).nodes;
    expect(node!.y - node!.top).toBe(NODE_SIZE.quiz / 2);
  });
});

describe('connectorPath', () => {
  test('draws a vertical-tangent curve between centers', () => {
    const path = connectorPath(
      { x: 10, y: 0, top: 0, size: 0 },
      { x: 50, y: 100, top: 0, size: 0 },
    );
    expect(path).toBe('M10 0C10 50 50 50 50 100');
  });
});
