/**
 * 飞猪打开链。
 *
 * 背景：FlyAI 常返回 https `router.feizhu.com/...` 路由页——浏览器打开会先停在中间页，
 * 再点一次才进 App。原生客户端应 **先开 Scheme / tbopen，失败再回落 https**。
 *
 * 实测备忘：
 * - `taobaotravel://hotel/detail?…`、`taobaotravel://http://…` 多数版本只冷启动首页
 * - 有 shId 时：App 链用 market 酒店详情 H5 的 path 写法，比再包一层 feizhu 路由更易落到详情
 * - 手淘另给 `tbopen://…&h5Url=` 作双通道
 */

export type FliggyOpenLinks = {
  /**
   * 飞猪 / 淘宝旅行容器 Scheme（path 写法，无 `http://` 前缀）
   * 保留字段兼容旧客户端；当前 openStrategy=web，主链用 webUrl。
   */
  appUrl: string;
  /** 手淘 tbopen（兼容字段；当前默认不优先唤端） */
  tbOpenUrl: string;
  /** 主打开链：FlyAI 官方 https / market 详情 H5 */
  webUrl: string;
  /** 给客户端的打开策略（唤端不稳定，统一走 H5） */
  openStrategy: 'web' | 'app_then_web';
};

/** 是否已是飞猪 App Scheme */
export function isFliggyAppScheme(url: string): boolean {
  return /^taobaotravel:/i.test(String(url ?? '').trim());
}

function asHttpsUrl(raw: string): string {
  const s = String(raw ?? '').trim();
  if (!s) return s;
  if (s.startsWith('//')) return `https:${s}`;
  if (/^https?:\/\//i.test(s)) return s.replace(/^http:\/\//i, 'https://');
  return `https://${s.replace(/^\/+/, '')}`;
}

/** 飞猪开放平台常见酒店详情 H5（market 容器） */
export function buildFliggyHotelDetailWebUrl(input: {
  shId: string;
  checkInDate?: string | null;
  checkOutDate?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set('shid', String(input.shId).trim());
  const ci = String(input.checkInDate ?? '').slice(0, 10);
  const co = String(input.checkOutDate ?? '').slice(0, 10);
  // 开放平台示例用 checkIn / checkOut（驼峰）
  if (/^\d{4}-\d{2}-\d{2}$/.test(ci)) params.set('checkIn', ci);
  if (/^\d{4}-\d{2}-\d{2}$/.test(co)) params.set('checkOut', co);
  return `https://market.m.taobao.com/app/trip/h5-hotel-detail/pages/detail/index.html?${params.toString()}`;
}

/**
 * 淘宝系常见写法：scheme + host/path（无 http:// 前缀），便于 App 内开 H5 容器。
 * 例：taobaotravel://market.m.taobao.com/app/trip/h5-hotel-detail/pages/detail/index.html?shid=…
 */
export function buildFliggyHotelDetailAppUrl(input: {
  shId: string;
  checkInDate?: string | null;
  checkOutDate?: string | null;
}): string {
  const https = buildFliggyHotelDetailWebUrl(input);
  return `taobaotravel://${https.replace(/^https:\/\//i, '')}`;
}

/** 官方 detailUrl → App 内打开（path 写法，而非 taobaotravel://http://） */
export function toFliggyAppWebViewDeepLink(webUrl: string): string {
  const https = asHttpsUrl(webUrl);
  if (!https) return https;
  if (isFliggyAppScheme(https)) return https;
  return `taobaotravel://${https.replace(/^https:\/\//i, '')}`;
}

/**
 * 手淘官方常见唤端：tbopen 打开指定 https（装淘宝时直进容器，减少 Safari 中间页）。
 * 文档参考：东风 / 阿里百川 tbopen 体系。
 */
export function toTaobaoTbOpenUrl(httpsUrl: string): string {
  const https = asHttpsUrl(httpsUrl);
  if (!https) return https;
  const h5 = encodeURIComponent(https);
  return (
    `tbopen://m.taobao.com/tbopen/index.html` +
    `?action=ali.open.nav&module=h5&bootImage=0&h5Url=${h5}`
  );
}

/** @deprecated 同 toFliggyAppWebViewDeepLink */
export function toFliggyAppDeepLink(webOrAppUrl: string): string {
  return toFliggyAppWebViewDeepLink(webOrAppUrl);
}

/**
 * 构造打开链。
 * - webUrl：浏览器回落（官方 detail / market）
 * - appUrl：飞猪 Scheme（有 shId 时优先 market 详情，避免再包 feizhu 路由中间页）
 * - tbOpenUrl：手淘双通道
 */
export function resolveFliggyOpenLinks(input: {
  detailOrJumpUrl?: string | null;
  shId?: string | null;
  checkInDate?: string | null;
  checkOutDate?: string | null;
}): FliggyOpenLinks | null {
  const shId = String(input.shId ?? '').trim();
  const raw = String(input.detailOrJumpUrl ?? '').trim();
  const detailHttps = raw && !isFliggyAppScheme(raw) ? asHttpsUrl(raw) : '';
  const hasShId = Boolean(shId && /^\d+$/.test(shId));

  const marketH5 = hasShId
    ? buildFliggyHotelDetailWebUrl({
        shId,
        checkInDate: input.checkInDate,
        checkOutDate: input.checkOutDate,
      })
    : '';

  // 浏览器回落仍优先官方 jumpUrl（联盟/可追踪）；无则 market
  const webUrl = detailHttps || marketH5;
  if (!webUrl) return null;

  // App：有 shId 时直达 market 酒店详情（比 taobaotravel://router.feizhu.com/... 少一层中间页）
  const appUrl = hasShId
    ? buildFliggyHotelDetailAppUrl({
        shId,
        checkInDate: input.checkInDate,
        checkOutDate: input.checkOutDate,
      })
    : toFliggyAppWebViewDeepLink(webUrl);

  // 手淘：用「最可能落到详情」的 https（优先 market，其次官方 jump）
  const tbTargetHttps = marketH5 || webUrl;
  const tbOpenUrl = toTaobaoTbOpenUrl(tbTargetHttps);

  return { appUrl, tbOpenUrl, webUrl, openStrategy: 'web' };
}

/** 搜索类 H5：默认浏览器打开 https（不再优先唤端） */
export function wrapFliggyHttpsAsAppPreferred(webUrl: string): FliggyOpenLinks {
  const web = asHttpsUrl(webUrl);
  return {
    appUrl: toFliggyAppWebViewDeepLink(web),
    tbOpenUrl: toTaobaoTbOpenUrl(web),
    webUrl: web,
    openStrategy: 'web',
  };
}
