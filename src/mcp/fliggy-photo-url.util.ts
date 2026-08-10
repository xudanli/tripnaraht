/**
 * 飞猪/阿里 CDN 图床 URL 规范化，便于 iOS / Markdown 加载。
 * mainPic 常见含未编码的 `!!`（如 `_!!0-alitrip.jpg`），部分客户端 URL 解析会失败。
 */

/** 将 path 中未编码的 `!` 转为 %21，保留 query/hash */
export function normalizeFliggyPhotoUrl(raw: string | null | undefined): string | undefined {
  const s = String(raw ?? '').trim();
  if (!s) return undefined;
  let url = s.startsWith('//') ? `https:${s}` : s;
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url.replace(/^\/+/, '')}`;
  }
  try {
    const u = new URL(url);
    // pathname 里的 ! 编码；勿二次编码已是 %21 的部分
    u.pathname = u.pathname.replace(/!/g, '%21');
    return u.toString();
  } catch {
    return url.replace(/!/g, '%21');
  }
}
