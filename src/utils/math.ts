import type { AtomicPath, BasePoint, Point } from "../types";
import { FIELD_SIZE } from "../config/defaults";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampFieldCoordinate(value: number): number {
  return clamp(value, 0, FIELD_SIZE);
}

export function distanceBetweenPoints(a: BasePoint, b: BasePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function quadraticToCubic(
  P0: { x: number; y: number },
  P1: { x: number; y: number },
  P2: { x: number; y: number },
) {
  const Q1 = {
    x: P0.x + (2 / 3) * (P1.x - P0.x),
    y: P0.y + (2 / 3) * (P1.y - P0.y),
  };
  const Q2 = {
    x: P2.x + (2 / 3) * (P1.x - P2.x),
    y: P2.y + (2 / 3) * (P1.y - P2.y),
  };
  return { Q1, Q2 };
}

export function easeInOutQuad(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

export function transformAngle(angle: number) {
  return ((angle + 180) % 360) - 180;
}

export function normalizeAngleDegrees(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  let normalized = angle % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized <= -180) normalized += 360;
  return normalized;
}

/**
 * Calculates the smallest difference between two angles.
 * Returns a value between -180 and 180.
 */
export function getAngularDifference(start: number, end: number): number {
  const normalizedStart = (start + 360) % 360;
  const normalizedEnd = (end + 360) % 360;
  let diff = normalizedEnd - normalizedStart;

  if (diff > 180) diff -= 360;
  else if (diff < -180) diff += 360;

  return diff;
}

/**
 * Calculates the shortest rotation from startAngle to endAngle based on a percentage.
 * @param startAngle
 * @param endAngle
 * @param percentage
 * @returns
 */
export function shortestRotation(
  startAngle: number,
  endAngle: number,
  percentage: number,
) {
  // Use the helper to find the shortest signed difference
  const diff = getAngularDifference(startAngle, endAngle);
  // Apply difference to the ORIGINAL startAngle to preserve winding/continuity
  return startAngle + diff * percentage;
}

export function reversedRotation(
  startAngle: number,
  endAngle: number,
  percentage: number,
) {
  const shortest = getAngularDifference(startAngle, endAngle);
  const longWay = shortest >= 0 ? shortest - 360 : shortest + 360;
  return normalizeAngleDegrees(startAngle + longWay * percentage);
}

export function interpolateAngleDegrees(
  startAngle: number,
  endAngle: number,
  percentage: number,
  reversed = false,
) {
  return reversed
    ? reversedRotation(startAngle, endAngle, percentage)
    : shortestRotation(startAngle, endAngle, percentage);
}

export function radiansToDegrees(radians: number) {
  return radians * (180 / Math.PI);
}

export function lerp(ratio: number, start: number, end: number) {
  return start + (end - start) * ratio;
}

export function lerp2d(
  ratio: number,
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  return {
    x: lerp(ratio, start.x, end.x),
    y: lerp(ratio, start.y, end.y),
  };
}

export function getCurvePoint(
  t: number,
  points: { x: number; y: number }[],
): { x: number; y: number } {
  if (points.length === 1) return points[0];
  const newpoints = [];
  for (let i = 0, j = 1; j < points.length; i++, j++) {
    newpoints[i] = lerp2d(t, points[i], points[j]);
  }
  return getCurvePoint(t, newpoints);
}

// Helpers for Heading Calculation
export function getTangentAngle(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
): number {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
}

export function getLineStartHeading(
  line: AtomicPath | undefined,
  previousPoint: Point,
): number {
  if (!line || !line.endPoint) return 0;

  const heading = line.heading;
  if (heading.type === "constant") return heading.degrees;
  if (heading.type === "linear") return heading.startDeg;
  if (heading.type === "tangential") {
    const nextP =
      line.controlPoints.length > 0 ? line.controlPoints[0] : line.endPoint;
    const angle = getTangentAngle(previousPoint, nextP);
    return heading.reverse
      ? transformAngle(angle + 180)
      : transformAngle(angle);
  }
  return 0;
}

export function getLineEndHeading(
  line: AtomicPath | undefined,
  previousPoint: Point,
): number {
  if (!line || !line.endPoint) return 0;

  const heading = line.heading;
  if (heading.type === "constant") return heading.degrees;
  if (heading.type === "linear") return heading.endDeg;
  if (heading.type === "tangential") {
    const prevP =
      line.controlPoints.length > 0
        ? line.controlPoints[line.controlPoints.length - 1]
        : previousPoint;
    const angle = getTangentAngle(prevP, line.endPoint);
    return heading.reverse
      ? transformAngle(angle + 180)
      : transformAngle(angle);
  }
  return 0;
}

/**
 * Convert a Catmull-Rom segment to a cubic Bezier control pair.
 * scaledTension should be tension/3 like in the Java implementation.
 * Returns an object { start, cp1, cp2, end } where start==p1 and end==p2
 */
export function catmullToCubic(
  scaledTension: number,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
) {
  const cp1 = {
    x: p1.x + (p2.x - p0.x) * scaledTension,
    y: p1.y + (p2.y - p0.y) * scaledTension,
  };

  const cp2 = {
    x: p2.x - (p3.x - p1.x) * scaledTension,
    y: p2.y - (p3.y - p1.y) * scaledTension,
  };

  return { start: p1, cp1, cp2, end: p2 };
}

/**
 * Given an array of points (poses), generate cubic Bezier segments that pass
 * through the interior points using Catmull-Rom to Bezier conversion.
 *
 * Usage: provide an array where the first two entries are the prevPoint and
 * the startPoint (like the Java PathBuilder expects), followed by the rest of
 * the target points. The function will auto-append a mirrored final point so
 * the tangent for the last segment can be computed.
 *
 * Returns an array of segments: { cp1, cp2, end }
 */
export function curveThroughPoints(
  tension: number,
  poses: { x: number; y: number }[],
): {
  cp1: { x: number; y: number };
  cp2: { x: number; y: number };
  end: { x: number; y: number };
}[] {
  if (!poses || poses.length < 3) return [];

  // Clone to avoid mutating input
  const pts = poses.map((p) => ({ x: p.x, y: p.y }));

  // Auto-extend last point to create a valid tangent (mirror last diff)
  const last = pts[pts.length - 1];
  const penultimate = pts[pts.length - 2];
  const diff = { x: last.x - penultimate.x, y: last.y - penultimate.y };
  pts.push({ x: last.x + diff.x, y: last.y + diff.y });

  const scaledTension = tension / 3.0;
  const out: {
    cp1: { x: number; y: number };
    cp2: { x: number; y: number };
    end: { x: number; y: number };
  }[] = [];

  // For i = 1 .. pts.length-3 produce segment between pts[i] and pts[i+1]
  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2];
    const seg = catmullToCubic(scaledTension, p0, p1, p2, p3);
    out.push({ cp1: seg.cp1, cp2: seg.cp2, end: seg.end });
  }

  return out;
}
