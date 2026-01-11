export const normalizePath = (p: string) => p.replace(/\/+$/, '');

export const getDepthFromRootPath = (rootPath: string, targetPath: string) => {
  const root = normalizePath(rootPath);
  const target = normalizePath(targetPath);
  const rootSegs = root.split('/').filter(Boolean);
  const targetSegs = target.split('/').filter(Boolean);

  if (rootSegs.length === 0) return targetSegs.length;
  const isPrefix = rootSegs.every((seg, i) => targetSegs[i] === seg);
  if (!isPrefix) return null;
  return targetSegs.length - rootSegs.length;
};

