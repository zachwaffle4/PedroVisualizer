import type {
  PiecewiseHeadingInterpolation,
  PiecewiseHeadingSegment,
  Point,
} from "../../types";
import type { HeadingCall, InterpolatorRef, PiecewiseNode } from "./types";

export type HeadingSpec =
  | { kind: "constant"; deg: number }
  | { kind: "linear"; startDeg: number; endDeg: number }
  | { kind: "tangential"; reversed: boolean }
  | { kind: "piecewise"; interpolation: PiecewiseHeadingInterpolation };

export function describeHeading(point: Point): HeadingSpec {
  switch (point.heading) {
    case "constant":
      return { kind: "constant", deg: point.degrees ?? 0 };
    case "linear":
      return {
        kind: "linear",
        startDeg: point.startDeg ?? 0,
        endDeg: point.endDeg ?? 0,
      };
    case "tangential":
      return { kind: "tangential", reversed: !!point.reverse };
    case "piecewise":
      return { kind: "piecewise", interpolation: point.piecewiseHeading };
    default: {
      // Exhaustiveness guard: a new Point variant lands here at compile time.
      const unreachable: never = point;
      void unreachable;
      return { kind: "tangential", reversed: false };
    }
  }
}
export function poseHeading(spec: HeadingSpec, role: "start" | "end"): number {
  switch (spec.kind) {
    case "constant":
      return spec.deg;
    case "linear":
      return role === "start" ? spec.startDeg : spec.endDeg;
    case "tangential":
      return 0;
    case "piecewise":
      return piecewiseEdgeHeading(spec.interpolation, role);
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

export interface HeadingCallContext {
  startPoseVar: string;
  endPoseVar: string;
  endX: number;
  endY: number;
  definePose(
    nameHint: string,
    x: number,
    y: number,
    headingDeg: number,
  ): string;
  warn(message: string): void;
}

export function headingCall(
  spec: HeadingSpec,
  ctx: HeadingCallContext,
): HeadingCall {
  switch (spec.kind) {
    case "constant":
      return { kind: "constant", poseVar: ctx.endPoseVar };
    case "linear":
      return {
        kind: "linear",
        startPoseVar: ctx.startPoseVar,
        endPoseVar: ctx.endPoseVar,
      };
    case "tangential":
      return { kind: "tangential", reversed: spec.reversed };
    case "piecewise":
      return piecewiseCall(spec.interpolation, ctx);
  }
}

function piecewiseCall(
  interpolation: PiecewiseHeadingInterpolation,
  ctx: HeadingCallContext,
): HeadingCall {
  const segments = [...(interpolation?.segments ?? [])].sort(
    (a, b) => a.startProgress - b.startProgress,
  );
  if (segments.length === 0) {
    return { kind: "unsupported", reason: "piecewise heading has no segments" };
  }
  if (interpolation.scope === "chain") {
    ctx.warn(
      "chain-scoped piecewise heading is exported per path, not across the chain",
    );
  }

  const nodes: PiecewiseNode[] = [];
  let previousT = 0;

  segments.forEach((segment, index) => {
    const untilT = Math.min(Math.max(segment.endProgress, 0), 1);
    if (untilT <= previousT) {
      ctx.warn(
        `skipped piecewise segment ${index + 1}: its end progress (${segment.endProgress}) does not advance past ${previousT}`,
      );
      return;
    }
    const interpolator = interpolatorRef(segment, index, ctx);
    if (!interpolator) return;
    nodes.push({
      untilT,
      interpolator,
      reversed: !!segment.reversed && interpolator.kind !== "constant",
    });
    previousT = untilT;
  });

  if (nodes.length === 0) {
    return {
      kind: "unsupported",
      reason: "no usable segments in the piecewise heading",
    };
  }

  // Pedro throws if the nodes do not run through t = 1.
  const last = nodes[nodes.length - 1];
  if (last.untilT < 1) {
    ctx.warn(
      `extended the last piecewise segment from ${last.untilT} to 1 (Pedro requires full coverage)`,
    );
    last.untilT = 1;
  }

  return { kind: "piecewise", nodes };
}

function interpolatorRef(
  segment: PiecewiseHeadingSegment,
  index: number,
  ctx: HeadingCallContext,
): InterpolatorRef | null {
  const parameters = segment.parameters ?? {};
  const label = `${ctx.endPoseVar}Segment${index + 1}`;

  switch (segment.interpolationType) {
    case "tangential":
      return { kind: "tangent" };
    case "constant":
      return {
        kind: "constant",
        poseVar: ctx.definePose(
          `${label}Heading`,
          ctx.endX,
          ctx.endY,
          parameters.degrees ?? 0,
        ),
      };
    case "linear":
      return {
        kind: "linear",
        startPoseVar: ctx.definePose(
          `${label}Start`,
          ctx.endX,
          ctx.endY,
          parameters.startDeg ?? 0,
        ),
        endPoseVar: ctx.definePose(
          `${label}End`,
          ctx.endX,
          ctx.endY,
          parameters.endDeg ?? 0,
        ),
      };
    case "facing-point": {
      const point = parameters.point;
      if (!point) {
        ctx.warn(
          `skipped piecewise segment ${index + 1}: facing-point has no target point`,
        );
        return null;
      }
      return {
        kind: "facingPoint",
        poseVar: ctx.definePose(`${label}Target`, point.x, point.y, 0),
      };
    }
  }
}
