import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Copy } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

type MermaidDiagramProps = {
  code: string;
  diagramKey?: string;
};

type MermaidRenderResult = {
  svg: string;
  bindFunctions?: (element: Element) => void;
};

let mermaidInitialized = false;
const svgCache = new Map<string, { svg: string; ts: number }>();

const saveSvgCache = (key: string, svg: string) => {
  svgCache.set(key, { svg, ts: Date.now() });
  if (svgCache.size <= 40) return;
  const entries = Array.from(svgCache.entries()).sort((a, b) => a[1].ts - b[1].ts);
  for (let i = 0; i < entries.length - 40; i++) {
    svgCache.delete(entries[i][0]);
  }
};

export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ code, diagramKey }) => {
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2)}`);
  const [svg, setSvg] = useState<string>(() => (diagramKey ? svgCache.get(diagramKey)?.svg ?? '' : ''));
  const [lastError, setLastError] = useState<string | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const hasRenderedRef = useRef(false);
  const [isRendering, setIsRendering] = useState(false);
  const renderSeqRef = useRef(0);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const svgContainerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied'>('idle');
  const [styleMode] = useState<'normal' | 'handDrawn'>('handDrawn');
  const firstRenderRef = useRef(true);
  const dragRef = useRef<{ active: boolean; pointerId: number | null; x: number; y: number; tx: number; ty: number }>({
    active: false,
    pointerId: null,
    x: 0,
    y: 0,
    tx: 0,
    ty: 0
  });

  const normalizedCode = useMemo(() => code.replace(/\n$/, ''), [code]);
  const codeForRender = useMemo(() => {
    const desiredLook = styleMode === 'handDrawn' ? 'handDrawn' : 'classic';
    const desiredSeed = 1;

    const stripLeadingInitDirectives = (text: string) => {
      let out = text;
      while (true) {
        const leading = out.match(/^\s*/)?.[0] ?? '';
        const idx = leading.length;
        if (!out.slice(idx).startsWith('%%{init:')) return out;
        const end = out.indexOf('}%%', idx);
        if (end === -1) return out;
        out = out.slice(0, idx) + out.slice(end + 3);
      }
    };

    const upsertInitKey = (config: string, key: string, valueLiteral: string) => {
      const keyRegexes = [
        new RegExp(`([,{]\\s*)(\"${key}\"|'${key}'|${key})\\s*:\\s*([^,}]+)`, 'm'),
        new RegExp(`(^\\s*)(\"${key}\"|'${key}'|${key})\\s*:\\s*([^,}]+)`, 'm')
      ];
      for (const re of keyRegexes) {
        if (re.test(config)) {
          return config.replace(re, (_m, p1, p2) => `${p1}${p2}: ${valueLiteral}`);
        }
      }
      const trimmed = config.trim();
      if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return config;
      const insert = trimmed.replace(/\}\s*$/, (m) => {
        const isEmpty = /^\{\s*\}$/.test(trimmed);
        const piece = isEmpty ? `"${key}": ${valueLiteral}` : `, "${key}": ${valueLiteral}`;
        return `${piece}${m}`;
      });
      return insert;
    };

    const buildInitDirective = (existingConfigText?: string) => {
      let configText = (existingConfigText ?? '').trim();
      if (!configText) configText = '{}';
      configText = upsertInitKey(configText, 'look', `"${desiredLook}"`);
      if (desiredLook === 'handDrawn') configText = upsertInitKey(configText, 'handDrawnSeed', String(desiredSeed));
      return `%%{init: ${configText}}%%`;
    };

    const leading = normalizedCode.match(/^\s*/)?.[0] ?? '';
    const idx = leading.length;
    if (!normalizedCode.slice(idx).startsWith('%%{init:')) {
      return `${buildInitDirective('{}')}\n${normalizedCode}`;
    }

    const end = normalizedCode.indexOf('}%%', idx);
    if (end === -1) {
      return `${buildInitDirective('{}')}\n${normalizedCode}`;
    }

    const existingConfigText = normalizedCode.slice(idx + '%%{init:'.length, end + 1);
    const rest = stripLeadingInitDirectives(normalizedCode.slice(end + 3));
    return `${leading}${buildInitDirective(existingConfigText)}\n${rest.trimStart()}`;
  }, [normalizedCode, styleMode]);

  useEffect(() => {
    if (!diagramKey) return;
    const cached = svgCache.get(diagramKey)?.svg;
    if (!cached) return;
    setSvg(prev => (prev ? prev : cached));
    if (cached) hasRenderedRef.current = true;
  }, [diagramKey]);

  const formatRenderError = (err: unknown) => {
    if (err instanceof Error) return `${err.name}: ${err.message}`;
    if (typeof err === 'string') return err;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  };

  const clampScale = (value: number) => Math.min(3, Math.max(0.5, value));

  const zoomAt = useCallback((nextScaleRaw: number, clientX?: number, clientY?: number) => {
    const viewport = viewportRef.current;
    if (!viewport) {
      setScale(clampScale(nextScaleRaw));
      return;
    }

    const nextScale = clampScale(nextScaleRaw);
    const prevScale = scale;
    if (nextScale === prevScale) return;

    const rect = viewport.getBoundingClientRect();
    const px = typeof clientX === 'number' ? clientX - rect.left : rect.width / 2;
    const py = typeof clientY === 'number' ? clientY - rect.top : rect.height / 2;

    setTranslate(prev => {
      const nextX = px - ((px - prev.x) * nextScale) / prevScale;
      const nextY = py - ((py - prev.y) * nextScale) / prevScale;
      return { x: nextX, y: nextY };
    });
    setScale(nextScale);
  }, [scale]);

  const resetView = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const getSvgElement = () => {
    const container = svgContainerRef.current;
    if (!container) return null;
    return container.querySelector('svg') as SVGSVGElement | null;
  };

  const systemFontFamily =
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,"Apple Color Emoji","Segoe UI Emoji"';

  const parseViewBox = (value: string | null) => {
    if (!value) return null;
    const parts = value.trim().split(/[,\s]+/).filter(Boolean);
    if (parts.length !== 4) return null;
    const nums = parts.map(v => Number(v));
    if (nums.some(n => Number.isNaN(n))) return null;
    return { minX: nums[0], minY: nums[1], width: nums[2], height: nums[3] };
  };

  const parseSvgRootViewBox = (svgText: string) => {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const root = doc.documentElement as unknown as SVGSVGElement;
    const vb = parseViewBox(root.getAttribute('viewBox'));
    if (vb) return vb;
    const wRaw = root.getAttribute('width');
    const hRaw = root.getAttribute('height');
    const w = wRaw ? Number.parseFloat(wRaw) : NaN;
    const h = hRaw ? Number.parseFloat(hRaw) : NaN;
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { minX: 0, minY: 0, width: w, height: h };
    return { minX: 0, minY: 0, width: 1, height: 1 };
  };

  const normalizeExportSvgText = (svgText: string, viewBox: { minX: number; minY: number; width: number; height: number }) => {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const root = doc.documentElement as unknown as SVGSVGElement;

    if (!root.getAttribute('xmlns')) root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    if (!root.getAttribute('xmlns:xlink')) root.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    root.setAttribute('viewBox', `${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`);
    root.setAttribute('width', String(viewBox.width));
    root.setAttribute('height', String(viewBox.height));

    const bg = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', String(viewBox.minX));
    bg.setAttribute('y', String(viewBox.minY));
    bg.setAttribute('width', String(viewBox.width));
    bg.setAttribute('height', String(viewBox.height));
    bg.setAttribute('fill', 'white');
    root.insertBefore(bg, root.firstChild);

    const style = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = [`*{font-family:${systemFontFamily};}`, 'text,tspan{font-family:inherit;}'].join('');
    root.insertBefore(style, bg.nextSibling);

    return new XMLSerializer().serializeToString(root);
  };

  const inlineExternalResources = async (svgText: string) => {
    const toDataUrl = (blob: Blob) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Failed to read blob'));
        reader.readAsDataURL(blob);
      });

    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const root = doc.documentElement as unknown as SVGSVGElement;

    root.querySelectorAll('style').forEach((styleEl) => {
      const text = styleEl.textContent ?? '';
      styleEl.textContent = text
        .replace(/@import[^;]+;/g, '')
        .replace(/url\(\s*(['"]?)(https?:\/\/|\/\/)[^)'"]+\1\s*\)/g, 'url()');
    });

    const images = Array.from(root.querySelectorAll('image'));
    await Promise.all(
      images.map(async (imgEl) => {
        const href =
          imgEl.getAttribute('href') ??
          imgEl.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ??
          '';
        const trimmed = href.trim();
        if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('#')) return;

        let absUrl = trimmed;
        try {
          absUrl = new URL(trimmed, window.location.href).toString();
        } catch {
          imgEl.remove();
          return;
        }

        try {
          const res = await fetch(absUrl, { mode: 'cors' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          const dataUrl = await toDataUrl(blob);
          imgEl.setAttribute('href', dataUrl);
          imgEl.removeAttributeNS('http://www.w3.org/1999/xlink', 'href');
        } catch {
          imgEl.remove();
        }
      })
    );

    return new XMLSerializer().serializeToString(root);
  };

  const buildCodeWithInitOverrides = (
    inputCode: string,
    overrides: Record<string, string | undefined>
  ) => {
    const stripLeadingInitDirectives = (text: string) => {
      let out = text;
      while (true) {
        const leading = out.match(/^\s*/)?.[0] ?? '';
        const idx = leading.length;
        if (!out.slice(idx).startsWith('%%{init:')) return out;
        const end = out.indexOf('}%%', idx);
        if (end === -1) return out;
        out = out.slice(0, idx) + out.slice(end + 3);
      }
    };

    const upsertInitKey = (config: string, key: string, valueLiteral: string) => {
      const keyRegexes = [
        new RegExp(`([,{]\\s*)(\"${key}\"|'${key}'|${key})\\s*:\\s*([^,}]+)`, 'm'),
        new RegExp(`(^\\s*)(\"${key}\"|'${key}'|${key})\\s*:\\s*([^,}]+)`, 'm')
      ];
      for (const re of keyRegexes) {
        if (re.test(config)) {
          return config.replace(re, (_m, p1, p2) => `${p1}${p2}: ${valueLiteral}`);
        }
      }
      const trimmed = config.trim();
      if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return config;
      const insert = trimmed.replace(/\}\s*$/, (m) => {
        const isEmpty = /^\{\s*\}$/.test(trimmed);
        const piece = isEmpty ? `"${key}": ${valueLiteral}` : `, "${key}": ${valueLiteral}`;
        return `${piece}${m}`;
      });
      return insert;
    };

    const buildInitDirective = (existingConfigText?: string) => {
      let configText = (existingConfigText ?? '').trim();
      if (!configText) configText = '{}';
      for (const [key, valueLiteral] of Object.entries(overrides)) {
        if (typeof valueLiteral !== 'string') continue;
        configText = upsertInitKey(configText, key, valueLiteral);
      }
      return `%%{init: ${configText}}%%`;
    };

    const leading = inputCode.match(/^\s*/)?.[0] ?? '';
    const idx = leading.length;
    if (!inputCode.slice(idx).startsWith('%%{init:')) {
      return `${buildInitDirective('{}')}\n${inputCode}`;
    }

    const end = inputCode.indexOf('}%%', idx);
    if (end === -1) {
      return `${buildInitDirective('{}')}\n${inputCode}`;
    }

    const existingConfigText = inputCode.slice(idx + '%%{init:'.length, end + 1);
    const rest = stripLeadingInitDirectives(inputCode.slice(end + 3));
    return `${leading}${buildInitDirective(existingConfigText)}\n${rest.trimStart()}`;
  };

  const getMermaid = async () => {
    const mermaidModule = await import('mermaid');
    const mermaid = mermaidModule.default;
    if (!mermaidInitialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'strict'
      });
      mermaidInitialized = true;
    }
    return mermaid;
  };

  const prepareExportSvgFromCode = async () => {
    const desiredLook = styleMode === 'handDrawn' ? 'handDrawn' : 'classic';
    const desiredSeed = 1;

    const exportCode = buildCodeWithInitOverrides(normalizedCode, {
      look: `"${desiredLook}"`,
      handDrawnSeed: desiredLook === 'handDrawn' ? String(desiredSeed) : undefined,
      htmlLabels: 'false',
      fontFamily: JSON.stringify(systemFontFamily)
    });

    const mermaid = await getMermaid();
    const renderId = `${idRef.current}-export-${Date.now()}`;
    const result = (await mermaid.render(renderId, exportCode)) as MermaidRenderResult;
    const raw = result.svg;
    const vb0 = parseSvgRootViewBox(raw);
    const vb = {
      minX: vb0.minX,
      minY: vb0.minY,
      width: Math.max(1, Math.ceil(vb0.width)),
      height: Math.max(1, Math.ceil(vb0.height))
    };
    const normalized = normalizeExportSvgText(raw, vb);
    const inlined = await inlineExternalResources(normalized);
    return { svgText: inlined, viewBox: vb };
  };

  const svgTextToPngBlob = async (svgText: string, viewBox: { minX: number; minY: number; width: number; height: number }) => {
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const blobUrl = URL.createObjectURL(svgBlob);

    const loadImage = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        (image as any).decoding = 'async';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Failed to load SVG image'));
        image.src = src;
      });

    try {
      let img: HTMLImageElement;
      try {
        img = await loadImage(blobUrl);
      } catch (err1) {
        const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
        try {
          img = await loadImage(dataUrl);
        } catch (err2) {
          const hasForeignObject = svgText.includes('<foreignObject');
          const hint = hasForeignObject ? '（SVG 包含 foreignObject，部分内核会加载失败）' : '';
          throw new Error(`Failed to load SVG image${hint}: ${String((err2 as any)?.message ?? err2)}`);
        }
      }

      const dpr = Math.max(2, Math.ceil(window.devicePixelRatio || 1));
      const canvas = document.createElement('canvas');
      canvas.width = viewBox.width * dpr;
      canvas.height = viewBox.height * dpr;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context not available');

      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, viewBox.width, viewBox.height);
      ctx.drawImage(img, 0, 0, viewBox.width, viewBox.height);

      const pngBlob = await new Promise<Blob>((resolve, reject) => {
        try {
          canvas.toBlob(blob => {
            if (!blob) reject(new Error('Failed to generate PNG'));
            else resolve(blob);
          }, 'image/png');
        } catch (err) {
          reject(err);
        }
      });

      return pngBlob;
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  };

  const copyAsImage = useCallback(async () => {
    const displayedSvgEl = getSvgElement();
    if (!displayedSvgEl) return;

    if (copyState === 'copying') return;
    setCopyState('copying');
    const formatError = (err: unknown) => {
      if (err instanceof Error) return `${err.name}: ${err.message}`;
      if (typeof err === 'string') return err;
      try {
        return JSON.stringify(err);
      } catch {
        return String(err);
      }
    };

    const hasTauri = Boolean((window as any).__TAURI__) || Boolean((window as any).__TAURI_INTERNALS__);

    let pngBlob: Blob | null = null;
    let exportSvgText = '';
    let exportViewBox: { minX: number; minY: number; width: number; height: number } | null = null;
    try {
      const prepared = await prepareExportSvgFromCode();
      exportSvgText = prepared.svgText;
      exportViewBox = prepared.viewBox;
      if (!hasTauri) {
        pngBlob = await svgTextToPngBlob(prepared.svgText, prepared.viewBox);
      }
    } catch (err) {
      if (!exportSvgText) exportSvgText = displayedSvgEl.outerHTML;
      if (!hasTauri && exportSvgText) {
        const canWriteItems =
          typeof (navigator as any).clipboard?.write === 'function' && typeof (window as any).ClipboardItem === 'function';
        try {
          if (canWriteItems) {
            const item = new (window as any).ClipboardItem({
              'image/svg+xml': new Blob([exportSvgText], { type: 'image/svg+xml;charset=utf-8' })
            });
            await (navigator as any).clipboard.write([item]);
          } else if (typeof navigator.clipboard?.writeText === 'function') {
            await navigator.clipboard.writeText(exportSvgText);
          } else {
            throw new Error('Clipboard API not available');
          }
          setCopyState('copied');
          window.setTimeout(() => setCopyState('idle'), 1200);
          return;
        } catch (copyErr) {
          const failMsg = `复制失败：SVG 转 PNG 失败，且 SVG 剪贴板写入失败。\n\nisTauri=${hasTauri}\nPNG错误=${formatError(
            err
          )}\nSVG错误=${formatError(copyErr)}`;
          console.error('[MermaidDiagram.copyAsImage] svg->png failed; svg clipboard fallback failed', { hasTauri, err, copyErr });
          alert(failMsg);
          setCopyState('idle');
          return;
        }
      }

      const failMsg = `复制失败：SVG 转 PNG 失败。\n\nisTauri=${hasTauri}\n错误=${formatError(err)}`;
      console.error('[MermaidDiagram.copyAsImage] svg->png failed', { hasTauri, err });
      alert(failMsg);
      setCopyState('idle');
      return;
    }

    if (hasTauri) {
      try {
        await invoke('set_clipboard_image_from_svg', { svgText: exportSvgText });
      } catch (err) {
        const message = `复制失败：写入剪贴板失败（Tauri）。\n\nisTauri=${hasTauri}\n错误=${formatError(err)}`;
        console.error('[MermaidDiagram.copyAsImage] invoke set_clipboard_image_from_svg failed', { hasTauri, err });
        alert(message);
        setCopyState('idle');
        return;
      }
    } else {
      if (!pngBlob || !exportViewBox) {
        const message = `复制失败：导出流程异常。\n\nisTauri=${hasTauri}`;
        console.error('[MermaidDiagram.copyAsImage] unexpected export state', { hasTauri, pngBlob, exportViewBox });
        alert(message);
        setCopyState('idle');
        return;
      }

      const canWrite =
        typeof (navigator as any).clipboard?.write === 'function' && typeof (window as any).ClipboardItem === 'function';
      if (!canWrite) {
        const message = `复制失败：当前浏览器不支持复制图片到剪贴板。\n\nisTauri=${hasTauri}`;
        console.warn('[MermaidDiagram.copyAsImage] ClipboardItem or clipboard.write not available', { hasTauri });
        alert(message);
        setCopyState('idle');
        return;
      }

      try {
        const item = new (window as any).ClipboardItem({ 'image/png': pngBlob });
        await (navigator as any).clipboard.write([item]);
      } catch (err) {
        if (exportSvgText) {
          try {
            const canWriteItems =
              typeof (navigator as any).clipboard?.write === 'function' && typeof (window as any).ClipboardItem === 'function';
            if (canWriteItems) {
              const item = new (window as any).ClipboardItem({
                'image/svg+xml': new Blob([exportSvgText], { type: 'image/svg+xml;charset=utf-8' })
              });
              await (navigator as any).clipboard.write([item]);
            } else if (typeof navigator.clipboard?.writeText === 'function') {
              await navigator.clipboard.writeText(exportSvgText);
            } else {
              throw new Error('Clipboard API not available');
            }
            setCopyState('copied');
            window.setTimeout(() => setCopyState('idle'), 1200);
            return;
          } catch (svgErr) {
            const message = `复制失败：写入剪贴板失败（浏览器）。\n\nisTauri=${hasTauri}\nPNG错误=${formatError(err)}\nSVG错误=${formatError(svgErr)}`;
            console.error('[MermaidDiagram.copyAsImage] clipboard write failed', { hasTauri, err, svgErr });
            alert(message);
            setCopyState('idle');
            return;
          }
        }
        const message = `复制失败：写入剪贴板失败（浏览器）。\n\nisTauri=${hasTauri}\n错误=${formatError(err)}`;
        console.error('[MermaidDiagram.copyAsImage] navigator.clipboard.write failed', { hasTauri, err });
        alert(message);
        setCopyState('idle');
        return;
      }
    }

    setCopyState('copied');
    window.setTimeout(() => setCopyState('idle'), 1200);
  }, [copyState]);

  useEffect(() => {
    let cancelled = false;
    const delayMs = firstRenderRef.current ? 0 : 250;
    const seq = ++renderSeqRef.current;
    setIsRendering(true);
    const timer = window.setTimeout(() => {
      firstRenderRef.current = false;

      (async () => {
        try {
          const mermaid = await getMermaid();

          const renderId = `${idRef.current}-${styleMode}`;
          const result = (await mermaid.render(renderId, codeForRender)) as MermaidRenderResult;
          if (cancelled) return;

          setSvg(result.svg);
          hasRenderedRef.current = true;
          setLastError(null);
          setShowErrorDetails(false);
          if (diagramKey) saveSvgCache(diagramKey, result.svg);
          resetView();
          if (seq === renderSeqRef.current) setIsRendering(false);
        } catch (err) {
          if (cancelled) return;
          setLastError(formatRenderError(err));
          if (seq === renderSeqRef.current) setIsRendering(false);
        }
      })();
    }, delayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [codeForRender, styleMode, resetView, diagramKey]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const direction = e.deltaY > 0 ? 1 : -1;
      const factor = direction > 0 ? 0.9 : 1.1;
      zoomAt(scale * factor, e.clientX, e.clientY);
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel as any);
  }, [scale, zoomAt]);

  const onPointerDown = (e: React.PointerEvent) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    dragRef.current = {
      active: true,
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      tx: translate.x,
      ty: translate.y
    };
    viewport.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active || dragRef.current.pointerId !== e.pointerId) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setTranslate({ x: dragRef.current.tx + dx, y: dragRef.current.ty + dy });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const viewport = viewportRef.current;
    if (dragRef.current.pointerId === e.pointerId) {
      dragRef.current.active = false;
      dragRef.current.pointerId = null;
      try {
        viewport?.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  if (!svg && !hasRenderedRef.current) {
    if (lastError) {
      return (
        <div className="my-4 rounded-xl border border-border bg-surface p-4">
          <div className="text-sm text-error font-medium">Mermaid 渲染失败</div>
          <div className="mt-2 text-xs text-muted whitespace-pre-wrap">{lastError}</div>
          <details className="mt-3">
            <summary className="text-xs text-muted cursor-pointer select-none">查看代码</summary>
            <pre className="mt-2">
              <code className="language-mermaid">{normalizedCode}</code>
            </pre>
          </details>
        </div>
      );
    }

    return (
      <div className="my-4 rounded-xl border border-border bg-white p-4 text-sm text-gray-600">
        Rendering…
      </div>
    );
  }

  return (
    <div className="mermaid-diagram relative my-4 rounded-xl border border-border bg-white">
      {lastError && (
        <div className="absolute left-2 top-2 z-10 max-w-[70%] pointer-events-auto">
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 backdrop-blur-sm px-2 py-1 text-xs text-red-200">
            <div className="flex items-center gap-2">
              <span className="truncate">渲染失败：已显示上次结果</span>
              <button
                type="button"
                className="text-red-200/90 hover:text-red-100 underline"
                onClick={() => setShowErrorDetails(v => !v)}
              >
                {showErrorDetails ? '收起' : '详情'}
              </button>
            </div>
            {showErrorDetails && <div className="mt-1 whitespace-pre-wrap break-words">{lastError}</div>}
          </div>
        </div>
      )}
      {isRendering && svg && (
        <div className="absolute left-2 bottom-2 z-10 pointer-events-none">
          <div className="rounded-md border border-border bg-white/80 px-2 py-1 text-xs text-gray-600 backdrop-blur-sm">
            Rendering…
          </div>
        </div>
      )}
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-lg border border-border bg-white/80 p-0.5 backdrop-blur-sm">
        <button
          type="button"
          className="h-6 w-6 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors inline-flex items-center justify-center disabled:opacity-50"
          title={copyState === 'copied' ? 'Copied' : 'Copy as image'}
          onClick={copyAsImage}
          disabled={copyState === 'copying'}
        >
          <Copy size={14} />
        </button>
        <button
          type="button"
          className="h-6 w-6 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors inline-flex items-center justify-center"
          title="Zoom out"
          onClick={() => zoomAt(scale / 1.15)}
        >
          <ZoomOut size={14} />
        </button>
        <button
          type="button"
          className="h-6 w-6 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors inline-flex items-center justify-center"
          title="Zoom in"
          onClick={() => zoomAt(scale * 1.15)}
        >
          <ZoomIn size={14} />
        </button>
        <button
          type="button"
          className="h-6 w-6 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors inline-flex items-center justify-center"
          title="Reset"
          onClick={resetView}
        >
          <RotateCcw size={14} />
        </button>
      </div>

      <div
        ref={viewportRef}
        className="relative overflow-hidden p-4 select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={resetView}
        style={{ touchAction: 'none' }}
      >
        <div
          ref={svgContainerRef}
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transformOrigin: '0 0'
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  );
};
