// src/utils/fileStore.ts
// Single entry point for path storage. Resolves to real files on disk in the
// desktop (Tauri) build and to localStorage in the browser build.

import * as browser from "./browserFileStore";
import * as tauri from "./tauriFileStore";
import { isDesktop } from "./platform";

export type { FileInfo } from "./browserFileStore";

const impl = isDesktop() ? tauri : browser;

export const listFiles = impl.listFiles;
export const readFile = impl.readFile;
export const writeFile = impl.writeFile;
export const deleteFile = impl.deleteFile;
export const fileExists = impl.fileExists;
export const renameFile = impl.renameFile;
export const getDirectoryStats = impl.getDirectoryStats;
