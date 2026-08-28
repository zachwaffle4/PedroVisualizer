// src/utils/tauriFileStore.ts
// Desktop (Tauri) file store: same interface as browserFileStore, but backed by
// real files in ~/Documents/Pedro Pathing Visualizer via Rust commands.

import { invoke } from "@tauri-apps/api/core";
import type { FileInfo } from "./browserFileStore";

export type { FileInfo };

export async function listFiles(): Promise<FileInfo[]> {
  return invoke("list_files");
}

export async function readFile(path: string): Promise<string> {
  return invoke("read_file", { path });
}

export async function writeFile(
  path: string,
  content: string,
): Promise<boolean> {
  return invoke("write_file", { path, content });
}

export async function deleteFile(path: string): Promise<boolean> {
  return invoke("delete_file", { path });
}

export async function fileExists(path: string): Promise<boolean> {
  return invoke("file_exists", { path });
}

export async function renameFile(
  oldPath: string,
  newPath: string,
): Promise<{ success: boolean; newPath: string }> {
  const success = await invoke<boolean>("rename_file", { oldPath, newPath });
  return { success, newPath: success ? newPath : oldPath };
}

export async function getDirectoryStats(): Promise<{
  totalFiles: number;
  totalSize: number;
  lastModified: number;
}> {
  return invoke("dir_stats");
}

/** Absolute path of the folder the desktop app keeps paths in. */
export async function workspacePath(): Promise<string> {
  return invoke("workspace_path");
}
