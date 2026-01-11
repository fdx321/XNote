const escapeAngleBrackets = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');

const stripQuotes = (s: string) => {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
};

const pickAttr = (attrs: string, name: string) => {
  const re = new RegExp(`${name}\\s*=\\s*(".*?"|'.*?'|[^\\s>]+)`, 'i');
  const m = attrs.match(re);
  return m ? stripQuotes(m[1]) : null;
};

const sanitizeColor = (value: string) => {
  const v = value.trim();
  if (/^#[0-9a-f]{3}$/i.test(v) || /^#[0-9a-f]{6}$/i.test(v)) return v;
  if (/^[a-z]+$/i.test(v)) return v;
  if (/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i.test(v)) return v;
  if (/^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|1|0?\.\d+)\s*\)$/i.test(v)) return v;
  return null;
};

const fontSizeFromHtmlFontSize = (value: string) => {
  const n = Number.parseInt(value, 10);
  const map: Record<number, number> = { 1: 10, 2: 13, 3: 16, 4: 18, 5: 24, 6: 32, 7: 48 };
  return Number.isFinite(n) ? map[n] ?? null : null;
};

const sanitizeFontFamily = (value: string) => {
  const v = value.replace(/[<>]/g, '').replace(/["']/g, '').trim();
  if (!v) return null;
  if (v.length > 100) return v.slice(0, 100);
  return v;
};

const buildFontSpan = (attrs: string, inner: string) => {
  const colorRaw = pickAttr(attrs, 'color');
  const sizeRaw = pickAttr(attrs, 'size');
  const faceRaw = pickAttr(attrs, 'face');

  const color = colorRaw ? sanitizeColor(colorRaw) : null;
  const px = sizeRaw ? fontSizeFromHtmlFontSize(sizeRaw) : null;
  const face = faceRaw ? sanitizeFontFamily(faceRaw) : null;

  const styleParts: string[] = [];
  if (color) styleParts.push(`color:${color}`);
  if (px) styleParts.push(`font-size:${px}px`);
  if (face) styleParts.push(`font-family:${face}`);

  const styleAttr = styleParts.length ? ` style="${styleParts.join(';')}"` : '';
  return `<span${styleAttr}>${escapeAngleBrackets(inner)}</span>`;
};

export const prepareMarkdownForPreview = (markdown: string) => {
  const codePrefix = '@@XNOTE_CODE_';
  const codeSuffix = '@@';
  const codeTokens: string[] = [];

  const withCodeTokens = markdown
    .replace(/```[\s\S]*?```/g, (m) => {
      const id = codeTokens.length;
      codeTokens.push(m);
      return `${codePrefix}${id}${codeSuffix}`;
    })
    .replace(/`[^`\n]+`/g, (m) => {
      const id = codeTokens.length;
      codeTokens.push(m);
      return `${codePrefix}${id}${codeSuffix}`;
    });

  const tokenPrefix = '@@XNOTE_FONT_';
  const tokenSuffix = '@@';
  const tokens: Array<{ attrs: string; inner: string }> = [];

  const withTokens = withCodeTokens.replace(/<font\b([^>]*)>([\s\S]*?)<\/font>/gi, (_m, attrs, inner) => {
    const id = tokens.length;
    tokens.push({ attrs: String(attrs ?? ''), inner: String(inner ?? '') });
    return `${tokenPrefix}${id}${tokenSuffix}`;
  });

  const escaped = escapeAngleBrackets(withTokens);

  const withFont = escaped.replace(new RegExp(`${tokenPrefix}(\\d+)${tokenSuffix}`, 'g'), (_m, idx) => {
    const t = tokens[Number(idx)];
    if (!t) return '';
    return buildFontSpan(t.attrs, t.inner);
  });

  return withFont.replace(new RegExp(`${codePrefix}(\\d+)${codeSuffix}`, 'g'), (_m, idx) => {
    const t = codeTokens[Number(idx)];
    return t ?? '';
  });
};
