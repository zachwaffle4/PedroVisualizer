// src/utils/desktopFiles.ts
// Native open/save dialogs for the desktop (Tauri) build. Every function here
// assumes it is only called when `isDesktop()` is true.

import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

const FILTERS = [{ name: "Path files", extensions: ["pp", "json"] }];

export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/**
 * Shows a native save dialog and writes `content` to the chosen location.
 * Returns the absolute path written, or null if the user cancelled.
 */
export async function saveProjectAs(
  content: string,
  suggestedName = "path.pp",
): Promise<string | null> {
  const path = await save({
    defaultPath: suggestedName,
    filters: FILTERS,
  });
  if (!path) return null;
  await invoke("write_file_at", { path, content });
  return path;
}

/** Writes to an already-known absolute path. */
export async function saveProjectTo(
  path: string,
  content: string,
): Promise<void> {
  await invoke("write_file_at", { path, content });
}

/**
 * Shows a native open dialog and reads the chosen file.
 * Returns null if the user cancelled.
 */
export async function openProject(): Promise<{
  path: string;
  name: string;
  content: string;
} | null> {
  const selected = await open({ multiple: false, filters: FILTERS });
  if (typeof selected !== "string") return null;
  const content = await invoke<string>("read_file_at", { path: selected });
  return { path: selected, name: baseName(selected), content };
}
