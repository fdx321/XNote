import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useAppStore } from '../store';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Plus, X } from 'lucide-react';

interface TerminalSession {
    id: string;
    title: string;
}

export function TerminalPanel({ isOpen }: { isOpen: boolean }) {
    const { terminalHeight, currentPath, selectedFile, setTerminalHeight } = useAppStore();
    const [sessions, setSessions] = useState<TerminalSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const terminalRefs = useRef<Record<string, { term: Terminal; fitAddon: FitAddon; decoder: TextDecoder; container: HTMLDivElement | null }>>({});
    const containerRef = useRef<HTMLDivElement>(null);
    const [isResizing, setIsResizing] = useState(false);
    const hasAutoCreatedSessionRef = useRef(false);

    const resolveCwd = useCallback(() => {
        if (!selectedFile || (selectedFile as any).is_dir) return currentPath;
        const filePath = String((selectedFile as any).path || '');
        const lastSlash = filePath.lastIndexOf('/');
        if (lastSlash <= 0) return currentPath;
        return filePath.slice(0, lastSlash) || currentPath;
    }, [currentPath, selectedFile]);

    // Create a new terminal session
    const createSession = useCallback(async () => {
        const id = crypto.randomUUID();
        
        try {
            await invoke('create_terminal', { id, cwd: resolveCwd() });
            setSessions(prev => [...prev, { id, title: `Local (${prev.length + 1})` }]);
            setActiveSessionId(id);
        } catch (err) {
            console.error("Failed to create terminal:", err);
        }
    }, [resolveCwd]);

    // Initialize the first session if none exist
    useEffect(() => {
        if (hasAutoCreatedSessionRef.current) return;
        if (!isOpen) return;
        if (sessions.length !== 0) return;
        hasAutoCreatedSessionRef.current = true;
        createSession();
    }, [createSession, isOpen, sessions.length]);

    // Handle session switching and rendering
    useEffect(() => {
        if (!isOpen) return;
        if (!activeSessionId) return;

        const session = sessions.find(s => s.id === activeSessionId);
        if (!session) return;

        // We need to wait for the DOM element to be ready
        requestAnimationFrame(() => {
            const container = document.getElementById(`terminal-container-${activeSessionId}`);
            if (!container) return;

            if (!terminalRefs.current[activeSessionId]) {
                // Initialize xterm
                const term = new Terminal({
                    fontFamily: 'Menlo, Monaco, "SF Mono", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Noto Sans Mono CJK SC", "Microsoft YaHei", monospace',
                    fontSize: 12,
                    theme: {
                        background: '#18181b', // zinc-900
                        foreground: '#f4f4f5', // zinc-100
                        cursor: '#a1a1aa',
                        selectionBackground: '#3f3f46',
                    },
                    cursorBlink: true,
                });

                const fitAddon = new FitAddon();
                term.loadAddon(fitAddon);
                term.loadAddon(new WebLinksAddon());

                term.open(container);
                fitAddon.fit();

                term.onData((data) => {
                    invoke('write_to_terminal', { id: activeSessionId, data });
                });
                
                // Initial resize
                const { rows, cols } = fitAddon.proposeDimensions() || { rows: 24, cols: 80 };
                invoke('resize_terminal', { id: activeSessionId, rows, cols });

                terminalRefs.current[activeSessionId] = { term, fitAddon, decoder: new TextDecoder('utf-8'), container: container as HTMLDivElement };

                // Listen for output
                listen(`terminal-output:${activeSessionId}`, (event) => {
                    const payload: any = event.payload as any;
                    if (typeof payload === 'string') {
                        term.write(payload);
                        return;
                    }
                    if (payload && payload.encoding === 'base64' && typeof payload.data === 'string') {
                        const binStr = atob(payload.data);
                        const bytes = new Uint8Array(binStr.length);
                        for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
                        const ref = terminalRefs.current[activeSessionId];
                        const text = ref.decoder.decode(bytes, { stream: true });
                        if (text) term.write(text);
                    }
                });
            } else {
                // Re-fit on switch
                 terminalRefs.current[activeSessionId].fitAddon.fit();
            }
        });
    }, [activeSessionId, sessions]);

    // Handle closing sessions
    const closeSession = useCallback(async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        
        // Cleanup backend
        await invoke('close_terminal', { id });

        // Cleanup frontend refs
        if (terminalRefs.current[id]) {
            terminalRefs.current[id].term.dispose();
            delete terminalRefs.current[id];
        }

        setSessions(prev => {
            const newSessions = prev.filter(s => s.id !== id);
            if (activeSessionId === id) {
                // Switch to another session if active one is closed
                if (newSessions.length > 0) {
                    setActiveSessionId(newSessions[newSessions.length - 1].id);
                } else {
                    setActiveSessionId(null);
                    // Optionally create a new one automatically
                    // createSession();
                }
            }
            return newSessions;
        });
    }, [activeSessionId]);

    useEffect(() => {
        const handler = () => {
            if (!activeSessionId) return;
            closeSession({ stopPropagation: () => {} } as any, activeSessionId);
        };
        window.addEventListener('xnote-terminal-close-active-session', handler as EventListener);
        return () => window.removeEventListener('xnote-terminal-close-active-session', handler as EventListener);
    }, [activeSessionId, closeSession]);

    // Resize Observer
    useEffect(() => {
        if (!isOpen) return;
        if (!containerRef.current) return;
        const observer = new ResizeObserver(() => {
             if (activeSessionId && terminalRefs.current[activeSessionId]) {
                 const { fitAddon } = terminalRefs.current[activeSessionId];
                 fitAddon.fit();
                 const dims = fitAddon.proposeDimensions();
                 if (dims) {
                     invoke('resize_terminal', { id: activeSessionId, rows: dims.rows, cols: dims.cols });
                 }
             }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [activeSessionId, isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        if (!activeSessionId) return;
        const ref = terminalRefs.current[activeSessionId];
        if (!ref) return;
        requestAnimationFrame(() => {
            ref.fitAddon.fit();
            const dims = ref.fitAddon.proposeDimensions();
            if (dims) {
                invoke('resize_terminal', { id: activeSessionId, rows: dims.rows, cols: dims.cols });
            }
        });
    }, [activeSessionId, isOpen]);


    // Resizing Panel Logic
    const startResizing = useCallback((e: React.MouseEvent) => {
        setIsResizing(true);
        e.preventDefault();
    }, []);

    useEffect(() => {
        const stopResizing = () => setIsResizing(false);
        const resize = (e: MouseEvent) => {
            if (isResizing) {
                const newHeight = window.innerHeight - e.clientY;
                if (newHeight > 100 && newHeight < window.innerHeight - 100) {
                    setTerminalHeight(newHeight);
                }
            }
        };

        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResizing);
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [isResizing, setTerminalHeight]);


    return (
        <div 
            className="flex flex-col border-t border-border bg-background"
            style={{
                height: isOpen ? terminalHeight : 0,
                overflow: 'hidden',
                pointerEvents: isOpen ? 'auto' : 'none'
            }}
            aria-hidden={!isOpen}
            id="xnote-terminal-panel"
        >
            {/* Resize Handle */}
            <div 
                className="h-1 cursor-row-resize hover:bg-accent/50 active:bg-accent transition-colors w-full"
                onMouseDown={startResizing}
            />

            {/* Tabs Header */}
            <div className="flex items-center h-6 bg-surface border-b border-border px-2 gap-1 overflow-x-auto">
                <span className="text-[11px] font-semibold text-muted mr-2">Terminal</span>
                {sessions.map(session => (
                    <div 
                        key={session.id}
                        className={`
                            group flex items-center gap-2 px-2 py-0.5 text-[11px] rounded-t cursor-pointer border-t border-l border-r border-transparent
                            ${activeSessionId === session.id 
                                ? 'bg-background border-border text-text' 
                                : 'text-muted hover:bg-surfaceHighlight hover:text-text'}
                        `}
                        onClick={() => setActiveSessionId(session.id)}
                    >
                        <span>{session.title}</span>
                        <button 
                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-accent/20"
                            onClick={(e) => closeSession(e, session.id)}
                        >
                            <X size={11} />
                        </button>
                    </div>
                ))}
                <button 
                    className="p-1 hover:bg-surfaceHighlight rounded text-muted hover:text-text ml-1"
                    onClick={createSession}
                    title="New Terminal"
                >
                    <Plus size={12} />
                </button>
            </div>

            {/* Terminal Content */}
            <div className="flex-1 min-h-0 bg-[#18181b] p-1" ref={containerRef}>
                {sessions.map(session => (
                    <div 
                        key={session.id}
                        id={`terminal-container-${session.id}`}
                        className={`h-full w-full ${activeSessionId === session.id ? 'block' : 'hidden'}`}
                    />
                ))}
                {sessions.length === 0 && (
                    <div className="h-full flex items-center justify-center text-muted text-sm">
                        <button onClick={createSession} className="hover:text-text underline">
                            Open New Terminal
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
