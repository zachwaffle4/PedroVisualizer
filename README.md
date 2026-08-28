# Pedro Pathing Visualizer

Big Thanks to #16166 Watt's Up for developing this, we really appreciate your work.

## Builds

The same Svelte app ships in three forms. Platform-specific behavior is picked
at runtime by `isDesktop()` in `src/utils/platform.ts`, so no build flags or
forked code paths are involved.

| Command                 | Output                             | Notes                                                                                                                    |
| ----------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `bun run build`         | `dist/`                            | Static web build, unchanged.                                                                                             |
| `bun run build:exe`     | `out/pedro-visualizer`             | Single-file Bun executable: embeds `dist/` and serves it on localhost, then opens your browser. `--port=N`, `--no-open`. |
| `bun run desktop:build` | `src-tauri/target/release/bundle/` | Native macOS `.app` + `.dmg` via Tauri. `bun run desktop:dev` for a dev window with HMR.                                 |

### File handling

- **Web / Bun executable** — paths live in `localStorage` (`src/utils/browserFileStore.ts`),
  import/export go through the browser's file input and download.
- **Desktop** — paths are real files in `~/Documents/Pedro Pathing Visualizer`,
  and Open/Save As use native OS dialogs, so a path can be saved anywhere on
  disk (`src/utils/tauriFileStore.ts`, `src/utils/desktopFiles.ts`).

`src/utils/fileStore.ts` is the single import point that resolves to whichever
of the two is appropriate; call sites don't know the difference.
