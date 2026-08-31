export type ExportMode = "full" | "class" | "coordinates";

export interface ExportOptions {
  mirrorHorizontally: boolean;
  className: string;
  packageName: string;
}

export interface PoseDecl {
  varName: string;
  x: number;
  y: number;
  headingDeg: number;
}

export type InterpolatorRef =
  | { kind: "constant"; poseVar: string }
  | { kind: "linear"; startPoseVar: string; endPoseVar: string }
  | { kind: "tangent" }
  | { kind: "facingPoint"; poseVar: string };

export interface PiecewiseNode {
  untilT: number;
  interpolator: InterpolatorRef;
  reversed: boolean;
}

export type HeadingCall =
  | { kind: "tangential"; reversed: boolean }
  | { kind: "constant"; poseVar: string }
  | { kind: "linear"; startPoseVar: string; endPoseVar: string }
  | { kind: "facingPoint"; poseVar: string }
  | { kind: "piecewise"; nodes: PiecewiseNode[] }
  | { kind: "unsupported"; reason: string };

export interface PathDecl {
  methodName: string;
  startPoseVar: string;
  controlPoseVars: string[];
  endPoseVar: string;
  heading: HeadingCall;
  note?: string;
}

export type SequenceStep =
  | { kind: "path"; methodName: string }
  | { kind: "wait"; durationMs: number }
  | { kind: "command"; expression: string };

export interface ExportModel {
  options: ExportOptions;
  startPoseVar: string;
  poses: PoseDecl[];
  paths: PathDecl[];
  sequence: SequenceStep[];
  warnings: string[];
  usesInterpolator: boolean;
}
