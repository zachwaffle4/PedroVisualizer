import type {
  BasePoint,
  Heading,
  PiecewiseHeadingInterpolation,
  PiecewiseHeadingInterpolationType,
  PiecewiseHeadingSegment,
} from "../types";
import {
  clamp,
  interpolateAngleDegrees,
  normalizeAngleDegrees,
  radiansToDegrees,
} from "./math";

const MIN_SEGMENT_LENGTH = 0.0001;

/** Sample count used when approximating a curve's arc length. */
export const CURVE_SAMPLES = 100;

/**
 * The single angle a heading rule resolves to at one end of its segment.
 *
 * Tangential headings have no fixed angle without the surrounding geometry, so
 * they resolve to 0 here; callers that need the real tangent (the time
 * calculator) use `getLineStartHeading` / `getLineEndHeading` in ./math, which
 * take the neighbouring points into account.
 */
export function headingAngleAt(
  heading: Heading,
  role: "start" | "end",
): number {
  switch (heading.type) {
    case "constant":
      return heading.degrees;
    case "linear":
      return role === "start" ? heading.startDeg : heading.endDeg;
    case "tangential":
      return 0;
    case "piecewise":
      return piecewiseEdgeHeading(heading.piecewiseHeading, role);
  }
}

function piecewiseEdgeHeading(
  interpolation: PiecewiseHeadingInterpolation,
  role: "start" | "end",
): number {
  const segments = interpolation?.segments ?? [];
  const segment =
    role === "start" ? segments[0] : segments[segments.length - 1];
  const parameters = segment?.parameters;
  if (!parameters) return 0;
  if (segment.interpolationType === "constant") return parameters.degrees ?? 0;
  if (segment.interpolationType === "linear") {
    return (role === "start" ? parameters.startDeg : parameters.endDeg) ?? 0;
  }
  return 0;
}

function clonePoint(point?: BasePoint): BasePoint | undefined {
  if (!point) return undefined;
  return {
    x: Number(point.x) || 0,
    y: Number(point.y) || 0,
    locked: point.locked,
  };
}

function defaultParameters(
  type: PiecewiseHeadingInterpolationType,
): PiecewiseHeadingSegment["parameters"] {
  switch (type) {
    case "constant":
      return { degrees: 0 };
    case "linear":
      return { startDeg: 0, endDeg: 0 };
    case "facing-point":
      return { point: { x: 0, y: 0 } };
    default:
      return undefined;
  }
}

function areParametersEqual(
  left: PiecewiseHeadingSegment["parameters"],
  right: PiecewiseHeadingSegment["parameters"],
): boolean {
  return JSON.stringify(left || {}) === JSON.stringify(right || {});
}

export function segmentSupportsReverse(
  type: PiecewiseHeadingInterpolationType,
): boolean {
  return type === "linear" || type === "tangential" || type === "facing-point";
}

export function createDefaultPiecewiseSegment(): PiecewiseHeadingSegment {
  return {
    startProgress: 0,
    endProgress: 1,
    interpolationType: "linear",
    reversed: false,
    parameters: defaultParameters("linear"),
  };
}

export function createDefaultPiecewiseHeadingInterpolation(
  scope: "path" | "chain" = "path",
): PiecewiseHeadingInterpolation {
  return {
    scope,
    segments: [createDefaultPiecewiseSegment()],
  };
}

function normalizeSegment(
  segment: PiecewiseHeadingSegment,
): PiecewiseHeadingSegment {
  const interpolationType = segment.interpolationType || "linear";
  const parameters = segment.parameters
    ? {
        ...segment.parameters,
        point: clonePoint(segment.parameters.point),
      }
    : defaultParameters(interpolationType);

  return {
    startProgress: clamp(Number(segment.startProgress ?? 0), 0, 1),
    endProgress: clamp(Number(segment.endProgress ?? 1), 0, 1),
    interpolationType,
    reversed: segmentSupportsReverse(interpolationType)
      ? !!segment.reversed
      : false,
    parameters,
  };
}

