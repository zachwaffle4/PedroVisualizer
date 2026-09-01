<script lang="ts">
  import { run } from "svelte/legacy";

  import type {
    Line,
    BasePoint,
    Settings,
    Shape,
    SequenceItem,
    StartPose,
  } from "../types";
  import type * as d3 from "d3";
  import ObstaclesSection from "./components/ObstaclesSection.svelte";
  import RobotPositionDisplay from "./components/RobotPositionDisplay.svelte";
  import StartingPointSection from "./components/StartingPointSection.svelte";
  import PlaybackControls from "./components/PlaybackControls.svelte";
  import { calculatePathTime, normalizeLines } from "../utils";
  import SelectedPathInspector from "./components/SelectedPathInspector.svelte";
  import { curveThroughPoints } from "../utils/math";
  import { segmentStartAt } from "../utils/pathTraversal";

  interface Props {
    percent: number;
    playing: boolean;
    play: () => any;
    pause: () => any;
    startPoint: StartPose;
    lines: Line[];
    sequence: SequenceItem[];
    selectedLineIndex?: number;
    selectedPointIndex?: number;
    robotXY: BasePoint;
    robotHeading: number;
    x: d3.ScaleLinear<number, number>;
    y: d3.ScaleLinear<number, number>;
    settings: Settings;
    handleSeek: (percent: number) => void;
    loopAnimation: boolean;
    shapes: Shape[];
    recordChange: () => void;
  }

  let {
    percent = $bindable(),
    playing = $bindable(),
    play,
    pause,
    startPoint = $bindable(),
    lines = $bindable(),
    sequence = $bindable(),
    selectedLineIndex = $bindable(0),
    selectedPointIndex = $bindable(0),
    robotXY,
    robotHeading,
    x,
    y,
    settings,
    handleSeek,
    loopAnimation = $bindable(),
    shapes = $bindable(),
    recordChange,
  }: Props = $props();

  let curveTension = $state(1.0);
  let obstaclesOpen = $state(true);

  let selectedLine: Line | null = $derived(
    lines[selectedLineIndex] || lines[0] || null,
  );
  let selectedLinePathIndex = $derived.by(() => {
    const line = selectedLine;
    return line ? lines.findIndex((candidate) => candidate.id === line.id) : -1;
  });
  let selectedPoint: BasePoint | null = $derived.by(() => {
    const line = selectedLine;
    if (!line) return null;
    return selectedPointIndex === 0
      ? line.endPoint
      : line.controlPoints[selectedPointIndex - 1] || null;
  });
  let selectedPointLabel = $derived(
    selectedLine && selectedPoint
      ? selectedPointIndex === 0
        ? "Endpoint"
        : `Control Point ${selectedPointIndex}`
      : "Selected Point",
  );

  // Keep the selected point index inside the current line's range.
  run(() => {
    if (
      selectedLine &&
      selectedPointIndex > selectedLine.controlPoints.length
    ) {
      selectedPointIndex = selectedLine.controlPoints.length;
    }
    if (selectedPointIndex < 0) {
      selectedPointIndex = 0;
    }
  });

  function commitSelectedPointChange() {
    lines = [...lines];
    recordChange?.();
  }

  function toggleSelectedPointLock() {
    if (!selectedPoint) return;
    selectedPoint.locked = !selectedPoint.locked;
    lines = [...lines];
    recordChange?.();
  }

  // Compute timeline markers for the UI (start of each travel segment)
  let timePrediction = $derived(
    calculatePathTime(startPoint, lines, settings, sequence),
  );
  let markers = $derived(
    (() => {
      const _markers: { percent: number; color: string; name: string }[] = [];
      if (
        !timePrediction ||
        !timePrediction.timeline ||
        timePrediction.totalTime <= 0
      )
        return _markers;

      timePrediction.timeline.forEach((ev) => {
        if ((ev as any).type === "travel") {
          const end = (ev as any).endTime as number;
          const pct = (end / timePrediction.totalTime) * 100;
          const lineIndex = (ev as any).lineIndex as number;
          const line = lines[lineIndex];
          const color = line?.color || "#ffffff";
          const name = line?.name || `Path ${lineIndex + 1}`;
          _markers.push({ percent: pct, color, name });
        }
      });

      return _markers;
    })(),
  );

  // Collapsed state for obstacles (default collapsed)
  let collapsedObstacles = $state(shapes.map(() => true));

  // Keep obstacle collapse state aligned with shapes list
  run(() => {
    if (shapes.length !== collapsedObstacles.length) {
      collapsedObstacles = shapes.map(() => true);
    }
  });

  // Convert selected line to cubic Bezier curve using a Catmull-Rom through-points approach.
  // This replaces controlPoints with two control points (cubic) computed from adjacent points.
  function curveFromSelected(tension = 1.0) {
    if (!selectedLine || selectedLineIndex == null) return;

    // Find the index of this line in the sequence
    const seqIndex = sequence.findIndex(
      (item) => item.kind === "path" && item.lineId === selectedLine.id,
    );
    if (seqIndex === -1) return;

    // Get previous point (startPoint for first line, or previous line's endPoint)
    const prevPoint = segmentStartAt(startPoint, lines, selectedLineIndex);
    if (!prevPoint) return;
    const startPt = selectedLine.endPoint;

    // Find next line in sequence
    let nextLineId: string | null = null;
    for (let i = seqIndex + 1; i < sequence.length; i++) {
      if (sequence[i].kind === "path") {
        nextLineId = (sequence[i] as any).lineId;
        break;
      }
    }

    const nextLine = nextLineId ? lines.find((l) => l.id === nextLineId) : null;
    const endPt = nextLine?.endPoint || startPt;

    // Build poses: prevPoint -> startPt -> endPt
    const poses = [prevPoint, startPt, endPt];

    const segments = curveThroughPoints(tension, poses);
    if (!segments || segments.length === 0) {
      alert(
        "Curve generation produced no segments — need at least two path points.",
      );
      return;
    }

    const nextLines = [...lines];
    const seg = segments[0];
    const existing = nextLines[selectedLineIndex];
    if (existing) {
      nextLines[selectedLineIndex] = {
        ...existing,
        controlPoints: [
          { x: seg.cp1.x, y: seg.cp1.y },
          { x: seg.cp2.x, y: seg.cp2.y },
        ],
        endPoint: { ...existing.endPoint, x: seg.end.x, y: seg.end.y },
      };
    }

    lines = normalizeLines(nextLines);
    recordChange();
    alert(`Curved path with tension ${tension}`);
  }

  function removeLine(idx: number) {
    const removedId = lines[idx]?.id;
    let _lns = lines;
    lines.splice(idx, 1);
    lines = _lns;
    if (removedId) {
      sequence = sequence.filter(
        (s) => s.kind === "wait" || s.lineId !== removedId,
      );
    }
    recordChange();
  }

  function deleteSelectedLine() {
    if (!selectedLine) return;
    if (lines.length <= 1) return;

    removeLine(selectedLineIndex);
    selectedLineIndex = Math.max(
      0,
      Math.min(selectedLineIndex, lines.length - 1),
    );
    selectedPointIndex = 0;
    recordChange();
  }

  function deleteSelectedControlPoint() {
    if (!selectedLine || selectedPointIndex <= 0) return;

    const controlPointIndex = selectedPointIndex - 1;
    if (!selectedLine.controlPoints[controlPointIndex]) return;

    selectedLine.controlPoints.splice(controlPointIndex, 1);
    lines = [...lines];
    selectedPointIndex = Math.min(
      selectedPointIndex,
      selectedLine.controlPoints.length,
    );
    recordChange();
  }
