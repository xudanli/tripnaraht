/**
 * 从 DecisionState（或任意对象根）按点路径读取字段，供契约 requiredInputPaths 与投影共用。
 */
export function getAtPath(root: unknown, path: string): unknown {
  if (root == null || path === '') return undefined;
  const parts = path.split('.');
  let cur: unknown = root;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}
