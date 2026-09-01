import type { BasePoint, Line, Point, Shape, StartPose } from "../../types";
import { FIELD_SIZE } from "../../config/defaults";

/** Which state container a dragged point lives in, so callers know what to reassign. */
export type PointContainer = "shapes" | "second" | "additional" | "main";

export interface PointRefContext {
  startPoint: StartPose;
  lines: Line[];
  secondStartPoint: StartPose | null;
  secondLines: Line[];
  additionalPaths: { startPoint: StartPose | null; lines: Line[] }[];
  shapes: Shape[];
  obstaclesEnabled: boolean;
}

export interface PointRef {
  /** Live reference into the state container, so writes mutate in place. */
  point: BasePoint;
  container: PointContainer;
  locked: boolean;
}

function pointInLines(
  lines: Line[],
  // Only the coordinates and lock state are needed here, so any point will do.
  startPoint: BasePoint | null,
  lineIndex: number,
  pointIndex: number,
): { point: BasePoint; locked: boolean } | null {
  if (lineIndex === -1) {
    if (!startPoint) return null;
    return { point: startPoint, locked: Boolean(startPoint.locked) };
  }

  const line = lines[lineIndex];
  if (!line) return null;

  if (pointIndex === 0) {
    if (!line.endPoint) return null;
    return { point: line.endPoint, locked: false };
  }

  const controlPoint = line.controlPoints[pointIndex - 1];
  if (!controlPoint) return null;
  return { point: controlPoint, locked: Boolean(line.locked) };
}

/**
 * Map a Two.js element id back to the point it represents. Both the drag-read
 * (mousedown, for the grab offset) and the drag-write (mousemove) paths use
 * this so their index parsing cannot drift apart.
 */
export function resolvePointRef(
  elemId: string,
  ctx: PointRefContext,
): PointRef | null {
  const parts = elemId.split("-");

  if (ctx.obstaclesEnabled && elemId.startsWith("obstacle-")) {
    const vertex = ctx.shapes[Number(parts[1])]?.vertices[Number(parts[2])];
    if (!vertex) return null;
    return { point: vertex, container: "shapes", locked: false };
  }

  if (elemId.startsWith("second-point-")) {
    const resolved = pointInLines(
      ctx.secondLines,
      ctx.secondStartPoint,
      Number(parts[2]) - 1,
      Number(parts[3]),
    );
    if (!resolved) return null;
    return { ...resolved, container: "second" };
  }

  if (elemId.startsWith("additional-path-")) {
    const pathData = ctx.additionalPaths[Number(parts[2])];
    if (!pathData) return null;
    const resolved = pointInLines(
      pathData.lines,
      pathData.startPoint,
      Number(parts[4]) - 1,
      Number(parts[5]),
    );
    if (!resolved) return null;
    // Additional paths ignore the locked flag, matching their rendering.
    return { point: resolved.point, container: "additional", locked: false };
  }

  const resolved = pointInLines(
    ctx.lines,
    ctx.startPoint,
    Number(parts[1]) - 1,
    Number(parts[2]),
  );
  if (!resolved) return null;
  return { ...resolved, container: "main" };
}

export interface GridSnapOptions {
  snapToGrid: boolean;
  showGrid: boolean;
  gridSize: number;
}

/** Snap to the nearest grid intersection and clamp into the field. */
export function snapPointToGrid(
  inchX: number,
  inchY: number,
  { snapToGrid, showGrid, gridSize }: GridSnapOptions,
): BasePoint {
  if (!snapToGrid || !showGrid || gridSize <= 0) {
    return { x: inchX, y: inchY };
  }

  return {
    x: Math.max(
      0,
      Math.min(FIELD_SIZE, Math.round(inchX / gridSize) * gridSize),
    ),
    y: Math.max(
      0,
      Math.min(FIELD_SIZE, Math.round(inchY / gridSize) * gridSize),
    ),
  };
}
