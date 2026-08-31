import type { Line, Point, SequenceItem } from "../../types";
import { emitSource } from "./emit";
import { formatSource } from "./format";
import { javaSpec } from "./languages/java";
import { kotlinSpec } from "./languages/kotlin";
import type { LanguageSpec } from "./languages/spec";
import { buildExportModel } from "./model";
import type { ExportMode } from "./types";

export { buildExportModel } from "./model";
export { emitSource, pathExpression } from "./emit";
export { javaSpec } from "./languages/java";
export { kotlinSpec } from "./languages/kotlin";
export { PEDRO_API } from "./pedroApi";
export { generatePointsArray } from "./points";
export type { LanguageSpec } from "./languages/spec";
export type * from "./types";

async function generate(
  spec: LanguageSpec,
  startPoint: Point,
  lines: Line[],
  exportMode: ExportMode,
  mirrorHorizontally: boolean,
): Promise<string> {
  const model = buildExportModel({ startPoint, lines, mirrorHorizontally });
  const source = emitSource(model, spec, exportMode);
  if (exportMode === "coordinates") return source;
  return formatSource(source, spec);
}

export function generateJavaCode(
  startPoint: Point,
  lines: Line[],
  exportMode: ExportMode = "class",
  mirrorHorizontally = false,
): Promise<string> {
  return generate(javaSpec, startPoint, lines, exportMode, mirrorHorizontally);
}

export function generateKotlinCode(
  startPoint: Point,
  lines: Line[],
  exportMode: ExportMode = "class",
  mirrorHorizontally = false,
): Promise<string> {
  return generate(
    kotlinSpec,
    startPoint,
    lines,
    exportMode,
    mirrorHorizontally,
  );
}

export function generateSequentialCommandCode(
  startPoint: Point,
  lines: Line[],
  className: string | null = null,
  sequence?: SequenceItem[],
): Promise<string> {
  const model = buildExportModel({ startPoint, lines, sequence, className });
  return formatSource(emitSource(model, javaSpec, "full"), javaSpec);
}
