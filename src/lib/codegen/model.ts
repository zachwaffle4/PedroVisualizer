import type { AtomicPath, Path, SequenceItem, StartPose } from "../../types";
import { atomicSegments } from "../../utils/pathTraversal";
import { headingAngleAt } from "../../utils/headingInterpolation";
import { headingCall } from "./heading";
import { IdentifierAllocator, toClassName } from "./identifiers";
import { PEDRO_API } from "./pedroApi";
import type {
  ExportModel,
  ExportOptions,
  PathDecl,
  PoseDecl,
  SequenceStep,
} from "./types";

export interface BuildModelInput {
  startPoint: StartPose;
  lines: Path[];
  sequence?: SequenceItem[];
  mirrorHorizontally?: boolean;
  className?: string | null;
  packageName?: string;
}

const DEFAULT_PACKAGE = "org.firstinspires.ftc.teamcode";

export function lineId(line: AtomicPath, index: number): string {
  return line.id || `line-${index + 1}`;
}

export function buildExportModel(input: BuildModelInput): ExportModel {
  const { startPoint } = input;
  // Groups are flattened for now: every drivable curve becomes its own method.
  // Emitting Pedro's `path(...)` for a group is the next step.
  const lines = atomicSegments(input.lines);

  const options: ExportOptions = {
    mirrorHorizontally: !!input.mirrorHorizontally,
    className: toClassName(input.className, "AutoPath"),
    packageName: input.packageName || DEFAULT_PACKAGE,
  };

  const poseNames = new IdentifierAllocator([PEDRO_API.factoryVar]);
  const methodNames = new IdentifierAllocator();

  const poses: PoseDecl[] = [];
  const paths: PathDecl[] = [];
  const warnings: string[] = [];
  let usesInterpolator = false;

  const startPoseVar = poseNames.allocate(startPoint.name, "start");
  poses.push({
    varName: startPoseVar,
    x: startPoint.x,
    y: startPoint.y,
    headingDeg: startPoint.headingDeg,
  });

  let previous = {
    varName: startPoseVar,
    x: startPoint.x,
    y: startPoint.y,
    headingDeg: startPoint.headingDeg,
  };

  const methodNameByLineId = new Map<string, string>();

  lines.forEach((line, index) => {
    const endPoint = line.endPoint;

    const endPoseVar = poseNames.allocate(line.name, `point${index + 1}`);
    const endHeadingDeg = headingAngleAt(line.heading, "end");

    let segmentStartPoseVar = previous.varName;
    if (line.heading.type === "linear") {
      const startHeadingDeg = headingAngleAt(line.heading, "start");
      if (startHeadingDeg !== previous.headingDeg) {
        segmentStartPoseVar = poseNames.allocateExact(`${endPoseVar}Start`);
        poses.push({
          varName: segmentStartPoseVar,
          x: previous.x,
          y: previous.y,
          headingDeg: startHeadingDeg,
        });
      }
    }

    poses.push({
      varName: endPoseVar,
      x: endPoint.x,
      y: endPoint.y,
      headingDeg: endHeadingDeg,
    });

    const controlPoseVars = line.controlPoints.map((controlPoint, cpIndex) => {
      const varName = poseNames.allocateExact(
        `${endPoseVar}Control${cpIndex + 1}`,
      );
      poses.push({
        varName,
        x: controlPoint.x,
        y: controlPoint.y,
        headingDeg: 0,
      });
      return varName;
    });

    const methodName = methodNames.allocate(line.name, `path${index + 1}`);
    methodNameByLineId.set(lineId(line, index), methodName);

    const notes: string[] = [];
    const heading = headingCall(line.heading, {
      startPoseVar: segmentStartPoseVar,
      endPoseVar,
      endX: endPoint.x,
      endY: endPoint.y,
      definePose(nameHint, x, y, headingDeg) {
        const varName = poseNames.allocateExact(nameHint);
        poses.push({ varName, x, y, headingDeg });
        return varName;
      },
      warn(message) {
        notes.push(message);
        warnings.push(`${methodName}: ${message}`);
      },
    });

    if (heading.kind === "unsupported") {
      notes.unshift(heading.reason);
      warnings.push(`${methodName}: ${heading.reason}`);
    }
    if (heading.kind === "piecewise") usesInterpolator = true;

    const note = notes.length ? `TODO: ${notes.join("; ")}` : undefined;

    paths.push({
      methodName,
      startPoseVar: segmentStartPoseVar,
      controlPoseVars,
      endPoseVar,
      heading,
      note,
    });

    previous = {
      varName: endPoseVar,
      x: endPoint.x,
      y: endPoint.y,
      headingDeg: endHeadingDeg,
    };
  });

  return {
    options,
    startPoseVar,
    poses,
    paths,
    sequence: buildSequence(lines, paths, methodNameByLineId, input.sequence),
    warnings,
    usesInterpolator,
  };
}

function buildSequence(
  lines: AtomicPath[],
  paths: PathDecl[],
  methodNameByLineId: Map<string, string>,
  sequence: SequenceItem[] | undefined,
): SequenceStep[] {
  // Fall back to running every path in declaration order.
  const allPaths = (): SequenceStep[] =>
    paths.map((path) => ({
      kind: "path" as const,
      methodName: path.methodName,
    }));

  if (!sequence || sequence.length === 0) return allPaths();

  const steps: SequenceStep[] = [];
  sequence.forEach((item) => {
    if (item.kind === "wait") {
      steps.push({ kind: "wait", durationMs: item.durationMs });
      return;
    }
    const methodName = methodNameByLineId.get(item.lineId);
    if (methodName) steps.push({ kind: "path", methodName });
  });
  if (steps.length === 0 && lines.length > 0) return allPaths();
  return steps;
}
