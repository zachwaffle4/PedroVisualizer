import type { Line, SequenceItem, Settings, Shape, StartPose } from "../types";
import type { FieldPoint } from "./fieldPoints";

export const PROJECT_VERSION = "1.4.0";

export interface ProjectDoc {
  startPoint: StartPose;
  lines: Line[];
  shapes: Shape[];
  sequence: SequenceItem[];
  fieldPoints?: FieldPoint[];
  settings?: Settings;
  activePaths?: string[];
}

export function buildProject(
  doc: ProjectDoc,
  overrides: Record<string, unknown> = {},
) {
  return {
    ...doc,
    version: PROJECT_VERSION,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

export function serializeProject(
  doc: ProjectDoc,
  options: { pretty?: boolean; overrides?: Record<string, unknown> } = {},
): string {
  const { pretty = false, overrides = {} } = options;
  return JSON.stringify(
    buildProject(doc, overrides),
    null,
    pretty ? 2 : undefined,
  );
}
