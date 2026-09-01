<script lang="ts">
  interface Props {
    hidden?: boolean;
    fileName: string;
    version: string;
    lineCount: number;
    pathPreviewItems: {
      index: number;
      lineId: string;
      name: string;
      x: string;
      y: string;
    }[];
    selectedLineId: string | null;
    onToggleVisibility: () => void;
    onSelectLine: (lineId: string) => void;
  }

  let {
    hidden = false,
    fileName,
    version,
    lineCount,
    pathPreviewItems,
    selectedLineId,
    onToggleVisibility,
    onSelectLine,
  }: Props = $props();
</script>

<aside
  class="panel-box side-rail side-rail-left"
  class:side-rail--collapsed={hidden}
>
  <section class="module-box">
    <div class="module-header-row">
      <h3 class="module-title">File</h3>
      <div class="flex items-center gap-2">
        <span class="module-chip">{version}</span>
        <button
          class="panel-toggle-btn"
          type="button"
          onclick={onToggleVisibility}
          aria-label={hidden ? "Show left panel" : "Hide left panel"}
          title={hidden ? "Show left panel" : "Hide left panel"}
        >
          {hidden ? "›" : "‹"}
        </button>
      </div>
    </div>
    <p class="module-caption">Export name</p>
    <div class="module-mono">{fileName}</div>
  </section>

  <section class="module-box module-fill">
    <div class="module-header-row">
      <h3 class="module-title">Path List</h3>
      <span class="module-caption">
        {lineCount} path{lineCount === 1 ? "" : "s"}
      </span>
    </div>
    <div class="module-list">
      {#each pathPreviewItems as item (item.index)}
        <button
          class="list-item-box compact text-left"
          class:list-item-box--selected={selectedLineId === item.lineId}
          onclick={() => onSelectLine(item.lineId)}
        >
          <div class="list-item-top">
            <span class="list-item-name">{item.name}</span>
          </div>
          <div class="list-item-sub">{item.x}, {item.y}</div>
        </button>
      {/each}
      {#if lineCount > pathPreviewItems.length}
        <div class="list-empty">
          + {lineCount - pathPreviewItems.length} more...
        </div>
      {/if}
    </div>
  </section>
</aside>
