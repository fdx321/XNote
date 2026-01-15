import React, { useEffect, useState, useRef, useCallback, useMemo, useDeferredValue } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { useAppStore } from '../store';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { Columns, Maximize, Eye, Table, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import 'highlight.js/styles/github-dark.css'; // or atom-one-dark
// @ts-ignore
import plantumlEncoder from 'plantuml-encoder';
import { MermaidDiagram } from './MermaidDiagram';
import { prepareMarkdownForPreview } from '../utils/markdownExtensions';
import { openExternalUrl } from '../utils/openExternalUrl';

const getCodeText = (children: any) => {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.join('');
  return String(children);
};

const hashString = (input: string) => {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
};

export const NoteEditor: React.FC = () => {
  const { selectedFile, editorMode, setEditorMode, currentPath, searchJump, setSearchJump, setLLMPanelOpen, llmPanelOpen, setChatInput } =
    useAppStore();
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const editorRef = useRef<any>(null);
  const [editorInstance, setEditorInstance] = useState<any>(null);
  const deferredContent = useDeferredValue(content);
  const mermaidBlockIndexRef = useRef(0);

  const isTauri = (window as any).__TAURI_INTERNALS__;
  const selectedFileRef = useRef<typeof selectedFile | null>(null);
  const currentPathRef = useRef<string>('');
  const [selectionWidget, setSelectionWidget] = useState<{ x: number; y: number; text: string } | null>(null);

  useEffect(() => {
      if (!editorInstance) return;
      const disposable = editorInstance.onDidChangeCursorSelection(() => {
          const selection = editorInstance.getSelection();
          if (selection && !selection.isEmpty()) {
              const model = editorInstance.getModel();
              const text = model?.getValueInRange(selection) || '';
              if (text.trim()) {
                  const endPos = selection.getEndPosition();
                  const coords = editorInstance.getScrolledVisiblePosition(endPos);
                  const domNode = editorInstance.getDomNode();
                  if (coords && domNode) {
                      const rect = domNode.getBoundingClientRect();
                      setSelectionWidget({
                          x: rect.left + coords.left,
                          y: rect.top + coords.top,
                          text
                      });
                      return;
                  }
              }
          }
          setSelectionWidget(null);
      });
      return () => disposable.dispose();
  }, [editorInstance]);

  const handleAddToChat = () => {
      if (!selectionWidget) return;
      setChatInput(selectionWidget.text);
      setLLMPanelOpen(true);
      setSelectionWidget(null);
  };

  useEffect(() => {
      selectedFileRef.current = selectedFile ?? null;
      currentPathRef.current = currentPath || '';
  }, [selectedFile, currentPath]);

  useEffect(() => {
      if (!editorInstance) return;

      const handler = (event: ClipboardEvent) => {
          const file = selectedFileRef.current;
          const workspacePath = currentPathRef.current;
          if (!file || !file.name.endsWith('.md')) return;
          if (!editorInstance.hasTextFocus?.()) return;

          const items = event.clipboardData?.items;
          if (!items) return;

          for (const item of items) {
              if (item.type && item.type.indexOf('image') !== -1) {
                  event.preventDefault();
                  const blob = item.getAsFile();
                  if (!blob) return;

                  const reader = new FileReader();
                  reader.onload = async (e) => {
                      const base64 = e.target?.result as string;
                      try {
                          const { absDir, relDir } = getMarkdownAssetDir(workspacePath, file.path as string);
                          const isMock = workspacePath.startsWith('/mock') || !isTauri;

                          let filename = '';
                          if (isMock) {
                              const { mockFs } = await import('../utils/fs-adapter');
                              filename = await mockFs.saveImage(base64, absDir);
                          } else {
                              filename = await invoke<string>('save_image', {
                                  img_data_base64: base64,
                                  save_dir: absDir,
                                  imgDataBase64: base64,
                                  saveDir: absDir
                              });
                          }

                          const insertion = `![Image](${relDir}/${filename})`;
                          const selection = editorInstance.getSelection();
                          if (selection) {
                              const op = { range: selection, text: insertion, forceMoveMarkers: true };
                              editorInstance.executeEdits("paste-image", [op]);
                          }
                      } catch (err) {
                          console.error("Failed to save image", err);
                          alert("Failed to save image: " + err);
                      }
                  };
                  reader.readAsDataURL(blob);
                  return;
              }
          }
      };

      document.addEventListener('paste', handler, true);
      return () => document.removeEventListener('paste', handler, true);
  }, [editorInstance, isTauri]);

  const getPathParts = (p: string) => p.split(/[/\\]+/).filter(Boolean);

  const getDirname = (p: string) => {
      const parts = getPathParts(p);
      if (p.startsWith('/')) {
          return '/' + parts.slice(0, -1).join('/');
      }
      return parts.slice(0, -1).join('/');
  };

  const getBasename = (p: string) => {
      const parts = getPathParts(p);
      return parts[parts.length - 1] || '';
  };

  const normalizeJoin = (baseDir: string, rel: string) => {
      const baseIsAbs = baseDir.startsWith('/');
      const baseParts = getPathParts(baseDir);
      const relParts = rel.split(/[/\\]+/).filter(Boolean);
      const out: string[] = [...baseParts];
      for (const part of relParts) {
          if (part === '.' || part === '') continue;
          if (part === '..') {
              out.pop();
              continue;
          }
          out.push(part);
      }
      return (baseIsAbs ? '/' : '') + out.join('/');
  };

  const getMarkdownAssetDir = (workspacePath: string, filePath: string) => {
      const base = getBasename(filePath);
      const stem = base.replace(/\.[^/.]+$/, '') || 'note';
      const relDir = `/.xnote_assets/${stem}`;
      const absDir = `${workspacePath}/.xnote_assets/${stem}`;
      return { absDir, relDir };
  };

  const getMimeByPath = (p: string) => {
      const lower = p.toLowerCase();
      if (lower.endsWith('.png')) return 'image/png';
      if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
      if (lower.endsWith('.gif')) return 'image/gif';
      if (lower.endsWith('.webp')) return 'image/webp';
      if (lower.endsWith('.bmp')) return 'image/bmp';
      if (lower.endsWith('.svg')) return 'image/svg+xml';
      return 'application/octet-stream';
  };

  const MarkdownImage: React.FC<any> = (props) => {
      const rawSrc = props?.src as string | undefined;
      const [dataUrl, setDataUrl] = useState<string | null>(null);
      const [fallbackTried, setFallbackTried] = useState(false);

      const srcForPath = useMemo(() => {
          if (!rawSrc) return rawSrc;
          if (/^(https?:|data:|blob:|tauri:|asset:)/i.test(rawSrc)) return rawSrc;
          try {
              return decodeURI(rawSrc);
          } catch {
              return rawSrc;
          }
      }, [rawSrc]);

      const absPath = useMemo(() => {
          if (!srcForPath || !selectedFile) return null;
          if (/^(https?:|data:|blob:|tauri:|asset:)/i.test(srcForPath)) return null;
          const workspacePath = currentPathRef.current;
          if (srcForPath.startsWith('/.xnote_assets/')) {
              return workspacePath ? `${workspacePath}${srcForPath}` : null;
          }
          const baseDir = getDirname(selectedFile.path as string);
          const normalizedSrc = srcForPath.replace(/^\.\/+/, '');
          return srcForPath.startsWith('/') ? srcForPath : normalizeJoin(baseDir, normalizedSrc);
      }, [srcForPath, selectedFile]);

      const displaySrc = useMemo(() => {
          if (!rawSrc) return undefined;
          if (dataUrl) return dataUrl;
          if (!isTauri) return rawSrc;
          if (/^(https?:|data:|blob:|tauri:|asset:)/i.test(rawSrc)) return rawSrc;
          if (!absPath) return rawSrc;
          return encodeURI(convertFileSrc(absPath));
      }, [rawSrc, dataUrl, absPath]);

      const onError = async () => {
          if (!isTauri) return;
          if (!absPath) return;
          if (fallbackTried) return;
          setFallbackTried(true);
          try {
              const b64 = await invoke<string>('read_file_base64', { path: absPath });
              const mime = getMimeByPath(absPath);
              setDataUrl(`data:${mime};base64,${b64}`);
          } catch (e) {
              setDataUrl(null);
          }
      };

      if (!displaySrc) {
          return <img {...props} className="rounded-lg shadow-md max-w-full" />;
      }
      return <img {...props} src={displaySrc} onError={onError} className="rounded-lg shadow-md max-w-full" />;
  };

  const markdownComponents = useMemo(() => {
    const fileKey = selectedFile?.path ? String(selectedFile.path) : 'unknown';
    return {
      img: MarkdownImage,
      a({ href, children, ...props }: any) {
        const url = typeof href === 'string' ? href : '';
        return (
          <a
            {...props}
            href={url}
            onClick={async (e) => {
              if (!url) return;
              if (url.startsWith('#')) return;
              e.preventDefault();
              e.stopPropagation();
              try {
                await openExternalUrl(url);
              } catch {
              }
            }}
            className={clsx('text-accent underline underline-offset-2', props?.className)}
          >
            {children}
          </a>
        );
      },
      code({ node, inline, className, children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || '');
        const lang = match ? match[1] : '';
        const codeText = getCodeText(children).replace(/\n$/, '');

        if (!inline && lang === 'mermaid') {
          const idx = mermaidBlockIndexRef.current++;
          const diagramKey = `${fileKey}:mermaid:${idx}:${hashString(codeText)}`;
          return <MermaidDiagram code={codeText} diagramKey={diagramKey} />;
        }

        if (lang === 'plantuml') {
          const encoded = plantumlEncoder.encode(codeText);
          const url = `https://www.plantuml.com/plantuml/svg/${encoded}`;
          return <img src={url} alt="PlantUML Diagram" className="max-w-full rounded bg-white p-2" />;
        }

        return match ? (
          <code className={className} {...props}>
            {children}
          </code>
        ) : (
          <code className={className} {...props}>
            {children}
          </code>
        );
      }
    };
  }, [selectedFile?.path]);
  
  // Resize Logic
  const [editorPercentage, setEditorPercentage] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const newPercentage = ((e.clientX - rect.left) / rect.width) * 100;
        if (newPercentage > 20 && newPercentage < 80) {
            setEditorPercentage(newPercentage);
        }
    }
  }, [isResizing]);

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
        window.removeEventListener('mousemove', resize);
        window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

  useEffect(() => {
    if (selectedFile) {
      // Check for mock mode or if Tauri is not available
      const isMock = selectedFile.path.toString().startsWith('/mock') || !(window as any).__TAURI_INTERNALS__;

      if (isMock) {
          import('../utils/fs-adapter').then(({ mockFs }) => {
              mockFs.readFile(selectedFile.path as string).then(text => setContent(text));
          });
          return;
      }

      // Load file content via Tauri
      invoke<string>('read_file', { path: selectedFile.path })
        .then(text => setContent(text))
        .catch(err => console.error(err));
    }
  }, [selectedFile]);

  useEffect(() => {
      if (!selectedFile || !searchJump) return;
      if ((selectedFile.path as any) !== searchJump.path) return;
      if (!editorRef.current) return;

      try {
          editorRef.current.revealLineInCenter(searchJump.line);
          editorRef.current.setPosition({ lineNumber: searchJump.line, column: 1 });
          editorRef.current.focus();
      } finally {
          setSearchJump(null);
      }
  }, [selectedFile, searchJump, setSearchJump]);

  // Debounced Save
  useEffect(() => {
      if (!selectedFile) return;
      
      const timeoutId = setTimeout(async () => {
          setIsSaving(true);
          try {
              const isMock = selectedFile.path.toString().startsWith('/mock') || !(window as any).__TAURI_INTERNALS__;

              if (isMock) {
                  const { mockFs } = await import('../utils/fs-adapter');
                  await mockFs.writeFile(selectedFile.path as string, content);
              } else {
                  await invoke('save_file', { path: selectedFile.path, content });
              }
          } catch (err) {
              console.error("Save failed", err);
          } finally {
              setIsSaving(false);
          }
      }, 1000); // 1s debounce

      return () => clearTimeout(timeoutId);
  }, [content, selectedFile]);

  const handleEditorDidMount: OnMount = (editor, _monaco) => {
    editorRef.current = editor;
    setEditorInstance(editor);
  };

  const insertTable = () => {
      const table = `
| Header 1 | Header 2 |
| -------- | -------- |
| Cell 1   | Cell 2   |
| Cell 3   | Cell 4   |
`;
      if (editorRef.current) {
          const selection = editorRef.current.getSelection();
          const op = { range: selection, text: table, forceMoveMarkers: true };
          editorRef.current.executeEdits("my-source", [op]);
      }
  };

  const insertSequenceDiagram = () => {
      const diagram = `
@startuml
Alice -> Bob: Hello
Bob --> Alice: Hi!
@enduml
`;
      if (editorRef.current) {
          const selection = editorRef.current.getSelection();
          const op = { range: selection, text: diagram, forceMoveMarkers: true };
          editorRef.current.executeEdits("my-source", [op]);
      }
  };

  const insertClassDiagram = () => {
      const diagram = `
@startuml
class Duck {
  +swim()
  +quack()
}
@enduml
`;
      if (editorRef.current) {
          const selection = editorRef.current.getSelection();
          const op = { range: selection, text: diagram, forceMoveMarkers: true };
          editorRef.current.executeEdits("my-source", [op]);
      }
  };

  if (!selectedFile) {
      return <div className="flex-1 flex items-center justify-center text-muted">Select a note to edit</div>;
  }

  const isUml = selectedFile.name.endsWith('.uml') || selectedFile.name.endsWith('.puml');
  mermaidBlockIndexRef.current = 0;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="h-10 border-b border-border flex items-center px-4 justify-between bg-surface">
          <div className="flex items-center space-x-2 text-sm text-muted">
              <span className="font-medium text-text">{selectedFile.name}</span>
              {isSaving && <span className="text-xs animate-pulse">Saving...</span>}
          </div>
          <div className="flex items-center space-x-1">
              {!isUml ? (
                  <button
                      onClick={insertTable}
                      className="p-1.5 rounded hover:bg-surfaceHighlight text-muted hover:text-text mr-2"
                      title="Insert Table"
                  >
                      <Table size={16} />
                  </button>
              ) : (
                  <>
                      <button
                          onClick={insertSequenceDiagram}
                          className="px-2 py-1 rounded hover:bg-surfaceHighlight text-muted hover:text-text mr-2 text-xs border border-border"
                          title="Insert Sequence Diagram"
                      >
                          Sequence
                      </button>
                      <button
                          onClick={insertClassDiagram}
                          className="px-2 py-1 rounded hover:bg-surfaceHighlight text-muted hover:text-text mr-2 text-xs border border-border"
                          title="Insert Class Diagram"
                      >
                          Class
                      </button>
                  </>
              )}
              <button 
                onClick={() => setEditorMode('edit')}
                className={clsx("p-1.5 rounded hover:bg-surfaceHighlight", editorMode === 'edit' && "bg-surfaceHighlight text-accent")}
                title="Edit Mode"
              >
                  <Maximize size={16} />
              </button>
              <button 
                onClick={() => setEditorMode('split')}
                className={clsx("p-1.5 rounded hover:bg-surfaceHighlight", editorMode === 'split' && "bg-surfaceHighlight text-accent")}
                title="Split Mode"
              >
                  <Columns size={16} />
              </button>
              <button 
                onClick={() => setEditorMode('preview')}
                className={clsx("p-1.5 rounded hover:bg-surfaceHighlight", editorMode === 'preview' && "bg-surfaceHighlight text-accent")}
                title="Preview Mode"
              >
                  <Eye size={16} />
              </button>
              <button 
                onClick={() => setLLMPanelOpen(!llmPanelOpen)}
                className={clsx("p-1.5 rounded hover:bg-surfaceHighlight", llmPanelOpen && "bg-surfaceHighlight text-accent")}
                title="AI Chat"
              >
                  <Sparkles size={16} />
              </button>
          </div>
      </div>

      {/* Content Area */}
      <div 
        className="flex-1 flex overflow-hidden"
        ref={containerRef}
        style={{ cursor: isResizing ? 'col-resize' : 'auto' }}
      >
          {/* Monaco Editor */}
          {editorMode !== 'preview' && (
            <div 
                className={clsx("h-full", !isResizing && "transition-all duration-300", editorMode === 'split' ? "border-r border-border" : "w-full")}
                style={{ width: editorMode === 'split' ? `${editorPercentage}%` : '100%' }}
            >
                <Editor
                    height="100%"
                    theme="vs-dark"
                    defaultLanguage="markdown"
                    value={content}
                    onChange={(val) => setContent(val || '')}
                    onMount={handleEditorDidMount}
                    options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        wordWrap: 'on',
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        padding: { top: 16, bottom: 16 }
                    }}
                />
            </div>
          )}

          {/* Resize Handle */}
          {editorMode === 'split' && (
              <div 
                  className="w-1 hover:bg-accent active:bg-accent cursor-col-resize transition-colors z-10 flex-shrink-0"
                  onMouseDown={startResizing}
              />
          )}

          {/* Preview */}
          {(editorMode === 'split' || editorMode === 'preview') && (
              <div className="flex-1 h-full overflow-y-auto p-8 prose prose-invert max-w-none bg-background">
                  {/* Special handling for PlantUML files */}
                  {(selectedFile?.name.endsWith('.uml') || selectedFile?.name.endsWith('.puml')) ? (
                      <div>
                        <img 
                            src={`https://www.plantuml.com/plantuml/svg/${plantumlEncoder.encode(content)}`} 
                            alt="PlantUML Diagram" 
                            className="max-w-full rounded bg-white p-2"
                        />
                      </div>
                  ) : (
                    <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeRaw, rehypeHighlight]}
                        components={markdownComponents}
                    >
                        {prepareMarkdownForPreview(deferredContent)}
                    </ReactMarkdown>
                  )}
              </div>
          )}
      </div>

      {selectionWidget && (
          <div 
              style={{ 
                  position: 'fixed', 
                  top: selectionWidget.y - 40, 
                  left: selectionWidget.x, 
                  zIndex: 50 
              }}
              className="bg-surface border border-border shadow-lg rounded-lg p-1 animate-in fade-in zoom-in duration-200"
          >
              <button 
                  onClick={handleAddToChat}
                  className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-text hover:bg-surfaceHighlight rounded"
              >
                  <Sparkles size={12} className="text-accent" />
                  Add to Chat
              </button>
          </div>
      )}
    </div>
  );
};