</script>

<div class="flex-1 flex flex-col justify-start items-center gap-2 h-full">
  <div
    class="flex flex-col justify-start items-start w-full bg-[#1a1a1a] border border-[#333333] p-3 overflow-y-scroll overflow-x-hidden h-full gap-3"
  >
    <div class="w-full flex flex-col gap-2">
      {#if settings.experimentalFeatures?.obstacles}
        <button
          class="flex items-center justify-between gap-2 w-full border border-[#333333] bg-[#222222] px-3 py-2 text-xs text-gray-200"
          onclick={() => (obstaclesOpen = !obstaclesOpen)}
          title={obstaclesOpen
            ? "Hide obstacle editor"
            : "Show obstacle editor"}
        >
          <span class="font-semibold uppercase tracking-wide">Obstacles</span>
          <span class="text-[11px] text-gray-400"
            >{obstaclesOpen ? "Hide" : "Show"}</span
          >
        </button>
        {#if obstaclesOpen}
          <ObstaclesSection bind:shapes bind:collapsedObstacles />
        {/if}
      {/if}
    </div>

    <div class="grid w-full grid-cols-1 gap-2 lg:grid-cols-2">
      <div class="w-full border border-[#333333] bg-[#222222] p-3">
        <StartingPointSection bind:startPoint />
      </div>
      <div class="w-full border border-[#333333] bg-[#222222] p-3">
        <RobotPositionDisplay {robotXY} {robotHeading} {x} {y} />
      </div>
    </div>

    <SelectedPathInspector
      {selectedLine}
      {selectedLinePathIndex}
      {selectedPoint}
      bind:selectedPointIndex
      {selectedPointLabel}
      lineCount={lines.length}
      {settings}
      bind:curveTension
      onNameInput={(name) => {
        if (selectedLine) selectedLine.name = name;
        lines = [...lines];
      }}
      onLinesChanged={() => (lines = [...lines])}
      onRecordChange={() => recordChange?.()}
      onCurveFromSelected={curveFromSelected}
      onDeleteSelectedLine={deleteSelectedLine}
      onDeleteControlPoint={deleteSelectedControlPoint}
      onToggleLock={toggleSelectedPointLock}
      onCommitPointChange={commitSelectedPointChange}
    />
  </div>

  <PlaybackControls
    {playing}
    {play}
    {pause}
    bind:percent
    {handleSeek}
    bind:loopAnimation
    {markers}
    totalTime={timePrediction?.totalTime ?? 0}
  />
</div>
