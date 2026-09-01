import type { BasePoint, Line, StartPose } from "../../types";

export function generatePointsArray(
  startPoint: StartPose,
  lines: Line[],
): string {
  const points: BasePoint[] = [startPoint];

  lines.forEach((line) => {
    line.controlPoints.forEach((controlPoint) => points.push(controlPoint));
    points.push(line.endPoint);
  });

  const pointsString = points
    .map((point) => `(${coordinate(point.x)}, ${coordinate(point.y)})`)
    .join(", ");

  return `[${pointsString}]`;
}

function coordinate(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : value.toFixed(3);
}
