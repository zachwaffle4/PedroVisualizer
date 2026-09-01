import type {
  AtomicPath,
  BasePoint,
  CompoundPath,
  Path,
  PathChain,
} from "../types";
import { clamp, getCurvePoint, radiansToDegrees } from "./math";

/** Sample count used when approximating a curve's arc length. */
export const CURVE_SAMPLES = 100;

/** The bezier control polygon for one segment, given where it starts. */
export function lineCurvePoints(
  startPoint: BasePoint,
  line: AtomicPath,
): BasePoint[] {
  return [startPoint, ...line.controlPoints, line.endPoint];
}

export function approximateCurveLength(
  points: BasePoint[],
  samples = CURVE_SAMPLES,
): number {
  if (points.length < 2) return 0;

  let length = 0;
  let previousPoint = points[0];

  for (let index = 1; index <= samples; index += 1) {
    const t = index / samples;
    const point = getCurvePoint(t, points);
    const dx = point.x - previousPoint.x;
    const dy = point.y - previousPoint.y;
    length += Math.sqrt(dx * dx + dy * dy);
    previousPoint = point;
  }

  return length;
}

export function getPointAndTangentAtProgress(
  points: BasePoint[],
  progress: number,
  reversed = false,
): { point: BasePoint; tangentDegrees: number } {
  const clampedProgress = clamp(progress, 0, 1);
  const point = getCurvePoint(clampedProgress, points);
  const epsilon = 0.01;
  const direction = reversed ? -epsilon : epsilon;

  // Sample a step in the direction the robot faces. At the end of the curve
  // that step would clamp onto the current point and yield no direction at
  // all, so fall back to differencing from the other side instead.
  let fromT = clampedProgress;
  let toT = clamp(clampedProgress + direction, 0, 1);
  if (fromT === toT) {
    fromT = clamp(clampedProgress - direction, 0, 1);
    toT = clampedProgress;
  }

  const from = getCurvePoint(fromT, points);
  const to = getCurvePoint(toT, points);
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  return {
    point,
    tangentDegrees:
      Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9
        ? 0
        : radiansToDegrees(Math.atan2(dy, dx)),
  };
}

/** One drivable curve, resolved out of the path structure. */
export interface FlatSegment {
  /** The atomic path this came from. */
  line: AtomicPath;
  /** Position in the flattened order, counting leaves only. */
  index: number;
  /** Where the segment begins: the previous segment's end, or the path start. */
  start: BasePoint;
  /** `[start, ...controlPoints, endPoint]`. */
  points: BasePoint[];
  /** Approximate arc length in inches, computed on first access. */
  readonly arcLength: number;
  /**
   * The groups containing this segment, outermost first. Empty for a segment
   * at the top level.
   */
  ancestors: CompoundPath[];
}

/**
 * Resolve a path into the flat list of curves the robot actually drives.
 *
 * A segment's start point is implicit — it is wherever the previous segment
 * ended — and that rule was previously re-derived at every call site. Routing
 * them all through here means the rule lives in one place, which is what lets
 * the structure become a tree without touching the consumers.
 *
 * `arcLength` is lazy because several callers (rendering, the optimizer) only
 * need geometry, and measuring costs a full curve sampling per segment.
 */
export function flattenToAtomicSegments(
  startPoint: BasePoint,
  paths: Path[],
): FlatSegment[] {
  const segments: FlatSegment[] = [];
  let start: BasePoint = startPoint;

  const walk = (nodes: Path[], ancestors: CompoundPath[]) => {
    for (const node of nodes) {
      if (!node) continue;

      if (node.kind === "compound") {
        walk(node.segments, [...ancestors, node]);
        continue;
      }
      if (!node.endPoint) continue;

      const points = lineCurvePoints(start, node);
      let measured: number | null = null;

      segments.push({
        line: node,
        index: segments.length,
        start,
        points,
        get arcLength() {
          if (measured === null) measured = approximateCurveLength(points);
          return measured;
        },
        ancestors,
      });

      start = node.endPoint;
    }
  };

  walk(paths, []);
  return segments;
}

/**
 * Where a given segment begins. Addressed by id because a nested segment has
 * no single position in the top-level array.
 */
export function segmentStartById(
  startPoint: BasePoint,
  paths: Path[],
  lineId: string | null,
): BasePoint | null {
  if (!lineId) return null;
  const segments = flattenToAtomicSegments(startPoint, paths);
  return segments.find((segment) => segment.line.id === lineId)?.start ?? null;
}

/** Every drivable segment in a path tree, in the order they are driven. */
export function atomicSegments(paths: Path[]): AtomicPath[] {
  return paths.flatMap((path) =>
    path.kind === "compound" ? atomicSegments(path.segments) : [path],
  );
}

/** Find a segment anywhere in the tree by its id. */
export function findSegmentById(
  paths: Path[],
  lineId: string | null,
): AtomicPath | null {
  if (!lineId) return null;
  return atomicSegments(paths).find((path) => path.id === lineId) ?? null;
}

/**
 * Replace one segment wherever it sits, rebuilding only the groups on the way
 * down to it. Returns the original array when the id is not found, so callers
 * can treat an unchanged reference as "no such segment".
 */
export function replaceSegment(
  paths: Path[],
  lineId: string,
  update: (segment: AtomicPath) => AtomicPath,
): Path[] {
  let changed = false;

  const walk = (nodes: Path[]): Path[] =>
    nodes.map((node) => {
      if (node.kind === "compound") {
        const segments = walk(node.segments);
        return segments === node.segments ? node : { ...node, segments };
      }
      if (node.id !== lineId) return node;
      changed = true;
      return update(node);
    });

  const next = walk(paths);
  return changed ? next : paths;
}

/**
 * Position and tangent at a fraction along a whole chain, measured by arc
 * length across every segment in it.
 */
export function getChainTraversalState(
  chain: PathChain,
  lines: Path[],
  startPoint: BasePoint,
  progress: number,
): { point: BasePoint; tangentDegrees: number } {
  const chainLines = chain.lineIds
    .map((lineId) => lines.find((line) => line.id === lineId))
    .filter((line): line is Path => Boolean(line));

  if (chainLines.length === 0) {
    return getPointAndTangentAtProgress([startPoint, startPoint], 0);
  }

  const segments = flattenToAtomicSegments(startPoint, chainLines);
  const totalLength = segments.reduce(
    (sum, segment) => sum + segment.arcLength,
    0,
  );
  if (totalLength <= 1e-9) {
    return getPointAndTangentAtProgress(segments[0].points, 0);
  }

  const targetDistance = clamp(progress, 0, 1) * totalLength;
  let accumulated = 0;

  for (const segment of segments) {
    const nextAccumulated = accumulated + segment.arcLength;
    if (
      targetDistance <= nextAccumulated ||
      segment === segments[segments.length - 1]
    ) {
      const localProgress =
        segment.arcLength <= 1e-9
          ? 0
          : (targetDistance - accumulated) / segment.arcLength;
      return getPointAndTangentAtProgress(segment.points, localProgress);
    }
    accumulated = nextAccumulated;
  }

  return getPointAndTangentAtProgress(segments[segments.length - 1].points, 1);
}
