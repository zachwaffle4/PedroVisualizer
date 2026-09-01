<script lang="ts">
  import type { AtomicPath, BasePoint, Settings } from "../../types";
  import StatCell from "./ui/StatCell.svelte";
  import SelectedPointEditor from "./SelectedPointEditor.svelte";

  interface Props {
    selectedLine: AtomicPath | null;
    selectedLinePathIndex: number;
    selectedPoint: BasePoint | null;
    selectedPointIndex: number;
    selectedPointLabel: string;
    lineCount: number;
    settings: Settings;
    curveTension: number;
    onNameInput: (name: string) => void;
    onLinesChanged: () => void;
    onRecordChange: () => void;
    onCurveFromSelected: (tension: number) => void;
    onDeleteSelectedLine: () => void;
    onDeleteControlPoint: () => void;
    onToggleLock: () => void;
    onCommitPointChange: () => void;
  }

  let {
    selectedLine,
    selectedLinePathIndex,
    selectedPoint,
    selectedPointIndex = $bindable(),
    selectedPointLabel,
    lineCount,
    settings,
    curveTension = $bindable(),
    onNameInput,
    onLinesChanged,
    onRecordChange,
    onCurveFromSelected,
    onDeleteSelectedLine,
    onDeleteControlPoint,
    onToggleLock,
    onCommitPointChange,
  }: Props = $props();
</script>

<div
  class="w-full border border-[#333333] bg-[#222222] p-3 text-xs text-gray-400 space-y-3"
>
  <div
    class="flex items-start justify-between gap-3 border-b border-[#333333] pb-2"
  >
    <div>
      <div class="font-semibold text-gray-100">Selected Path</div>
      <div class="text-[11px] text-gray-500">
        Pick a path in the list to inspect it.
      </div>
    </div>
    <div class="flex items-center gap-2">
      <div class="text-[11px] text-gray-400">
        {selectedLine ? `#${selectedLinePathIndex + 1}` : "None"}
      </div>
      {#if settings.experimentalFeatures?.curveThrough && selectedLine}
        <input
          type="number"
          min="0.1"
          max="3"
          step="0.1"
          bind:value={curveTension}
          class="w-20 px-2 py-1 rounded border bg-[#111111] text-sm text-gray-200"
          title="Curve tension (smaller = looser)"
        />
        <button
          class="rounded border border-[#444444] bg-[#2b2b2b] px-2 py-1 text-[10px] font-semibold text-gray-200 hover:bg-[#333333] disabled:cursor-not-allowed disabled:opacity-50"
          onclick={() => onCurveFromSelected(curveTension)}
          disabled={selectedLine.controlPoints.length === 0}
          title="Convert this path to a smooth cubic Bezier"
        >
          Curve Path
        </button>
      {/if}
      <button
        class="rounded border border-red-700 bg-red-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 flex items-center gap-2"
        onclick={onDeleteSelectedLine}
        disabled={!selectedLine || lineCount <= 1}
        title={lineCount <= 1
          ? "At least one path must remain"
          : "Delete the selected path"}
      >
        <span class="font-bold">✕</span>
        <span>Delete Path</span>
      </button>
    </div>
  </div>

  {#if selectedLine}
    <div class="grid grid-cols-2 gap-2 text-[11px] text-gray-300">
      <div class="border border-[#333333] bg-[#1f1f1f] px-2 py-1.5">
        <div class="text-gray-500">Name</div>
        <input
          value={selectedLine.name || ""}
          placeholder={`Path ${selectedLinePathIndex + 1}`}
          type="text"
          class="w-full bg-transparent font-medium text-gray-100 border-none outline-none focus:ring-1 focus:ring-green-500 rounded px-0 py-0.5"
          disabled={selectedLine.locked}
          oninput={(e) => onNameInput(e.currentTarget.value)}
          onchange={onRecordChange}
        />
      </div>
      <StatCell label="Endpoint">
        {selectedLine.endPoint.x.toFixed(1)}, {selectedLine.endPoint.y.toFixed(
          1,
        )}
      </StatCell>
      <StatCell label="Control Points">
        {selectedLine.controlPoints.length}
      </StatCell>
      <StatCell label="Locked">
        {selectedLine.locked ? "Yes" : "No"}
      </StatCell>
    </div>

    {#if selectedPoint}
      <SelectedPointEditor
        {selectedLine}
        {selectedPoint}
        bind:selectedPointIndex
        {selectedPointLabel}
        onCommit={onCommitPointChange}
        {onLinesChanged}
        {onRecordChange}
        {onDeleteControlPoint}
        {onToggleLock}
      />
    {/if}

    <div class="grid gap-2 text-[11px] sm:grid-cols-2">
      <StatCell
        label="Color"
        roomy
        valueClass="mt-1 flex items-center gap-2 font-medium text-gray-100 leading-snug"
      >
        <span
          class="size-2.5 rounded-full"
          style={`background:${selectedLine.color || "#666666"}`}
        ></span>
        <span>{selectedLine.color || "Default"}</span>
      </StatCell>

      <StatCell
        label="Status"
        roomy
        valueClass="mt-1 font-medium text-gray-100 leading-snug"
      >
        {selectedLine.locked ? "Locked" : "Editable"}
      </StatCell>
    </div>
  {:else}
    <div class="text-[11px] text-gray-500">
      Select a path from the left list to inspect it here.
    </div>
  {/if}
</div>
