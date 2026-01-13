import React, { useEffect, useState } from 'react';
import { useAppStore, FileNode } from '../store';
import { Folder, FileText, ChevronRight, ChevronDown, Search } from 'lucide-react';
import { clsx } from 'clsx';
import { invoke } from '@tauri-apps/api/core';
import { ContextMenu } from './ContextMenu';
import { MoveToModal } from './MoveToModal';
import { SearchModal, SearchHit } from './SearchModal';
import { getDepthFromRootPath } from '../utils/path';

interface SidebarProps {}

// Sortable Item Component (Now just a regular item)
const FileItem = ({ node, level, expanded, selectedFile, onToggle, onSelect, onContextMenu, viewPath }: any) => {
    const style = {
        paddingLeft: level * 16 // Indentation handled here
    };
    
    // Check if this folder is the currently viewed path in Card Mode
    const isViewed = node.is_dir && viewPath === node.path;
    const isSelected = selectedFile?.path === node.path;

    return (
        <div style={style}>
            <div 
                className={clsx(
                    "flex items-center px-2 py-1.5 cursor-pointer text-sm select-none hover:bg-surfaceHighlight transition-colors rounded mx-2 mb-0.5",
                    (isSelected || isViewed) && "bg-surfaceHighlight text-accent"
                )}
                onClick={() => node.is_dir ? onToggle(node) : onSelect(node)}
                onContextMenu={(e) => onContextMenu(e, node)}
            >
                {node.is_dir ? (
                    <>
                        <span className="mr-1 opacity-70" onClick={(e) => { e.stopPropagation(); onToggle(node); }}>
                            {expanded[node.path] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </span>
                        <Folder size={14} className={clsx("mr-2", (isSelected || isViewed) ? "text-accent" : "text-muted")} />
                    </>
                ) : (
                    <FileText size={14} className={clsx("mr-2 ml-4", isSelected ? "text-accent" : "text-muted")} />
                )}
                <span className="flex-1 truncate font-medium opacity-90">{node.name}</span>
            </div>
        </div>
    );
};

import { InputModal } from './InputModal';
import { ConfirmModal } from './ConfirmModal';

export const Sidebar: React.FC<SidebarProps> = () => {
  const { files, selectedFile, setSelectedFile, currentPath, loadFiles, setViewMode, moveFile, deleteFile, copyFile, renameFile, setViewPath, viewPath, setSearchJump, searchShortcut, closeEditorShortcut, pushNotice } = useAppStore();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: any; type: 'root' | 'folder' | 'file' } | null>(null);
  
  // Modal State
  const [modalConfig, setModalConfig] = useState<{
      isOpen: boolean;
      title: string;
      defaultValue?: string;
      onSubmit: (value: string) => void;
  }>({ isOpen: false, title: '', onSubmit: () => {} });

  // Dedicated state for New Group to avoid closure/state issues
  const [newGroupState, setNewGroupState] = useState<{
      isOpen: boolean;
      parentPath: string | null;
  }>({ isOpen: false, parentPath: null });

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmModalConfig, setConfirmModalConfig] = useState<{
      title: string;
      message: string;
      onConfirm: () => void;
  }>({ title: '', message: '', onConfirm: () => {} });

  const [moveToModalOpen, setMoveToModalOpen] = useState(false);
  const [moveTargetNode, setMoveTargetNode] = useState<FileNode | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const formatShortcutSymbols = (shortcut: string) => {
      const parts = shortcut.split('+').filter(Boolean);
      const out: string[] = [];
      for (const p of parts) {
          const k = p.toLowerCase();
          if (k === 'cmd') out.push('⌘');
          else if (k === 'ctrl') out.push('⌃');
          else if (k === 'alt') out.push('⌥');
          else if (k === 'shift') out.push('⇧');
          else out.push(p.length === 1 ? p.toUpperCase() : p);
      }
      return out.join('');
  };

  const normalizeMainKey = (key: string) => {
      if (!key) return '';
      if (key === ' ') return 'Space';
      if (key.length === 1) return key.toUpperCase();
      if (key.startsWith('Arrow')) return key.replace('Arrow', '');
      return key[0].toUpperCase() + key.slice(1);
  };

  const parseShortcut = (s: string) => {
      const parts = s.split('+').filter(Boolean);
      const mods = new Set<string>();
      let main = '';
      for (const p of parts) {
          const k = p.toLowerCase();
          if (k === 'cmd' || k === 'ctrl' || k === 'alt' || k === 'shift') mods.add(k);
          else main = p;
      }
      return { mods, main: normalizeMainKey(main) };
  };

  useEffect(() => {
      const handler = (e: KeyboardEvent) => {
          const matchShortcut = (shortcutText: string) => {
              const { mods, main } = parseShortcut(shortcutText);
              const eventMain = normalizeMainKey(e.key);
              const keyOk = !!main && eventMain === main;
              const modsOk =
                  (!mods.has('cmd') || e.metaKey) &&
                  (!mods.has('ctrl') || e.ctrlKey) &&
                  (!mods.has('alt') || e.altKey) &&
                  (!mods.has('shift') || e.shiftKey) &&
                  (mods.has('cmd') || mods.has('ctrl') || mods.has('alt') || mods.has('shift'));
              return keyOk && modsOk;
          };

          const closeShortcut = closeEditorShortcut || 'Cmd+W';
          if (matchShortcut(closeShortcut)) {
              if (!selectedFile || (selectedFile as any).is_dir) return;
              e.preventDefault();
              const p = String((selectedFile as any).path || '');
              const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
              const parent = idx > 0 ? p.slice(0, idx) : (currentPath || '');
              setViewMode('card');
              setViewPath(parent || currentPath || null);
              setSelectedFile(null);
              return;
          }

          const shortcut = searchShortcut || 'Cmd+G';
          if (matchShortcut(shortcut)) {
              e.preventDefault();
              setSearchOpen(true);
          }
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
  }, [searchShortcut, closeEditorShortcut, selectedFile, currentPath, setSelectedFile, setViewMode, setViewPath]);

  const isLoading = !files;

  // Sync expanded state with viewPath if it changes externally (e.g. from Dashboard navigation)
  React.useEffect(() => {
      if (viewPath && viewPath !== currentPath) {
          const normalize = (p: string) => p.replace(/\/+$/, '');
          const root = normalize(currentPath);
          const target = normalize(viewPath);
          if (!target.startsWith(root)) {
              setExpanded(prev => ({ ...prev, [viewPath]: true }));
              return;
          }
          const rel = target.slice(root.length).replace(/^\/+/, '');
          if (!rel) return;
          const parts = rel.split('/').filter(Boolean);
          let acc = root;
          const updates: Record<string, boolean> = {};
          for (const part of parts) {
              acc = `${acc}/${part}`;
              updates[acc] = true;
          }
          setExpanded(prev => ({ ...prev, ...updates }));
      }
  }, [viewPath, currentPath]);

  const toggleExpand = (path: string) => {
    setExpanded(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const handleFolderClick = (node: FileNode) => {
      // Toggle expansion
      toggleExpand(node.path as string);
      
      // Set view mode to Card and set the view path
      setViewMode('card');
      setViewPath(node.path as string);
      setSelectedFile(null); // Deselect file so editor doesn't show
  };

  const handleSelect = (node: FileNode) => {
      setSelectedFile(node);
      setViewMode('tree');
  };

  const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
      e.preventDefault();
      e.stopPropagation();
      // Pass 'folder' or 'file' explicitly
      const type = node.is_dir ? 'folder' : 'file';
      setContextMenu({ x: e.clientX, y: e.clientY, target: node, type });
  };

  const handleEmptyAreaContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, target: { path: currentPath, is_dir: true }, type: 'root' });
  };

  const flattenFiles = (nodes: FileNode[], level = 0): Array<{ node: FileNode, level: number }> => {
      let result: Array<{ node: FileNode, level: number }> = [];
      nodes.forEach(node => {
          result.push({ node, level });
          if (node.is_dir && expanded[node.path as string] && node.children) {
              result = [...result, ...flattenFiles(node.children, level + 1)];
          }
      });
      return result;
  };

  const flatList = flattenFiles(files);

  const handleCreateNote = (targetPath: string) => {
      setModalConfig({
          isOpen: true,
          title: "Enter note name",
          onSubmit: async (name) => {
              try {
                  // @ts-ignore
                  if (window.__TAURI_INTERNALS__ && currentPath !== '/mock') {
                      await invoke('create_note', { dirPath: targetPath, filename: name });
                  } else {
                      if (currentPath === '/mock') {
                          const { mockFs } = await import('../utils/fs-adapter');
                          await mockFs.createFile(`${targetPath}/${name}`);
                      }
                  }
                  await loadFiles(currentPath);
                  if (targetPath !== currentPath && !expanded[targetPath]) {
                      toggleExpand(targetPath);
                  }
              } catch (err) {
                  const errMsg = String(err);
                  if (errMsg.includes("PERMISSION_DENIED")) {
                      alert("Permission Denied: Cannot create note. Please check your system settings.");
                  } else {
                      alert(errMsg);
                  }
              }
          }
      });
  };

  const openNewGroupModal = (parentPath: string) => {
      const depth = getDepthFromRootPath(currentPath, String(parentPath));
      if (depth !== null && depth >= 2) {
          pushNotice("二级目录下不允许新建文件夹", "info");
          return;
      }
      setNewGroupState({ isOpen: true, parentPath });
  };

  const onNewGroupSubmit = async (name: string) => {
      const parentPath = newGroupState.parentPath;
      if (!parentPath) {
          return;
      }

      const depth = getDepthFromRootPath(currentPath, String(parentPath));
      if (depth !== null && depth >= 2) {
          pushNotice("二级目录下不允许新建文件夹", "info");
          return;
      }

      try {
          // @ts-ignore
          if (window.__TAURI_INTERNALS__ && currentPath !== '/mock') {
              await invoke('create_folder', { parentPath, name });
          } else {
              if (currentPath === '/mock') {
                  const { mockFs } = await import('../utils/fs-adapter');
                  await mockFs.createDir(`${parentPath}/${name}`);
              }
          }
          await loadFiles(currentPath);
          if (!expanded[parentPath]) toggleExpand(parentPath);
      } catch(e) { 
          alert("Error creating group: " + String(e)); 
      }
  };

  const handleDelete = () => {
      if (!contextMenu) return;
      const { target } = contextMenu;
      
      const isDir = target.is_dir;
      const title = isDir ? "Delete Folder?" : "Delete Note?";
      const message = isDir 
          ? `Are you sure you want to delete folder "${target.name}" and all its contents?` 
          : `Delete "${target.name}"?`;

      setConfirmModalConfig({
          title,
          message,
          onConfirm: async () => {
              try {
                  await deleteFile(target.path);
              } catch (e) {
                  alert("Failed to delete");
              }
          }
      });
      setConfirmModalOpen(true);
  };

  const handleDuplicate = async () => {
      if (!contextMenu) return;
      const { target } = contextMenu;
      if (target.is_dir) return;

      console.log('Duplicating:', target);

      const nameParts = target.name.split('.');
      let ext = '';
      let base = '';
      
      if (nameParts.length > 1) {
          ext = nameParts.pop() || '';
          base = nameParts.join('.');
      } else {
          base = target.name as string;
      }

      const newName = ext ? `${base}_copy.${ext}` : `${base}_copy`;
      const parentPath = target.path.substring(0, target.path.lastIndexOf('/'));
      const newPath = `${parentPath}/${newName}`;

      console.log('New path:', newPath);

      try {
          await copyFile(target.path, newPath);
          console.log('Duplicate success');
      } catch (e) {
          console.error('Duplicate failed:', e);
          alert(`Failed to duplicate: ${e}`);
      }
  };

  const handleMoveTo = (targetPath: string) => {
      if (!moveTargetNode) return;
      const fileName = moveTargetNode.name;
      const newPath = `${targetPath}/${fileName}`;
      
      console.log(`Moving ${moveTargetNode.path} to ${newPath}`);
      
      moveFile(moveTargetNode.path as string, newPath)
          .then(() => {
              setMoveToModalOpen(false);
              setMoveTargetNode(null);
          })
          .catch(err => alert(`Failed to move: ${err}`));
  };

  const handleRename = () => {
      if (!contextMenu) return;
      const { target } = contextMenu;
      
      setModalConfig({
          isOpen: true,
          title: "Rename",
          defaultValue: target.name,
          onSubmit: async (newName) => {
              // Ensure we have a valid name
              const trimmedName = newName.trim();
              if (!trimmedName || trimmedName === target.name) return;
              
              // Handle extension logic for files
              let finalName = trimmedName;
              if (!target.is_dir) {
                  if (!finalName.endsWith('.md')) {
                      finalName += '.md';
                  }
              }

              try {
                  await renameFile(target.path, finalName);
                  // Explicitly reload files to ensure UI updates, though store action does it too
                  // This is a safety measure against race conditions or partial updates
                  await loadFiles(currentPath);
              } catch (e) {
                  console.error("Rename failed:", e);
                  alert(`Failed to rename: ${e}`);
              }
          }
      });
      setModalConfig(prev => ({ ...prev, isOpen: true }));
  };

  const openMoveToModal = () => {
      if (contextMenu) {
          // Find the full node object from flatList or files
          // contextMenu.target only has minimal info
          // Actually, we passed the full node in handleContextMenu, but let's be safe
          // Wait, in handleContextMenu we did setContextMenu({ ..., target: node })
          // So target IS the node.
          
          setMoveTargetNode(contextMenu.target);
          setMoveToModalOpen(true);
          setContextMenu(null);
      }
  };

  return (
    <div className="w-full h-full bg-sidebar flex flex-col select-none">
      <div className="p-4 border-b border-border flex justify-between items-center bg-sidebar/50 backdrop-blur-sm sticky top-0 z-10">
        <h2 
            className="font-bold text-lg tracking-tight flex items-center cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => {
                setSelectedFile(null);
                setViewMode('card');
                setViewPath(null);
            }}
        >
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-accent to-blue-400">XNote</span>
        </h2>
      </div>
      
      <div 
        className="flex-1 overflow-y-auto py-2 group custom-scrollbar"
        onContextMenu={handleEmptyAreaContextMenu}
      >
        {isLoading ? (
            <div className="p-4 space-y-3">
                {[1,2,3,4,5].map(i => (
                    <div key={i} className="h-4 bg-surfaceHighlight rounded animate-pulse w-3/4"></div>
                ))}
            </div>
        ) : (
            <>
                {flatList.map(({ node, level }) => (
                    <FileItem 
                        key={node.path as string}
                        node={node}
                        level={level}
                        expanded={expanded}
                        selectedFile={selectedFile}
                        onToggle={handleFolderClick}
                        onSelect={handleSelect}
                        onContextMenu={handleContextMenu}
                        viewPath={viewPath}
                    />
                ))}
            </>
        )}
      </div>

      <div className="p-3 border-t border-border bg-sidebar/50 backdrop-blur-sm sticky bottom-0 z-10 flex justify-start">
        <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="h-9 w-44 px-3 rounded-lg border border-border bg-background/30 hover:bg-surfaceHighlight transition-colors flex items-center gap-2 text-muted"
            title={`Search (${searchShortcut || 'Cmd+G'})`}
        >
            <Search size={14} className="opacity-80" />
            <span className="text-sm flex-1 text-left opacity-90">Search</span>
            <span className="text-xs border border-border rounded px-2 py-0.5 opacity-80">
              {formatShortcutSymbols(searchShortcut || 'Cmd+G')}
            </span>
        </button>
      </div>

      {/* Context Menu */}
      {contextMenu && (
          <ContextMenu 
              x={contextMenu.x} 
              y={contextMenu.y} 
              target={{ path: contextMenu.target.path as string, isDir: contextMenu.type === 'root' ? true : contextMenu.target.is_dir }}
              type={contextMenu.type}
              onClose={() => setContextMenu(null)}
              onDelete={contextMenu.type === 'root' ? () => {} : handleDelete}
              onNewGroup={
                  contextMenu.type === 'root'
                    ? () => openNewGroupModal(currentPath)
                    : contextMenu.type === 'folder'
                      ? () => openNewGroupModal(contextMenu.target.path)
                      : undefined
              }
              onDuplicate={contextMenu.type === 'file' ? handleDuplicate : undefined}
              onNewNote={(contextMenu.type === 'root' || contextMenu.type === 'folder') 
                  ? () => handleCreateNote(contextMenu.type === 'root' ? currentPath : contextMenu.target.path) 
                  : undefined
              }
              onMoveTo={contextMenu.type !== 'root' ? openMoveToModal : undefined}
              onRename={contextMenu.type !== 'root' ? handleRename : undefined}
          />
      )}

      {/* Footer / Settings - Removed as moved to System Menu */}
      
      {/* Dedicated InputModal for New Group */}
      <InputModal
          isOpen={newGroupState.isOpen}
          title="Enter group name"
          onClose={() => setNewGroupState(prev => ({ ...prev, isOpen: false }))}
          onSubmit={onNewGroupSubmit}
      />

      <InputModal
          isOpen={modalConfig.isOpen}
          title={modalConfig.title}
          defaultValue={modalConfig.defaultValue}
          onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
          onSubmit={modalConfig.onSubmit}
      />

      <ConfirmModal
          isOpen={confirmModalOpen}
          title={confirmModalConfig.title}
          message={confirmModalConfig.message}
          onClose={() => setConfirmModalOpen(false)}
          onConfirm={confirmModalConfig.onConfirm}
      />

      <MoveToModal
          isOpen={moveToModalOpen}
          files={files}
          currentPath={currentPath}
          sourceNode={moveTargetNode}
          onClose={() => setMoveToModalOpen(false)}
          onMove={handleMoveTo}
      />

      <SearchModal
          isOpen={searchOpen}
          workspacePath={currentPath}
          onClose={() => setSearchOpen(false)}
          onJump={(hit: SearchHit) => {
              setSearchOpen(false);
              setViewMode('tree');
              setViewPath(null);
              setSearchJump({ path: hit.path, line: hit.line });
              setSelectedFile({ name: hit.name, path: hit.path, is_dir: false } as any);
          }}
      />
    </div>
  );
};
