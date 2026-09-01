import type { AtomicPath, BasePoint, StartPose } from "../../types";
import { clampFieldCoordinate, distanceBetweenPoints } from "../../utils/math";
import { getRandomColor } from "../../utils/color";
import { makePathId } from "../../utils/ids";

/**
 * Distance from a point to the infinite line through lineStart/lineEnd.
 * Unlike geometry.ts `pointToLineDistance`, this is not clamped to the segment.
 */
export function perpendicularDistance(
  point: BasePoint,
  lineStart: BasePoint,
  lineEnd: BasePoint,
): number {
  const denominator = Math.hypot(
    lineEnd.x - lineStart.x,
    lineEnd.y - lineStart.y,
  );
  if (denominator === 0) {
    return distanceBetweenPoints(point, lineStart);
  }

  const numerator = Math.abs(
    (lineEnd.y - lineStart.y) * point.x -
      (lineEnd.x - lineStart.x) * point.y +
      lineEnd.x * lineStart.y -
      lineEnd.y * lineStart.x,
  );

  return numerator / denominator;
}

/** Ramer-Douglas-Peucker simplification. */
export function simplifyStrokePoints(
  points: BasePoint[],
  tolerance: number,
): BasePoint[] {
  if (points.length <= 2) return points.map((point) => ({ ...point }));

  const simplifyRange = (startIndex: number, endIndex: number): BasePoint[] => {
    let maxDistance = 0;
    let farthestIndex = -1;

    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = perpendicularDistance(
        points[index],
        points[startIndex],
        points[endIndex],
      );
      if (distance > maxDistance) {
        maxDistance = distance;
        farthestIndex = index;
      }
    }

    if (maxDistance <= tolerance || farthestIndex === -1) {
      return [{ ...points[startIndex] }, { ...points[endIndex] }];
    }

    const left = simplifyRange(startIndex, farthestIndex);
    const right = simplifyRange(farthestIndex, endIndex);
    return [...left.slice(0, -1), ...right];
  };

  return simplifyRange(0, points.length - 1);
}

export function dedupeStrokePoints(
  points: BasePoint[],
  minDistance: number,
): BasePoint[] {
  const deduped: BasePoint[] = [];

  for (const point of points) {
    const lastPoint = deduped[deduped.length - 1];
    if (!lastPoint || distanceBetweenPoints(lastPoint, point) >= minDistance) {
      deduped.push({ ...point });
    }
  }

  return deduped;
}

export function getPointOnStroke(
  points: BasePoint[],
  targetDistance: number,
): BasePoint {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { ...points[0] };

  let remaining = targetDistance;

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const segmentLength = distanceBetweenPoints(current, next);

    if (segmentLength === 0) continue;
    if (remaining <= segmentLength) {
      const ratio = remaining / segmentLength;
      return {
        x: current.x + (next.x - current.x) * ratio,
        y: current.y + (next.y - current.y) * ratio,
      };
    }

    remaining -= segmentLength;
  }

  return { ...points[points.length - 1] };
}

export function sampleStrokeControlPoints(
  points: BasePoint[],
  controlPointCount: number,
): BasePoint[] {
  if (points.length < 2 || controlPointCount <= 0) return [];

  const totalLength = points.reduce((sum, point, index) => {
    if (index === 0) return 0;
    return sum + distanceBetweenPoints(points[index - 1], point);
  }, 0);

  if (totalLength === 0) return [];

  const sampled: BasePoint[] = [];
  for (let index = 1; index <= controlPointCount; index += 1) {
    const targetDistance = (totalLength * index) / (controlPointCount + 1);
    sampled.push(getPointOnStroke(points, targetDistance));
  }

  return sampled;
}

/** Turn a freehand stroke into a start point plus a single fitted line. */
export function fitStrokeToLines(
  stroke: BasePoint[],
  penToolAccuracy: number,
  startAnchor?: BasePoint,
): { startPoint: StartPose; lines: AtomicPath[] } | null {
  const cleanedStroke = dedupeStrokePoints(
    stroke.map((point) => ({
      x: clampFieldCoordinate(point.x),
      y: clampFieldCoordinate(point.y),
    })),
    0.25,
  );

  if (cleanedStroke.length < 2) return null;

  const simplifiedStroke = simplifyStrokePoints(cleanedStroke, 0.45);
  const strokePoints = dedupeStrokePoints(simplifiedStroke, 0.05);

  if (strokePoints.length < 2) return null;

  const maxControlPoints = Math.max(0, Math.round(Number(penToolAccuracy)));
  const controlPointsSource = startAnchor
    ? [
        {
          x: clampFieldCoordinate(startAnchor.x),
          y: clampFieldCoordinate(startAnchor.y),
        },
        ...strokePoints,
      ]
    : strokePoints;
  const controlPoints = sampleStrokeControlPoints(
    controlPointsSource,
    maxControlPoints,
  );

  const fittedLines: AtomicPath[] = [
    {
      kind: "atomic",
      id: makePathId(),
      name: "Path 1",
      endPoint: {
        x: strokePoints[strokePoints.length - 1].x,
        y: strokePoints[strokePoints.length - 1].y,
      },
      controlPoints,
      heading: { type: "tangential", reverse: false },
      color: getRandomColor(),
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    },
  ];

  return {
    startPoint: {
      x: startAnchor?.x ?? strokePoints[0].x,
      y: startAnchor?.y ?? strokePoints[0].y,
      headingDeg: 0,
    },
    lines: fittedLines,
  };
}
