import type {
  BasePoint,
  Line,
  Settings,
  StartPose,
  TimePrediction,
  TimelineEvent,
  SequenceItem,
} from "../types";
import {
  getLineStartHeading,
  getLineEndHeading,
  getAngularDifference,
} from "./math";
import { flattenToAtomicSegments } from "./pathTraversal";

/**
 * Calculate time for a motion profile (trapezoidal or triangular)
 */
function calculateMotionProfileTime(
  distance: number,
  maxVel: number,
  maxAcc: number,
  maxDec?: number,
): number {
  const deceleration = maxDec || maxAcc;

  const accDist = (maxVel * maxVel) / (2 * maxAcc);
  const decDist = (maxVel * maxVel) / (2 * deceleration);

  if (distance >= accDist + decDist) {
    const accTime = maxVel / maxAcc;
    const decTime = maxVel / deceleration;
    const constDist = distance - accDist - decDist;
    const constTime = constDist / maxVel;

    return accTime + constTime + decTime;
  } else {
    const vPeak = Math.sqrt(
      (2 * distance * maxAcc * deceleration) / (maxAcc + deceleration),
    );
    const accTime = vPeak / maxAcc;
    const decTime = vPeak / deceleration;

    return accTime + decTime;
  }
}

export function calculatePathTime(
  startPoint: StartPose,
  lines: Line[],
  settings: Settings,
  sequence?: SequenceItem[],
): TimePrediction {
  const msToSeconds = (value?: number | string) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    return numeric / 1000;
  };

  const useMotionProfile =
    settings.maxVelocity !== undefined &&
    settings.maxAcceleration !== undefined;

  const segmentLengths: number[] = [];
  const segmentTimes: number[] = [];
  const timeline: TimelineEvent[] = [];

  let currentTime = 0;
  let currentHeading = startPoint.headingDeg;

  // Create map by order of segments
  const segmentById = new Map(
    flattenToAtomicSegments(startPoint, lines).map((segment) => [
      segment.line.id,
      segment,
    ]),
  );

  const seq: SequenceItem[] =
    sequence && sequence.length
      ? sequence
      : lines.map((ln) => ({ kind: "path", lineId: ln.id }));

  // Where the robot actually sits, which does follow execution order.
  let robotPoint: BasePoint = startPoint;

  seq.forEach((item, idx) => {
    if (item.kind === "wait") {
      const waitSeconds = msToSeconds(item.durationMs);
      if (waitSeconds > 0) {
        timeline.push({
          type: "wait",
          name: item.name,
          duration: waitSeconds,
          startTime: currentTime,
          endTime: currentTime + waitSeconds,
          startHeading: currentHeading,
          targetHeading: currentHeading,
          atPoint: robotPoint,
        });
        currentTime += waitSeconds;
      }
      return;
    }

    const segment = segmentById.get(item.lineId);
    if (!segment) {
      // Skip missing or malformed lines in sequence
      return;
    }
    const line = segment.line;
    const prevPoint = segment.start;

    // --- ROTATION CHECK ---
    const requiredStartHeading = getLineStartHeading(line, prevPoint);
    if (idx === 0) currentHeading = requiredStartHeading;
    const diff = Math.abs(
      getAngularDifference(currentHeading, requiredStartHeading),
    );
    if (diff > 0.1) {
      const diffRad = diff * (Math.PI / 180);
      const rotTime = diffRad / settings.aVelocity;
      timeline.push({
        type: "wait",
        duration: rotTime,
        startTime: currentTime,
        endTime: currentTime + rotTime,
        startHeading: currentHeading,
        targetHeading: requiredStartHeading,
        atPoint: prevPoint,
      });
      currentTime += rotTime;
      currentHeading = requiredStartHeading;
    }

    // --- TRAVEL ---
    const length = segment.arcLength;
    segmentLengths.push(length);
    let segmentTime: number;

    if (useMotionProfile) {
      segmentTime = calculateMotionProfileTime(
        length,
        settings.maxVelocity!,
        settings.maxAcceleration!,
        settings.maxDeceleration,
      );
    } else {
      const avgVelocity = (settings.xVelocity + settings.yVelocity) / 2;
      segmentTime = length / avgVelocity;
    }
    segmentTimes.push(segmentTime);
    timeline.push({
      type: "travel",
      duration: segmentTime,
      startTime: currentTime,
      endTime: currentTime + segmentTime,
      lineId: line.id,
    });
    currentTime += segmentTime;
    currentHeading = getLineEndHeading(line, prevPoint);
    robotPoint = line.endPoint;
  });

  const totalTime = currentTime;
  const totalDistance = segmentLengths.reduce((sum, length) => sum + length, 0);

  return {
    totalTime,
    segmentTimes,
    totalDistance,
    timeline,
  };
}

export function formatTime(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0.0s";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}s`;
  }
  return `${seconds.toFixed(1)}s`;
}

export function getAnimationDuration(
  totalTime: number,
  speedFactor: number = 1.0,
): number {
  return (totalTime * 1000) / speedFactor;
}
