/**
 * Geometry of the zigzag learning path. Positions are computed, not measured,
 * so the connector line, auto-scroll and node placement always agree.
 */

export const NODE_SIZE = { lesson: 64, quiz: 80 } as const;

/** Height of the 3D slab under each node. */
export const NODE_DEPTH = 6;

const CAPTION_SPACE = 12 + 20; // gap + one caption line
const ROW_GAP = 24;
const BUBBLE_SPACE = 40; // room for the "ЭХЛЭХ" bubble above the active node
const TOP_PADDING = 8;

/** Horizontal offsets that repeat every 6 nodes; mirrored on alternate units. */
const ZIGZAG = [0, 48, 72, 48, 0, -48];

export type PathNodeInput = {
  size: number;
  hasBubble: boolean;
};

export type PathNodeLayout = {
  /** Center of the node circle. */
  x: number;
  y: number;
  /** Top edge of the node circle. */
  top: number;
  size: number;
};

export function layoutPath(
  nodes: readonly PathNodeInput[],
  width: number,
  mirrored: boolean,
): { nodes: PathNodeLayout[]; height: number } {
  const direction = mirrored ? -1 : 1;
  let cursor = TOP_PADDING;

  const layouts = nodes.map((node, index) => {
    if (node.hasBubble) cursor += BUBBLE_SPACE;
    const top = cursor;
    cursor = top + node.size + NODE_DEPTH + CAPTION_SPACE + ROW_GAP;
    return {
      x: width / 2 + (ZIGZAG[index % ZIGZAG.length] ?? 0) * direction,
      y: top + node.size / 2,
      top,
      size: node.size,
    };
  });

  return { nodes: layouts, height: cursor };
}

/** SVG path for the curved connector between two node centers. */
export function connectorPath(from: PathNodeLayout, to: PathNodeLayout): string {
  const midY = (from.y + to.y) / 2;
  return `M${from.x} ${from.y}C${from.x} ${midY} ${to.x} ${midY} ${to.x} ${to.y}`;
}