export function normalizePiecewiseHeadingInterpolation(
  input?: PiecewiseHeadingInterpolation,
): PiecewiseHeadingInterpolation {
  const scope = input?.scope === "chain" ? "chain" : "path";
  const sourceSegments = input?.segments?.length
    ? input.segments
    : [createDefaultPiecewiseSegment()];

  const sorted = sourceSegments
    .map(normalizeSegment)
    .sort((left, right) => left.startProgress - right.startProgress);

  const repaired: PiecewiseHeadingSegment[] = [];
  let cursor = 0;

  for (let index = 0; index < sorted.length; index += 1) {
    const source = sorted[index];
    const isLast = index === sorted.length - 1;
    const startProgress = index === 0 ? 0 : cursor;
    const desiredEnd = isLast
      ? 1
      : Math.max(source.endProgress, startProgress + MIN_SEGMENT_LENGTH);
    const endProgress = clamp(
      desiredEnd,
      startProgress + MIN_SEGMENT_LENGTH,
      1,
    );

    repaired.push({
      ...source,
      startProgress,
      endProgress,
    });

    cursor = endProgress;
  }

  if (repaired.length === 0) {
    return createDefaultPiecewiseHeadingInterpolation(scope);
  }

  const merged: PiecewiseHeadingSegment[] = [];
  for (const segment of repaired) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.endProgress === segment.startProgress &&
      previous.interpolationType === segment.interpolationType &&
      previous.reversed === segment.reversed &&
      areParametersEqual(previous.parameters, segment.parameters)
    ) {
      previous.endProgress = segment.endProgress;
      continue;
    }
    merged.push({
      ...segment,
      parameters: segment.parameters
        ? { ...segment.parameters, point: clonePoint(segment.parameters.point) }
        : undefined,
    });
  }

  merged[0].startProgress = 0;
  merged[merged.length - 1].endProgress = 1;

  return {
    scope,
    segments: merged,
  };
}

export function validatePiecewiseHeadingInterpolation(
  input?: PiecewiseHeadingInterpolation,
): string | null {
  const normalized = normalizePiecewiseHeadingInterpolation(input);

  if (!normalized.segments.length) {
    return "Piecewise heading requires at least one segment.";
  }

  if (normalized.segments[0].startProgress !== 0) {
    return "The first segment must start at 0.";
  }

  if (normalized.segments[normalized.segments.length - 1].endProgress !== 1) {
    return "The final segment must end at 1.";
  }

  for (let index = 0; index < normalized.segments.length; index += 1) {
    const segment = normalized.segments[index];
    if (segment.endProgress <= segment.startProgress) {
      return "Piecewise segments must have positive length.";
    }

    if (segment.interpolationType === "linear") {
      const params = segment.parameters || {};
      if (params.startDeg === undefined || params.endDeg === undefined) {
        return "Linear piecewise segments require start and end headings.";
      }
    }

    if (segment.interpolationType === "constant") {
      const params = segment.parameters || {};
      if (params.degrees === undefined) {
        return "Constant piecewise segments require a heading value.";
      }
    }

    if (segment.interpolationType === "facing-point") {
      const point = segment.parameters?.point;
      if (!point) {
        return "Facing-point segments require a target point.";
      }
    }

    const next = normalized.segments[index + 1];
    if (next && segment.endProgress !== next.startProgress) {
      return "Piecewise segments must not contain gaps or overlaps.";
    }
  }

  return null;
}

export function degreesToRadians(degrees: number): number {
  return (normalizeAngleDegrees(degrees) * Math.PI) / 180;
}

export function evaluatePiecewiseHeading(
  interpolation: PiecewiseHeadingInterpolation,
  progress: number,
  options: {
    points: BasePoint[];
    currentPoint: BasePoint;
    tangentDegrees: number;
    chainState?: { point: BasePoint; tangentDegrees: number };
    pointOverride?: BasePoint;
  },
): number {
  const normalized = normalizePiecewiseHeadingInterpolation(interpolation);
  const segment =
    normalized.segments.find((entry, index) => {
      const isLast = index === normalized.segments.length - 1;
      return (
        progress >= entry.startProgress &&
        (progress <= entry.endProgress || isLast)
      );
    }) || normalized.segments[normalized.segments.length - 1];

  const localT = clamp(
    (progress - segment.startProgress) /
      Math.max(segment.endProgress - segment.startProgress, 1e-9),
    0,
    1,
  );

  const sourcePoint =
    interpolation.scope === "chain"
      ? options.chainState?.point || options.currentPoint
      : options.pointOverride || options.currentPoint;
  const sourceTangent =
    interpolation.scope === "chain"
      ? (options.chainState?.tangentDegrees ?? options.tangentDegrees)
      : options.tangentDegrees;

  switch (segment.interpolationType) {
    case "constant":
      return normalizeAngleDegrees(segment.parameters?.degrees ?? 0);
    case "linear":
      return interpolateAngleDegrees(
        segment.parameters?.startDeg ?? 0,
        segment.parameters?.endDeg ?? 0,
        localT,
        !!segment.reversed,
      );
    case "facing-point": {
      const point = segment.parameters?.point || { x: 0, y: 0 };
      const base = radiansToDegrees(
        Math.atan2(point.y - sourcePoint.y, point.x - sourcePoint.x),
      );
      return normalizeAngleDegrees(base + (segment.reversed ? 180 : 0));
    }
    case "tangential":
    default:
      return normalizeAngleDegrees(
        sourceTangent + (segment.reversed ? 180 : 0),
      );
  }
}
