<script lang="ts">
  interface Props {
    side: "left" | "right";
    hidden?: boolean;
    onResizeStart: (side: "left" | "right", event: MouseEvent) => void;
    onRestore: () => void;
  }

  let { side, hidden = false, onResizeStart, onRestore }: Props = $props();

  let label = $derived(side === "left" ? "left" : "right");
</script>

<!-- A hidden sidebar collapses its divider to zero width too, so the centre
     stage gets the space back. The navbar toggle brings the sidebar back. -->
<div
  class="panel-divider panel-divider--{side}"
  class:panel-divider--hidden={hidden}
>
  {#if !hidden}
    <button
      class="panel-divider-grip"
      type="button"
      aria-label="Resize {label} panel"
      title="Drag to resize the {label} panel"
      onmousedown={(event) => onResizeStart(side, event)}
      onclick={() => {
        if (hidden) onRestore();
      }}
    >
      <span class="panel-divider-line"></span>
    </button>
  {/if}
</div>
