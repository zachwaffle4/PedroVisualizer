<script lang="ts">
  import PlayIcon from "./icons/PlayIcon.svelte";
  import PauseIcon from "./icons/PauseIcon.svelte";
  import PenIcon from "./icons/PenIcon.svelte";

  interface Props {
    playing?: boolean;
    penToolEnabled?: boolean;
    onAddPath: () => void;
    onTogglePenTool: () => void;
    onAddControlPoint: () => void;
    onRemoveControlPoint: () => void;
    onCreatePathToLastPoint: () => void;
    onTogglePlay: () => void;
  }

  let {
    playing = false,
    penToolEnabled = false,
    onAddPath,
    onTogglePenTool,
    onAddControlPoint,
    onRemoveControlPoint,
    onCreatePathToLastPoint,
    onTogglePlay,
  }: Props = $props();
</script>

<div class="center-toolbar">
  <button class="toolbar-btn" onclick={onAddPath}>+ Add Path</button>
  <button class="toolbar-btn" onclick={onAddControlPoint}
    >+ Control Point</button
  >
  <button class="toolbar-btn" onclick={onRemoveControlPoint}
    >- Control Point</button
  >
  <button
    class="toolbar-btn toolbar-btn--blue"
    onclick={onCreatePathToLastPoint}
  >
    Create Path to Last Point
  </button>
  <!-- The pen tool sits at the end of the tool list, shown as an icon. -->
  <button
    class="toolbar-btn toolbar-btn--icon"
    class:toolbar-btn--blue={penToolEnabled}
    aria-pressed={penToolEnabled}
    title={penToolEnabled ? "Pen Tool (on)" : "Pen Tool"}
    aria-label={penToolEnabled ? "Disable pen tool" : "Enable pen tool"}
    onclick={onTogglePenTool}
  >
    <PenIcon className="size-5" strokeWidth={2} />
  </button>
  <div style="flex: 1;"></div>
  <button
    class="toolbar-btn toolbar-btn--icon"
    title={playing ? "Pause" : "Play"}
    aria-label={playing ? "Pause" : "Play"}
    onclick={onTogglePlay}
  >
    {#if playing}
      <PauseIcon className="size-5" strokeWidth={2} />
    {:else}
      <PlayIcon className="size-5" strokeWidth={2} />
    {/if}
  </button>
</div>
