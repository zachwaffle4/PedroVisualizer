import type { BasePoint, Line, PathChain } from "../types";
import { clamp, getCurvePoint, radiansToDegrees } from "./math";

/** Sample count used when approximating a curve's arc length. */
export const CURVE_SAMPLES = 100;

/** The bezier control polygon for one segment, given where it starts. */
export function lineCurvePoints(
  startPoint: BasePoint,
  line: Line,
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
  /** The segment this came from. */
  line: Line;
  /** Position in the flattened order. */
  index: number;
  /** Where the segment begins: the previous segment's end, or the path start. */
  start: BasePoint;
  /** `[start, ...controlPoints, endPoint]`. */
  points: BasePoint[];
  /** Approximate arc length in inches, computed on first access. */
  readonly arcLength: number;
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
  lines: Line[],
): FlatSegment[] {
  const segments: FlatSegment[] = [];
  let start: BasePoint = startPoint;

  lines.forEach((line, index) => {
    if (!line || !line.endPoint) return;

    const points = lineCurvePoints(start, line);
    let measured: number | null = null;

    segments.push({
      line,
      index,
      start,
      points,
      get arcLength() {
        if (measured === null) measured = approximateCurveLength(points);
        return measured;
      },
    });

    start = line.endPoint;
  });

  return segments;
}

/**
 * Where a single segment begins, without walking the whole path. Same rule as
 * `flattenToAtomicSegments`, kept separate so hot paths stay O(1).
 */
export function segmentStartAt(
  startPoint: BasePoint,
  lines: Line[],
  index: number,
): BasePoint | null {
  if (index <= 0) return startPoint;
  return lines[index - 1]?.endPoint ?? null;
}

/**
 * Position and tangent at a fraction along a whole chain, measured by arc
 * length across every segment in it.
 */
export function getChainTraversalState(
  chain: PathChain,
  lines: Line[],
  startPoint: BasePoint,
  progress: number,
): { point: BasePoint; tangentDegrees: number } {
  const chainLines = chain.lineIds
    .map((lineId) => lines.find((line) => line.id === lineId))
    .filter((line): line is Line => Boolean(line));

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
