<script lang="ts">
  import { run } from "svelte/legacy";

  import { createEventDispatcher } from "svelte";
  import type {
    PiecewiseHeadingInterpolation,
    PiecewiseHeadingInterpolationType,
    PiecewiseHeadingSegment,
  } from "../../types";
  import {
    createDefaultPiecewiseHeadingInterpolation,
    normalizePiecewiseHeadingInterpolation,
    segmentSupportsReverse,
    validatePiecewiseHeadingInterpolation,
  } from "../../utils/headingInterpolation";

  interface Props {
    config: PiecewiseHeadingInterpolation;
    locked?: boolean;
  }

  let { config = $bindable(), locked = false }: Props = $props();

  const dispatch = createEventDispatcher();

  let advancedMode = $state(false);
  let activeBoundaryIndex: number | null = null;
  let validationMessage = $state("");

  const interpolationOptions: Array<{
    value: PiecewiseHeadingInterpolationType;
    label: string;
  }> = [
    { value: "linear", label: "Linear" },
    { value: "constant", label: "Constant" },
    { value: "tangential", label: "Tangent" },
    { value: "facing-point", label: "Facing Point" },
  ];

  function ensureConfig() {
    if (
      !config ||
      !Array.isArray(config.segments) ||
      config.segments.length === 0
    ) {
      config = createDefaultPiecewiseHeadingInterpolation();
      dispatch("change");
      return;
    }
  }

  run(() => {
    ensureConfig();
  });
  run(() => {
    validationMessage = validatePiecewiseHeadingInterpolation(config) || "";
  });

  function notifyChange(commit = false) {
    config = normalizePiecewiseHeadingInterpolation(config);
    dispatch(commit ? "commit" : "change");
  }

  function segmentAtProgress(progress: number): number {
    const normalized = normalizePiecewiseHeadingInterpolation(config);
    for (let index = 0; index < normalized.segments.length; index += 1) {
      const segment = normalized.segments[index];
      const isLast = index === normalized.segments.length - 1;
      if (
        progress >= segment.startProgress &&
        (progress < segment.endProgress || isLast)
      ) {
        return index;
      }
    }
    return normalized.segments.length - 1;
  }

  function segmentTemplate(
    source: PiecewiseHeadingSegment,
    startProgress: number,
    endProgress: number,
  ): PiecewiseHeadingSegment {
    return {
      startProgress,
      endProgress,
      interpolationType: source.interpolationType,
      reversed: source.reversed,
      parameters: source.parameters
        ? structuredClone(source.parameters)
        : undefined,
    };
  }

  function splitSegment(progress: number) {
    if (locked) return;
    const normalized = normalizePiecewiseHeadingInterpolation(config);
    const index = segmentAtProgress(progress);
    const target = normalized.segments[index];

    if (
      !target ||
      progress <= target.startProgress ||
      progress >= target.endProgress
    ) {
      return;
    }

    const left = segmentTemplate(target, target.startProgress, progress);
    const right = segmentTemplate(target, progress, target.endProgress);
    normalized.segments.splice(index, 1, left, right);
    config = normalized;
    notifyChange();
  }

  function removeSegment(index: number) {
    if (locked) return;
    const normalized = normalizePiecewiseHeadingInterpolation(config);
    if (normalized.segments.length <= 1) {
      config = createDefaultPiecewiseHeadingInterpolation();
      notifyChange();
      return;
    }

    normalized.segments.splice(index, 1);
    config = normalizePiecewiseHeadingInterpolation(normalized);
    notifyChange();
  }

  function getProgressFromPointer(
    event: PointerEvent,
    element: HTMLElement,
  ): number {
    const rect = element.getBoundingClientRect();
    const raw = (event.clientX - rect.left) / Math.max(rect.width, 1);
    return Math.max(0, Math.min(1, raw));
  }

  function beginBoundaryDrag(boundaryIndex: number, event: PointerEvent) {
    if (locked) return;
    event.preventDefault();
    event.stopPropagation();
    activeBoundaryIndex = boundaryIndex;

    const moveHandler = (moveEvent: PointerEvent) => {
      if (activeBoundaryIndex === null) return;
      const normalized = normalizePiecewiseHeadingInterpolation(config);
      const progress = getProgressFromPointer(
        moveEvent,
        event.currentTarget as HTMLElement,
      );
      const minGap = 0.0001;
      const previous = normalized.segments[activeBoundaryIndex - 1];
      const next = normalized.segments[activeBoundaryIndex];
      if (!previous || !next) return;

      const clamped = Math.min(
        Math.max(progress, previous.startProgress + minGap),
        next.endProgress - minGap,
      );

      previous.endProgress = clamped;
      next.startProgress = clamped;
      config = normalizePiecewiseHeadingInterpolation(normalized);
      dispatch("change");
    };

    const upHandler = () => {
      activeBoundaryIndex = null;
      window.removeEventListener("pointermove", moveHandler);
      window.removeEventListener("pointerup", upHandler);
      notifyChange(true);
    };

    window.addEventListener("pointermove", moveHandler);
    window.addEventListener("pointerup", upHandler);
  }

  function handleTimelineClick(event: PointerEvent) {
    if (locked) return;
    const progress = getProgressFromPointer(
      event,
      event.currentTarget as HTMLElement,
    );
    splitSegment(progress);
    notifyChange();
  }

  function updateSegment(
    index: number,
    patch: Partial<PiecewiseHeadingSegment>,
  ) {
    if (locked) return;
    const normalized = normalizePiecewiseHeadingInterpolation(config);
    const segment = normalized.segments[index];
    if (!segment) return;

    normalized.segments[index] = {
      ...segment,
      ...patch,
      parameters: patch.parameters
        ? {
            ...(segment.parameters || {}),
            ...patch.parameters,
          }
        : segment.parameters,
    };

    config = normalizePiecewiseHeadingInterpolation(normalized);
    notifyChange();
  }

  function setInterpolationType(
    index: number,
    interpolationType: PiecewiseHeadingInterpolationType,
  ) {
    const segment =
      normalizePiecewiseHeadingInterpolation(config).segments[index];
    if (!segment) return;

    const nextParameters = (() => {
      if (interpolationType === "constant")
        return { degrees: segment.parameters?.degrees ?? 0 };
      if (interpolationType === "linear") {
        return {
          startDeg: segment.parameters?.startDeg ?? 0,
          endDeg: segment.parameters?.endDeg ?? 0,
        };
      }
      if (interpolationType === "facing-point") {
        return {
          point: segment.parameters?.point
            ? { ...segment.parameters.point }
            : { x: 0, y: 0 },
        };
      }
      return undefined;
    })();

    updateSegment(index, {
      interpolationType,
      reversed: segmentSupportsReverse(interpolationType)
        ? !!segment.reversed
        : false,
      parameters: nextParameters,
    });
  }
