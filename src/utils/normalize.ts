import type {
  Heading,
  HeadingType,
  Line,
  PiecewiseHeadingInterpolation,
  Point,
  SequenceItem,
  StartPose,
} from "../types";
import { getRandomColor } from "./color";
import { headingAngleAt } from "./headingInterpolation";

import { makeLineId } from "./ids";

export { makeLineId };

/** The heading a segment gets when none is recorded. */
export const DEFAULT_HEADING: Heading = { type: "tangential", reverse: false };

/**
 * Legacy heading fields that used to live on a point.
 */
interface LegacyHeadingFields {
  heading?: HeadingType;
  startDeg?: number;
  endDeg?: number;
  degrees?: number;
  reverse?: boolean;
  piecewiseHeading?: PiecewiseHeadingInterpolation;
}

type LegacyPoint = Point & LegacyHeadingFields;

/** A line as it may appear in a file: heading either on the line or the endpoint. */
export type StoredLine = Omit<Line, "heading" | "endPoint" | "id"> & {
  /** Absent in files written before segments carried ids. */
  id?: string;
  heading?: Heading | HeadingType;
  endPoint: LegacyPoint;
};

/** A start point as it may appear in a file: `headingDeg`, or legacy fields. */
export type StoredStartPose = Point &
  LegacyHeadingFields & { headingDeg?: number };

function isHeading(value: unknown): value is Heading {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Heading).type === "string"
  );
}

/** Build a `Heading` from the legacy fields that used to live on a point. */
function headingFromLegacy(source: LegacyHeadingFields): Heading {
  switch (source.heading) {
    case "linear":
      return {
        type: "linear",
        startDeg: source.startDeg ?? 0,
        endDeg: source.endDeg ?? 0,
      };
    case "constant":
      return { type: "constant", degrees: source.degrees ?? 0 };
    case "tangential":
      return { type: "tangential", reverse: source.reverse ?? false };
    case "piecewise":
      return source.piecewiseHeading
        ? { type: "piecewise", piecewiseHeading: source.piecewiseHeading }
        : DEFAULT_HEADING;
    default:
      return DEFAULT_HEADING;
  }
}

/**
 * Resolve a line's heading, preferring the current path-level field and
 * falling back to the pre-migration copy stored on its endpoint.
 */
export function normalizeHeading(line: StoredLine): Heading {
  if (isHeading(line.heading)) return line.heading;
  if (typeof line.heading === "string") {
    return headingFromLegacy({ ...line.endPoint, heading: line.heading });
  }
  return headingFromLegacy(line.endPoint ?? {});
}

/** A new path segment ending at (x, y), with defaults matching normalizeLines. */
export function createLine(
  x: number,
  y: number,
  options: { reverse?: boolean } = {},
): Line {
  return {
    id: makeLineId(),
    endPoint: { x, y },
    controlPoints: [],
    heading: { type: "tangential", reverse: options.reverse ?? false },
    color: getRandomColor(),
    locked: false,
    waitBeforeMs: 0,
    waitAfterMs: 0,
    waitBeforeName: "",
    waitAfterName: "",
  };
}

/**
 * Migrate a start pose from the legacy format to the new one.
 */
export function normalizeStartPose(input: StoredStartPose): StartPose {
  const headingDeg =
    typeof input?.headingDeg === "number"
      ? input.headingDeg
      : headingAngleAt(headingFromLegacy(input ?? {}), "start");

  return {
    x: input?.x ?? 0,
    y: input?.y ?? 0,
    name: input?.name,
    locked: input?.locked,
    headingDeg,
  };
}

export function normalizeLines(input: StoredLine[] = []): Line[] {
  return (input || []).map((line) => ({
    ...line,
    id: line.id || makeLineId(),
    endPoint: {
      x: line.endPoint?.x ?? 0,
      y: line.endPoint?.y ?? 0,
      name: line.endPoint?.name,
      locked: line.endPoint?.locked,
    },
    controlPoints: line.controlPoints || [],
    heading: normalizeHeading(line),
    color: line.color || getRandomColor(),
    name: line.name || "",
    waitBeforeMs: Math.max(
      0,
      Number(line.waitBeforeMs ?? line.waitBefore?.durationMs ?? 0),
    ),
    waitAfterMs: Math.max(
      0,
      Number(line.waitAfterMs ?? line.waitAfter?.durationMs ?? 0),
    ),
    waitBeforeName: line.waitBeforeName ?? line.waitBefore?.name ?? "",
    waitAfterName: line.waitAfterName ?? line.waitAfter?.name ?? "",
  }));
}

export function deriveSequence(
  data: any,
  normalizedLines: Line[],
): SequenceItem[] {
  if (Array.isArray(data?.sequence) && data.sequence.length) {
    return data.sequence as SequenceItem[];
  }

  return normalizedLines.map((ln) => ({
    kind: "path",
    lineId: ln.id,
  }));
}
