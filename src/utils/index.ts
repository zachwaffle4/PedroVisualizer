export * from "./animation";
export * from "./color";
export * from "./normalize";
export * from "./project";
export * from "./download";
export * from "./filename";
export * from "./file";
export * from "./geometry";
export * from "./gifExporter";
export * from "./math";
export * from "./shapes";
export * from "./timeCalculator";

export {
  segmentSupportsReverse,
  createDefaultPiecewiseSegment,
  createDefaultPiecewiseHeadingInterpolation,
  normalizePiecewiseHeadingInterpolation,
  validatePiecewiseHeadingInterpolation,
  degreesToRadians,
  headingAngleAt,
  evaluatePiecewiseHeading,
} from "./headingInterpolation";

export {
  CURVE_SAMPLES,
  lineCurvePoints,
  approximateCurveLength,
  getPointAndTangentAtProgress,
  getChainTraversalState,
  flattenToAtomicSegments,
  segmentStartById,
  atomicSegments,
  findSegmentById,
} from "./pathTraversal";
export type { FlatSegment } from "./pathTraversal";