</script>

<div
  class="space-y-3 rounded border border-neutral-700 bg-neutral-950/60 p-3 text-xs text-neutral-200"
>
  <div class="flex flex-wrap items-center justify-between gap-2">
    <div>
      <div class="font-medium text-neutral-100">Piecewise Heading</div>
      <div class="text-neutral-400">
        Click the timeline to add a boundary. Drag markers to adjust segment
        breaks.
      </div>
    </div>
    <label class="flex items-center gap-2 text-[11px] text-neutral-300">
      <input type="checkbox" bind:checked={advancedMode} disabled={locked} />
      Advanced progress editing
    </label>
  </div>

  <div
    class="relative h-4 rounded-full border border-neutral-700 bg-neutral-800/80"
    role="button"
    tabindex="0"
    aria-label="Piecewise progress timeline"
    onpointerdown={handleTimelineClick}
  >
    {#each normalizePiecewiseHeadingInterpolation(config).segments as segment, index (index)}
      <div
        class="absolute top-0 h-full rounded-full opacity-80"
        style={`left:${segment.startProgress * 100}%; width:${Math.max((segment.endProgress - segment.startProgress) * 100, 0.2)}%; background: linear-gradient(90deg, rgba(59,130,246,0.6), rgba(16,185,129,0.6));`}
      ></div>
      {#if index > 0}
        <button
          type="button"
          class="absolute top-1/2 z-10 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 bg-white shadow"
          style={`left:${segment.startProgress * 100}%`}
          onpointerdown={(event) => beginBoundaryDrag(index, event)}
          disabled={locked}
          aria-label={`Drag boundary ${index}`}
        ></button>
      {/if}
    {/each}
  </div>

  {#if validationMessage}
    <div
      class="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200"
    >
      {validationMessage}
    </div>
  {/if}

  <div class="space-y-2">
    {#each normalizePiecewiseHeadingInterpolation(config).segments as segment, index (index)}
      <div class="rounded border border-neutral-700 bg-neutral-900/80 p-2">
        <div class="flex items-center justify-between gap-2">
          <div class="text-[11px] font-semibold text-neutral-100">
            Segment {index + 1}
          </div>
          <button
            class="rounded border border-neutral-700 px-2 py-1 text-[10px] text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
            onclick={() => removeSegment(index)}
            disabled={locked ||
              normalizePiecewiseHeadingInterpolation(config).segments.length <=
                1}
          >
            Delete
          </button>
        </div>

        <div class="mt-2 grid gap-2 sm:grid-cols-2">
          <label class="space-y-1">
            <div class="text-[11px] text-neutral-400">Start progress</div>
            <input
              type="number"
              min="0"
              max="1"
              step="0.001"
              class="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-100"
              value={segment.startProgress.toFixed(3)}
              readonly={!advancedMode}
              disabled={locked}
              onchange={(event) =>
                updateSegment(index, {
                  startProgress: Number(
                    (event.currentTarget as HTMLInputElement).value,
                  ),
                })}
            />
          </label>
          <label class="space-y-1">
            <div class="text-[11px] text-neutral-400">End progress</div>
            <input
              type="number"
              min="0"
              max="1"
              step="0.001"
              class="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-100"
              value={segment.endProgress.toFixed(3)}
              readonly={!advancedMode}
              disabled={locked}
              onchange={(event) =>
                updateSegment(index, {
                  endProgress: Number(
                    (event.currentTarget as HTMLInputElement).value,
                  ),
                })}
            />
          </label>
        </div>

        <div class="mt-2 grid gap-2 sm:grid-cols-2">
          <label class="space-y-1 sm:col-span-1">
            <div class="text-[11px] text-neutral-400">Interpolation type</div>
            <select
              class="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-100"
              bind:value={segment.interpolationType}
              disabled={locked}
              onchange={(event) =>
                setInterpolationType(
                  index,
                  (event.currentTarget as HTMLSelectElement)
                    .value as PiecewiseHeadingInterpolationType,
                )}
            >
              {#each interpolationOptions as option (option.value)}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </label>

          {#if segmentSupportsReverse(segment.interpolationType)}
            <label
              class="flex items-end gap-2 rounded border border-neutral-700 px-2 py-1 text-[11px] text-neutral-300"
            >
              <input
                type="checkbox"
                checked={!!segment.reversed}
                disabled={locked}
                onchange={(event) =>
                  updateSegment(index, {
                    reversed: (event.currentTarget as HTMLInputElement).checked,
                  })}
              />
              Reverse
            </label>
          {/if}
        </div>

        {#if segment.interpolationType === "linear"}
          <div class="mt-2 grid gap-2 sm:grid-cols-2">
            <label class="space-y-1">
              <div class="text-[11px] text-neutral-400">
                Start heading (deg)
              </div>
              <input
                type="number"
                step="1"
                class="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-100"
                value={segment.parameters?.startDeg ?? 0}
                disabled={locked}
                onchange={(event) =>
                  updateSegment(index, {
                    parameters: {
                      startDeg: Number(
                        (event.currentTarget as HTMLInputElement).value,
                      ),
                    },
                  })}
              />
            </label>
            <label class="space-y-1">
              <div class="text-[11px] text-neutral-400">End heading (deg)</div>
              <input
                type="number"
                step="1"
                class="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-100"
                value={segment.parameters?.endDeg ?? 0}
                disabled={locked}
                onchange={(event) =>
                  updateSegment(index, {
                    parameters: {
                      endDeg: Number(
                        (event.currentTarget as HTMLInputElement).value,
                      ),
                    },
                  })}
              />
            </label>
          </div>
        {:else if segment.interpolationType === "constant"}
          <div class="mt-2">
            <label class="space-y-1">
              <div class="text-[11px] text-neutral-400">Heading (deg)</div>
              <input
                type="number"
                step="1"
                class="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-100"
                value={segment.parameters?.degrees ?? 0}
                disabled={locked}
                onchange={(event) =>
                  updateSegment(index, {
                    parameters: {
                      degrees: Number(
                        (event.currentTarget as HTMLInputElement).value,
                      ),
                    },
                  })}
              />
            </label>
          </div>
        {:else if segment.interpolationType === "facing-point"}
          <div class="mt-2 grid gap-2 sm:grid-cols-2">
            <label class="space-y-1">
              <div class="text-[11px] text-neutral-400">Target X</div>
              <input
                type="number"
                step="0.1"
                class="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-100"
                value={segment.parameters?.point?.x ?? 0}
                disabled={locked}
                onchange={(event) =>
                  updateSegment(index, {
                    parameters: {
                      point: {
                        x: Number(
                          (event.currentTarget as HTMLInputElement).value,
                        ),
                        y: segment.parameters?.point?.y ?? 0,
                      },
                    },
                  })}
              />
            </label>
            <label class="space-y-1">
              <div class="text-[11px] text-neutral-400">Target Y</div>
              <input
                type="number"
                step="0.1"
                class="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-100"
                value={segment.parameters?.point?.y ?? 0}
                disabled={locked}
                onchange={(event) =>
                  updateSegment(index, {
                    parameters: {
                      point: {
                        x: segment.parameters?.point?.x ?? 0,
                        y: Number(
                          (event.currentTarget as HTMLInputElement).value,
                        ),
                      },
                    },
                  })}
              />
            </label>
          </div>
        {:else}
          <div class="mt-2 text-[11px] text-neutral-400">
            This segment uses the path tangent. No extra parameters are
            required.
          </div>
        {/if}

        <div class="mt-2 text-[11px] text-neutral-400">
          {#if advancedMode}
            Progress: {segment.startProgress.toFixed(3)} to {segment.endProgress.toFixed(
              3,
            )}
          {:else}
            Progress values are read-only here. Enable advanced mode to edit
            them manually.
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <div class="flex justify-end">
    <button
      class="rounded border border-neutral-700 px-3 py-1 text-[11px] text-neutral-100 hover:bg-neutral-800 disabled:opacity-40"
      onclick={() => {
        if (locked) return;
        const normalized = normalizePiecewiseHeadingInterpolation(config);
        const last =
          normalized.segments[normalized.segments.length - 1] ||
          createDefaultPiecewiseHeadingInterpolation().segments[0];
        const newSegment = segmentTemplate(last, last.endProgress, 1);
        normalized.segments[normalized.segments.length - 1].endProgress =
          Math.max(
            0.5,
            normalized.segments[normalized.segments.length - 1].endProgress,
          );
        normalized.segments.push({
          ...newSegment,
          startProgress:
            normalized.segments[normalized.segments.length - 1].endProgress,
          endProgress: 1,
        });
        config = normalizePiecewiseHeadingInterpolation(normalized);
        notifyChange();
      }}
      disabled={locked}
    >
      Add Segment
    </button>
  </div>
</div>
