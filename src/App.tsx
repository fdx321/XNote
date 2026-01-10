import { useEffect, useState, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { NoteEditor } from './components/Editor';
import { Dashboard } from './components/Dashboard';
import { useAppStore } from './store';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { SettingsModal } from './components/SettingsModal';
import { CleanUnusedImagesModal } from './components/CleanUnusedImagesModal';

function App() {
  const { currentPath, viewMode, selectedFile, loadFiles, loadConfig, sidebarWidth, setSidebarWidth, searchShortcut, setSearchShortcut, theme, setTheme } = useAppStore();
  const [showAbout, setShowAbout] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [cleanProgress, setCleanProgress] = useState<{ message: string; current: number; total: number }>({
    message: '',
    current: 0,
    total: 0
  });
  const [cleanLog, setCleanLog] = useState<string>('');
  const [cleanBarVisible, setCleanBarVisible] = useState(false);
  const [cleanRunning, setCleanRunning] = useState(false);
  const [unusedImages, setUnusedImages] = useState<string[]>([]);
  const [showCleanModal, setShowCleanModal] = useState(false);
  // Removed local sidebarWidth state
  const [isResizing, setIsResizing] = useState(false);

  // Modal State - No longer used for switching workspace, but could be reused if needed. 
  // For now, removing the state related to input modal for workspace switch.

  const startResizing = useCallback((mouseDownEvent: React.MouseEvent) => {
    setIsResizing(true);
    mouseDownEvent.preventDefault(); // Prevent text selection
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (mouseMoveEvent: MouseEvent) => {
      if (isResizing) {
        const newWidth = mouseMoveEvent.clientX;
        if (newWidth > 160 && newWidth < 600) { // Min and Max width constraints
            setSidebarWidth(newWidth);
        }
      }
    },
    [isResizing, setSidebarWidth]
  );

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  useEffect(() => {
    let unlisten: () => void;
    let unlistenSettings: () => void;
    let unlistenFeatures: () => void;
    let unlistenCleanProgress: () => void;
    let unlistenCleanResult: () => void;
    let unlistenCleanLog: () => void;
    let unlistenDeleteResult: () => void;
    
    const setupListener = async () => {
        // @ts-ignore
        if (!window.__TAURI_INTERNALS__) return;
        unlisten = await listen('open-about', () => {
            setShowAbout(true);
        });
        unlistenSettings = await listen('open-settings', () => {
            setShowSettings(true);
        });
        unlistenFeatures = await listen('features-clean-unused-images', () => {
            setUnusedImages([]);
            setShowCleanModal(false);
            setCleanLog('');
            setCleanBarVisible(true);
            setCleanRunning(true);
            setCleanProgress({ message: 'Starting…', current: 0, total: 0 });
            invoke('start_find_unused_images_scan', { rootPath: currentPath, root_path: currentPath }).catch(() => {});
        });
        unlistenCleanProgress = await listen('clean-unused-images-progress', (event: any) => {
            const payload = event?.payload as any;
            if (!payload) return;
            const current = Number(payload.current ?? 0);
            const total = Number(payload.total ?? 0);
            const message = String(payload.message ?? '');
            const phase = String(payload.phase ?? '');
            setCleanProgress({ message, current, total });
            if (phase === 'done' || phase === 'cancelled' || phase === 'error') {
              setCleanRunning(false);
              setCleanBarVisible(true);
            } else {
              setCleanRunning(true);
              setCleanBarVisible(true);
            }
        });
        unlistenCleanResult = await listen('clean-unused-images-result', (event: any) => {
            const payload = event?.payload as any;
            const imgs = (payload?.images as string[]) || [];
            setUnusedImages(imgs);
            if (imgs.length > 0) {
              setShowCleanModal(true);
            } else {
              setCleanLog('Clean: no unused images found');
            }
        });
        unlistenCleanLog = await listen('clean-unused-images-log', (event: any) => {
            const msg = String(event?.payload ?? '');
            if (msg) setCleanLog(msg);
        });
        unlistenDeleteResult = await listen('clean-unused-images-delete-result', (event: any) => {
            const payload = event?.payload as any;
            const deleted = Number(payload?.deleted ?? 0);
            const total = Number(payload?.total ?? 0);
            setCleanLog(`Clean: deleted ${deleted} / ${total}`);
            setCleanRunning(false);
            setCleanBarVisible(true);
        });
    };

    setupListener();

    return () => {
        if (unlisten) {
            unlisten();
        }
        if (unlistenSettings) {
            unlistenSettings();
        }
        if (unlistenFeatures) {
            unlistenFeatures();
        }
        if (unlistenCleanProgress) {
            unlistenCleanProgress();
        }
        if (unlistenCleanResult) {
            unlistenCleanResult();
        }
        if (unlistenCleanLog) {
            unlistenCleanLog();
        }
        if (unlistenDeleteResult) {
            unlistenDeleteResult();
        }
    }
  }, []);

  const [isLoading, setIsLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState(false);

  useEffect(() => {
      const initWorkspace = async () => {
          console.log("Initializing workspace...");
          setPermissionError(false);
          setInitError(null);
          
          try {
              // @ts-ignore
              if (window.__TAURI_INTERNALS__) {
                  // 1. Load Config
                  await loadConfig();

                  // 2. Get Default Path (now returns ~/.xnote/doc)
                  console.log("Fetching default workspace from backend...");
                  const defaultPath = await invoke<string>('get_default_workspace');
                  console.log("Default path:", defaultPath);
                  
                  if (defaultPath) {
                      await loadFiles(defaultPath);
                  }
              } else {
                  console.warn("Not running in Tauri environment, loading Mock Data");
                  await loadFiles('/mock');
              }
          } catch (err) {
              console.error("Failed to initialize workspace", err);
              const errMsg = String(err);
              if (errMsg.includes("PERMISSION_DENIED")) {
                  setPermissionError(true);
              }
              setInitError(errMsg);
              await loadFiles('/mock');
          } finally {
              setIsLoading(false);
          }
      };
      
      initWorkspace();
  }, []);

  if (isLoading) {
      return (
          <div className="h-screen w-screen flex flex-col items-center justify-center bg-background text-text">
              <h1 className="text-4xl font-bold mb-4 tracking-tight">XNote</h1>
              <p className="text-muted mb-8 animate-pulse">Loading Workspace...</p>
          </div>
      );
  }

  // If we still don't have a path (should only happen if backend failed AND no local storage AND mock failed)
  // We can show the Dashboard but with limited functionality, or force open
  // Actually, Dashboard handles "Switch Workspace" so it's a good fallback.

  const activeFilePath = selectedFile && !(selectedFile as any).is_dir ? String((selectedFile as any).path || '') : '';

  return (
    <div className="app-container flex flex-col h-screen w-screen bg-background text-text overflow-hidden" style={{ cursor: isResizing ? 'col-resize' : 'auto' }}>
      <div className="app-main-row flex flex-row flex-1 min-h-0 overflow-hidden">
        {currentPath && (
          <>
              <div className="sidebar-container flex-shrink-0" style={{ width: sidebarWidth }}>
              <Sidebar />
              </div>
              <div 
                  className="w-1 hover:bg-accent/50 cursor-col-resize active:bg-accent transition-colors"
                  onMouseDown={startResizing}
              />
          </>
        )}
      
      {/* About Modal */}
      {showAbout && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200">
              <div className="bg-surface p-6 rounded-lg border border-border w-96 shadow-xl">
                  <h2 className="text-xl font-bold mb-4">About XNote</h2>
                  <div className="space-y-4 mb-6">
                      <div>
                          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Version</label>
                          <div className="text-sm">V1.0</div>
                      </div>
                      <div>
                          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Configuration Path</label>
                          <div className="text-sm bg-background p-2 rounded border border-border break-all font-mono text-xs">
                              {currentPath ? currentPath.replace(/\/doc$/, '/config.json') : 'Not initialized'}
                          </div>
                      </div>
                      <div>
                          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">Workspace Path</label>
                          <div className="text-sm bg-background p-2 rounded border border-border break-all font-mono text-xs">
                              {currentPath || 'Not initialized'}
                          </div>
                      </div>
                  </div>
                  <div className="flex justify-end">
                      <button 
                        onClick={() => setShowAbout(false)}
                        className="px-4 py-2 text-sm bg-accent text-white rounded hover:bg-blue-600 transition-colors"
                      >
                          Close
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Permission Error Modal */}
      {permissionError && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200">
              <div className="bg-surface p-6 rounded-lg border border-red-500/50 w-[480px] shadow-xl">
                  <h2 className="text-xl font-bold mb-4 text-red-500 flex items-center">
                      <span className="mr-2">⚠️</span> Permission Denied
                  </h2>
                  <div className="space-y-4 mb-6 text-sm">
                      <p>
                          XNote cannot write to your workspace folder (<code>~/Documents/XNote/doc</code>). 
                          This is likely due to macOS System Integrity Protection or App Sandbox restrictions.
                      </p>
                      <div className="bg-background p-3 rounded border border-border">
                          <p className="font-semibold mb-2">Please grant "Full Disk Access":</p>
                          <ol className="list-decimal list-inside space-y-1 text-muted">
                              <li>Open <strong>System Settings</strong></li>
                              <li>Go to <strong>Privacy & Security</strong> &gt; <strong>Full Disk Access</strong></li>
                              <li>Click the <strong>+</strong> button at the bottom</li>
                              <li>Select the <strong>XNote</strong> application</li>
                              <li>Toggle the switch to <strong>ON</strong></li>
                              <li>Restart XNote</li>
                          </ol>
                      </div>
                  </div>
                  <div className="flex justify-end space-x-2">
                      <button 
                        onClick={() => setPermissionError(false)}
                        className="px-4 py-2 text-sm text-muted hover:text-text hover:bg-surfaceHighlight rounded transition-colors"
                      >
                          Ignore (Read-Only)
                      </button>
                  </div>
              </div>
          </div>
      )}

      <SettingsModal
        isOpen={showSettings}
        searchShortcut={searchShortcut}
        theme={theme}
        onClose={() => setShowSettings(false)}
        onSave={(next) => {
          setTheme(next.theme);
          setSearchShortcut(next.searchShortcut);
        }}
      />

      <CleanUnusedImagesModal
        isOpen={showCleanModal}
        workspacePath={currentPath}
        unusedImages={unusedImages}
        onClose={() => setShowCleanModal(false)}
        onConfirmDelete={async () => {
          setCleanBarVisible(true);
          setCleanRunning(true);
          setCleanProgress({ message: 'Deleting…', current: 0, total: unusedImages.length });
          await invoke('start_delete_unused_images', { rootPath: currentPath, root_path: currentPath, paths: unusedImages });
          setUnusedImages([]);
        }}
      />

        <div className="main-content flex-1 flex flex-col min-h-0 h-full overflow-hidden relative">
        {initError && !currentPath && (
            <div className="bg-red-900/50 border border-red-500/50 text-red-200 p-4 m-4 rounded">
                <p className="font-bold">Initialization Error</p>
                <p className="text-sm">{initError}</p>
                <p className="text-xs mt-2 text-muted">Please try "Switch Workspace" to manually select a folder.</p>
            </div>
        )}

        {!currentPath ? (
             <Dashboard />
        ) : viewMode === 'card' && !selectedFile ? (
            <Dashboard />
        ) : (
            <NoteEditor />
        )}
        </div>
      </div>

      <div className="h-[22px] flex-shrink-0 flex items-center justify-between px-2 border-t border-border bg-surface/90 backdrop-blur-sm">
        <div className="text-[10px] text-muted truncate max-w-[70%] font-mono">{activeFilePath}</div>
        <div className="flex items-center gap-3 min-w-0">
          {cleanBarVisible && (
            <div className="flex items-center gap-2 min-w-0">
              <div className="text-[10px] text-muted truncate max-w-[260px]">{cleanLog || cleanProgress.message}</div>
              {cleanProgress.total > 0 ? (
                <div className="w-28 h-1.5 rounded bg-background/50 overflow-hidden flex-shrink-0">
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${Math.min(100, Math.max(0, (cleanProgress.current / cleanProgress.total) * 100))}%` }}
                  />
                </div>
              ) : (
                <div className="w-28 h-1.5 rounded bg-background/50 overflow-hidden flex-shrink-0">
                  <div className="h-full w-1/3 bg-accent animate-pulse" />
                </div>
              )}
              <button
                className="text-[10px] text-muted border border-border rounded px-1.5 py-0.5 hover:bg-surfaceHighlight"
                onClick={async () => {
                  if (cleanRunning) {
                    setCleanLog('Clean: cancelling…');
                    await invoke<boolean>('cancel_clean_unused_images').catch(() => false);
                  } else {
                    setCleanBarVisible(false);
                    setCleanLog('');
                    setCleanProgress({ message: '', current: 0, total: 0 });
                  }
                }}
                title={cleanRunning ? 'Cancel' : 'Dismiss'}
              >
                ×
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
