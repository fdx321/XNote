import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { mockFs } from '../utils/fs-adapter';

export interface FileNode {
  name: String;
  path: String;
  is_dir: boolean;
  children?: FileNode[];
  last_modified?: String;
}

export type NoticeType = 'info' | 'success' | 'error';

export type AppTheme = 'zinc' | 'midnight' | 'grape';

const applyTheme = (theme: AppTheme) => {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.add('dark');
};

interface AppState {
  currentPath: string;
  files: FileNode[];
  selectedFile: FileNode | null;
  editorMode: 'edit' | 'split' | 'preview';
  viewMode: 'tree' | 'card'; // 'tree' is standard sidebar+editor, 'card' is folder view
  viewPath: string | null; // The path currently being viewed in Card Mode
  sidebarWidth: number;
  searchJump: { path: string; line: number } | null;
  searchShortcut: string;
  closeEditorShortcut: string;
  theme: AppTheme;
  notice: { id: number; type: NoticeType; message: string } | null;

  // Actions
  setFiles: (files: FileNode[]) => void;
  setCurrentPath: (path: string) => void;
  setSelectedFile: (file: FileNode | null) => void;
  setEditorMode: (mode: 'edit' | 'split' | 'preview') => void;
  setViewMode: (mode: 'tree' | 'card') => void;
  setViewPath: (path: string | null) => void;
  setSidebarWidth: (width: number) => void;
  setSearchJump: (jump: { path: string; line: number } | null) => void;
  setSearchShortcut: (shortcut: string) => void;
  setCloseEditorShortcut: (shortcut: string) => void;
  setTheme: (theme: AppTheme) => void;
  pushNotice: (message: string, type?: NoticeType) => void;
  clearNotice: () => void;
  loadFiles: (path: string) => Promise<void>;
  moveFile: (source: string, target: string) => Promise<void>;
  renameFile: (path: string, newName: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  copyFile: (source: string, target: string) => Promise<void>;
  loadConfig: () => Promise<void>;
  saveConfig: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  currentPath: '',
  files: [],
  selectedFile: null,
  editorMode: 'split',
  viewMode: 'tree',
  viewPath: null,
  sidebarWidth: 256,
  searchJump: null,
  searchShortcut: 'Cmd+G',
  closeEditorShortcut: 'Cmd+W',
  theme: 'zinc',
  notice: null,

  setFiles: (files) => set({ files }),
  setCurrentPath: (path) => set({ currentPath: path }),
  setSelectedFile: (file) => set({ selectedFile: file }),
  setEditorMode: (mode) => {
      set({ editorMode: mode });
      get().saveConfig();
  },
  setViewMode: (mode) => set({ viewMode: mode }),
  setViewPath: (path) => set({ viewPath: path }),
  setSidebarWidth: (width) => {
      set({ sidebarWidth: width });
      get().saveConfig();
  },
  setSearchJump: (jump) => set({ searchJump: jump }),
  setSearchShortcut: (shortcut) => {
      set({ searchShortcut: shortcut });
      get().saveConfig();
  },
  setCloseEditorShortcut: (shortcut) => {
      set({ closeEditorShortcut: shortcut });
      get().saveConfig();
  },
  setTheme: (theme) => {
      set({ theme });
      applyTheme(theme);
      get().saveConfig();
  },
  pushNotice: (message, type = 'info') => set({ notice: { id: Date.now(), type, message } }),
  clearNotice: () => set({ notice: null }),
  
  loadConfig: async () => {
      try {
          // @ts-ignore
          if (window.__TAURI_INTERNALS__) {
              const configStr = await invoke<string>('get_config');
              if (configStr) {
                  const config = JSON.parse(configStr);
                  const theme = (config.theme as AppTheme | undefined) ?? 'zinc';
                  set({
                      sidebarWidth: config.sidebarWidth ?? 256,
                      editorMode: config.editorMode ?? 'split',
                      searchShortcut: config.shortcuts?.search ?? 'Cmd+G',
                      closeEditorShortcut: config.shortcuts?.closeEditor ?? config.shortcuts?.close ?? 'Cmd+W',
                      theme
                  });
                  applyTheme(theme);
              }
          }
      } catch (err) {
          console.error("Failed to load config:", err);
      }
  },

  saveConfig: async () => {
      const { sidebarWidth, editorMode, searchShortcut, closeEditorShortcut, theme } = get();
      try {
          // @ts-ignore
          if (window.__TAURI_INTERNALS__) {
              const config = {
                  sidebarWidth,
                  editorMode,
                  theme,
                  shortcuts: {
                      search: searchShortcut,
                      closeEditor: closeEditorShortcut
                  }
              };
              await invoke('save_config', { config: JSON.stringify(config) });
          }
      } catch (err) {
          console.error("Failed to save config:", err);
      }
  },

  loadFiles: async (path) => {
    console.log("Store: loadFiles called for path:", path);
    try {
      // Helper to sort files: Folders first, then Alphabetical
      const sortFiles = (nodes: FileNode[]): FileNode[] => {
          return nodes.sort((a, b) => {
              if (a.is_dir === b.is_dir) {
                  return a.name.localeCompare(b.name as string);
              }
              return a.is_dir ? -1 : 1;
          }).map(node => {
              if (node.children) {
                  node.children = sortFiles(node.children);
              }
              return node;
          });
      };

      // Force mock if path is '/mock', regardless of environment
      if (path === '/mock') {
          console.log("Loading mock files (forced):", path);
          let files = await mockFs.readDir(path);
          files = sortFiles(files);
          set({ files, currentPath: path });
          return;
      }

      // @ts-ignore
      if (window.__TAURI_INTERNALS__) {
          console.log("Store: Invoking get_files via Tauri");
          let files = await invoke<FileNode[]>('get_files', { path });
          console.log("Store: Received files from backend:", files.length);
          files = sortFiles(files);
          set({ files, currentPath: path });
      } else {
          // Browser Mock
          console.log("Loading mock files for path:", path);
          let files = await mockFs.readDir(path);
          files = sortFiles(files);
          set({ files, currentPath: path });
      }
    } catch (error) {
      console.error('Failed to load files:', error);
    }
  },

  moveFile: async (source, target) => {
      const { currentPath, loadFiles } = get();
      try {
          const isMock = currentPath === '/mock' || !(window as any).__TAURI_INTERNALS__;
          
          if (isMock) {
              console.log("[Mock] Moving file:", source, "->", target);
              const { mockFs } = await import('../utils/fs-adapter');
              await mockFs.moveFile(source, target);
          } else {
              await invoke('move_path', { source, target });
          }
          await loadFiles(currentPath);
      } catch (err) {
          console.error("Failed to move file:", err);
          throw err;
      }
  },

  renameFile: async (path, newName) => {
      const { currentPath, loadFiles } = get();
      try {
          // Calculate new path
          const parentPath = path.substring(0, path.lastIndexOf('/'));
          const newPath = `${parentPath}/${newName}`;

          const isMock = currentPath === '/mock' || !(window as any).__TAURI_INTERNALS__;
          
          if (isMock) {
              console.log("[Mock] Renaming file:", path, "->", newPath);
              const { mockFs } = await import('../utils/fs-adapter');
              await mockFs.moveFile(path, newPath); // Rename is essentially a move
          } else {
              await invoke('move_path', { source: path, target: newPath });
          }
          await loadFiles(currentPath);
      } catch (err) {
          console.error("Failed to rename file:", err);
          throw err;
      }
  },

  deleteFile: async (path) => {
      const { currentPath, loadFiles } = get();
      try {
          // Check for mock mode or if Tauri is not available
          const isMock = currentPath === '/mock' || !(window as any).__TAURI_INTERNALS__;

          if (isMock) {
              console.log("[Mock] Deleting file:", path);
              const { mockFs } = await import('../utils/fs-adapter');
              await mockFs.deleteFile(path);
          } else {
              await invoke('delete_path', { path });
          }
          await loadFiles(currentPath);
      } catch (err) {
          console.error("Failed to delete file:", err);
          throw err;
      }
  },

  copyFile: async (source, target) => {
      const { currentPath, loadFiles } = get();
      try {
          const isMock = currentPath === '/mock' || !(window as any).__TAURI_INTERNALS__;
          
          if (isMock) {
              console.log("[Mock] Copying file:", source, "->", target);
              const { mockFs } = await import('../utils/fs-adapter');
              await mockFs.copyFile(source, target);
          } else {
              await invoke('copy_file', { source, target });
          }
          await loadFiles(currentPath);
      } catch (err) {
          console.error("Failed to copy file:", err);
          throw err;
      }
  }
}));

applyTheme('zinc');
