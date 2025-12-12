// scripts/scrape-alltrails.ts

/**
 * AllTrails 数据爬取脚本
 * 
 * 用途：
 * 1. 提取 trailDifficulty（Difficulty Track）
 * 2. 提取距离、爬升等数据（Fatigue Track）
 * 3. 提取风险因素（Difficulty Track）
 * 
 * ⚠️ 重要：
 * - 遵守 AllTrails 的 robots.txt
 * - 添加适当的延时，避免过度请求
 * - 仅用于个人/研究用途
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';

// 可选导入 Playwright（如果 HTTP 请求失败时使用）
let playwright: any = null;
try {
  playwright = require('playwright');
} catch (e) {
  // Playwright 未安装，将使用 HTTP 请求
}

export interface AllTrailsTrail {
  url: string;
  name?: string;  // 改为可选，因为可能解析失败
  difficulty?: string;  // EASY, MODERATE, HARD, EXTREME
  length?: string;      // 如 "5.2 km"
  elevationGain?: string;  // 如 "200 m"
  rating?: string;      // 评分
  description?: string;
  location?: string;    // 位置
  coordinates?: {
    lat: number;
    lng: number;
  };
  // Difficulty Track 字段
  riskFactors?: string[];  // 从描述/评论中提取
  technicalGrade?: number; // 如果有技术等级
  requiresEquipment?: boolean;
  requiresGuide?: boolean;
  // Fatigue Track 字段（从 GPX 或页面提取）
  totalDistance?: number;  // 公里
  elevationGainMeters?: number;  // 米
  maxElevation?: number;  // 米
  estimatedTime?: string;  // 预估时间（如 "2-2.5"）
}

// 配置
const BASE_URL = 'https://www.alltrails.com';

// 随机 User-Agent 列表（更像真实浏览器）
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getHeaders(referer?: string, preferImperial: boolean = false): Record<string, string> {
  // 如果 preferImperial 为 true，尝试使用美国地区的语言设置，可能显示原始单位（mi/ft）
  const acceptLanguage = preferImperial 
    ? 'en-US,en;q=0.9'  // 美国地区可能显示 mi/ft
    : 'en-US,en;q=0.9';
  
  return {
    'User-Agent': getRandomUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': acceptLanguage,
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': referer ? 'same-origin' : 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0',
    ...(referer ? { 'Referer': referer } : {}),
  };
}

/**
 * 使用 Playwright 爬取页面（降级方案）
 */
async function scrapeWithPlaywright(url: string, waitForSelector?: string): Promise<string | null> {
  if (!playwright) {
    console.error('❌ Playwright 未安装，无法使用浏览器模式');
    console.error('   请运行: npx playwright install chromium');
    return null;
  }

  let browser: any = null;
  try {
    const { chromium } = playwright;
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
      ],
    });

    const context = await browser.newContext({
      userAgent: getRandomUserAgent(),
      viewport: { width: 1920, height: 1080 },
    });
    
    const page = await context.newPage();
    
    // 隐藏 webdriver 特征
    await page.addInitScript(() => {
      // @ts-ignore
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
    });

    console.log(`🌐 正在使用 Playwright 访问: ${url}`);
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // 如果是 explore 页面，等待动态内容加载
    if (url.includes('/explore')) {
      console.log('⏳ 等待动态内容加载...');
      try {
        // 等待路线卡片或列表出现
        await page.waitForSelector('a[href*="/trail/"], [data-testid*="trail"], .trail-card', {
          timeout: 10000,
        }).catch(() => {
          // 如果选择器不存在，继续
        });
      } catch (e) {
        // 忽略超时错误
      }
      // 额外等待 JavaScript 执行
      await page.waitForTimeout(3000);
      
      // 滚动页面以触发懒加载
      await page.evaluate(() => {
        // @ts-ignore - window 和 document 在浏览器环境中存在
        (window as any).scrollTo(0, (document as any).body.scrollHeight / 2);
      });
      await page.waitForTimeout(2000);
    } else if (waitForSelector) {
      // 如果指定了选择器，等待它出现
      try {
        await page.waitForSelector(waitForSelector, { timeout: 10000 });
      } catch (e) {
        // 忽略超时错误
      }
      await page.waitForTimeout(2000);
    } else {
      await page.waitForTimeout(2000);
    }

    const html = await page.content();
    return html;
  } catch (error: any) {
    console.error(`❌ Playwright 爬取失败: ${error.message}`);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * 发送 HTTP 请求，带延时和重试，失败时自动降级到 Playwright
 */
export async function makeRequest(
  url: string, 
  delay: number = 2000,
  referer?: string,
  retries: number = 3,
  usePlaywrightFallback: boolean = true,
  preferImperial: boolean = false
): Promise<string | null> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // 随机延时（1.5-2.5 秒）
      const waitTime = delay + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, waitTime));

      const response = await axios.get(url, {
        headers: getHeaders(referer, preferImperial),
        timeout: 15000,
        validateStatus: (status) => status < 500, // 允许 4xx，但记录
        maxRedirects: 5,
      });

      if (response.status === 200) {
        return response.data;
      } else if (response.status === 403) {
        console.warn(`⚠️  403 Forbidden (尝试 ${attempt}/${retries}): ${url}`);
        if (attempt < retries) {
          // 403 时增加延时
          await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
          continue;
        }
        // 最后一次尝试失败，如果启用降级，使用 Playwright
        if (usePlaywrightFallback && playwright) {
          console.log('🔄 HTTP 请求失败，降级到 Playwright 模式...');
          // 如果是 explore 页面，使用 Playwright 等待动态内容
          const isExplorePage = url.includes('/explore');
          return await scrapeWithPlaywright(url, isExplorePage ? 'a[href*="/trail/"]' : undefined);
        }
        console.error(`❌ 403 错误：AllTrails 可能检测到爬虫。建议：`);
        console.error(`   1. 增加延时时间`);
        console.error(`   2. 使用 Playwright 模式（已自动尝试）`);
        console.error(`   3. 使用代理`);
        return null;
      } else {
        console.warn(`⚠️  请求返回状态码 ${response.status}: ${url}`);
        return null;
      }
    } catch (error: any) {
      if (attempt < retries) {
        console.warn(`⚠️  请求失败 (尝试 ${attempt}/${retries}): ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
        continue;
      }
      // 最后一次尝试失败，如果启用降级，使用 Playwright
      if (usePlaywrightFallback && playwright) {
        console.log('🔄 HTTP 请求失败，降级到 Playwright 模式...');
        const isExplorePage = url.includes('/explore');
        return await scrapeWithPlaywright(url, isExplorePage ? 'a[href*="/trail/"]' : undefined);
      }
      console.error(`❌ 请求失败: ${url} - ${error.message}`);
      return null;
    }
  }
  return null;
}

/**
 * 解析路线列表页，获取详情页链接
 */
function parseTrailList(html: string, debug: boolean = false): string[] {
  const $ = cheerio.load(html);
  const trailUrls: string[] = [];

  if (debug) {
    console.log('🔍 开始解析列表页...');
    console.log(`   - 页面标题: ${$('title').text()}`);
    console.log(`   - 页面长度: ${html.length} 字符`);
  }

  // 方法1: 从 <a> 标签中提取（最常见）
  $('a[href*="/trail/"]').each((_, element) => {
    const href = $(element).attr('href');
    if (href) {
      // 清理 href（移除查询参数和锚点）
      const cleanHref = href.split('?')[0].split('#')[0];
      const fullUrl = cleanHref.startsWith('http') ? cleanHref : `${BASE_URL}${cleanHref}`;
      if (!trailUrls.includes(fullUrl)) {
        trailUrls.push(fullUrl);
      }
    }
  });

  if (debug) {
    console.log(`   - 方法1 (a[href*="/trail/"]): 找到 ${trailUrls.length} 条`);
  }

  // 方法2: 从 data 属性中提取
  if (trailUrls.length === 0) {
    $('[data-trail-id], [data-href*="/trail/"], [href*="/trail/"]').each((_, element) => {
      const href = $(element).attr('data-href') || 
                   $(element).attr('href') || 
                   $(element).attr('data-url');
      if (href && href.includes('/trail/')) {
        const cleanHref = href.split('?')[0].split('#')[0];
        const fullUrl = cleanHref.startsWith('http') ? cleanHref : `${BASE_URL}${cleanHref}`;
        if (!trailUrls.includes(fullUrl)) {
          trailUrls.push(fullUrl);
        }
      }
    });
    
    if (debug) {
      console.log(`   - 方法2 (data 属性): 找到 ${trailUrls.length} 条`);
    }
  }

  // 方法3: 从 JSON-LD 结构化数据中提取
  if (trailUrls.length === 0) {
    $('script[type="application/ld+json"]').each((_, element) => {
      try {
        const jsonLd = $(element).html();
        if (jsonLd) {
          const data = JSON.parse(jsonLd);
          const items = Array.isArray(data) ? data : [data];
          
          for (const item of items) {
            if (item['@type'] === 'ItemList' && item.itemListElement) {
              // ItemList 格式
              item.itemListElement.forEach((listItem: any) => {
                if (listItem.item && listItem.item.url) {
                  const url = listItem.item.url;
                  if (url.includes('/trail/')) {
                    const cleanUrl = url.split('?')[0].split('#')[0];
                    if (!trailUrls.includes(cleanUrl)) {
                      trailUrls.push(cleanUrl);
                    }
                  }
                }
              });
            } else if (item.url && item.url.includes('/trail/')) {
              // 直接包含 URL
              const cleanUrl = item.url.split('?')[0].split('#')[0];
              if (!trailUrls.includes(cleanUrl)) {
                trailUrls.push(cleanUrl);
              }
            }
          }
        }
      } catch (e) {
        // 忽略 JSON 解析错误
      }
    });
    
    if (debug) {
      console.log(`   - 方法3 (JSON-LD): 找到 ${trailUrls.length} 条`);
    }
  }

  // 方法4: 从内联 JavaScript 数据中提取（explore 页面可能使用这种方式）
  if (trailUrls.length === 0) {
    $('script:not([type])').each((_, element) => {
      const scriptContent = $(element).html() || '';
      // 尝试匹配 URL 模式
      const urlMatches = scriptContent.match(/https?:\/\/[^"'\s]+\/trail\/[^"'\s]+/g);
      if (urlMatches) {
        urlMatches.forEach((url: string) => {
          const cleanUrl = url.split('?')[0].split('#')[0];
          if (!trailUrls.includes(cleanUrl)) {
            trailUrls.push(cleanUrl);
          }
        });
      }
    });
    
    if (debug) {
      console.log(`   - 方法4 (JavaScript): 找到 ${trailUrls.length} 条`);
    }
  }

  // 方法5: 尝试从所有可能的链接中提取
  if (trailUrls.length === 0) {
    $('a').each((_, element) => {
      const href = $(element).attr('href');
      if (href && (href.includes('/trail/') || href.includes('/trails/'))) {
        const cleanHref = href.split('?')[0].split('#')[0];
        const fullUrl = cleanHref.startsWith('http') ? cleanHref : `${BASE_URL}${cleanHref}`;
        if (fullUrl.includes('/trail/') && !trailUrls.includes(fullUrl)) {
          trailUrls.push(fullUrl);
        }
      }
    });
    
    if (debug) {
      console.log(`   - 方法5 (所有链接): 找到 ${trailUrls.length} 条`);
    }
  }

  // 去重并返回
  const uniqueUrls = Array.from(new Set(trailUrls));
  
  if (debug && uniqueUrls.length > 0) {
    console.log(`\n✅ 最终找到 ${uniqueUrls.length} 条路线:`);
    uniqueUrls.slice(0, 5).forEach((url, i) => {
      console.log(`   ${i + 1}. ${url}`);
    });
    if (uniqueUrls.length > 5) {
      console.log(`   ... 还有 ${uniqueUrls.length - 5} 条`);
    }
  }
  
  return uniqueUrls;
}

/**
 * 导出辅助函数（供 Puppeteer 版本使用）
 */
export function parseDifficulty(text: string): string | undefined {
  const upper = text.toUpperCase();
  if (upper.includes('EASY') || upper.includes('⭐')) {
    return 'EASY';
  } else if (upper.includes('MODERATE') || upper.includes('⭐⭐')) {
    return 'MODERATE';
  } else if (upper.includes('HARD') || upper.includes('⭐⭐⭐')) {
    return 'HARD';
  } else if (upper.includes('EXTREME') || upper.includes('⭐⭐⭐⭐') || upper.includes('⭐⭐⭐⭐⭐')) {
    return 'EXTREME';
  }
  return undefined;
}

export function parseDistance(text: string): number | undefined {
  // 匹配 "5.2 km" 或 "3.2 mi" 或 "1,234.5 km"（支持千位分隔符）
  // 先移除所有逗号，然后匹配
  const cleanedText = text.replace(/,/g, '');
  const match = cleanedText.match(/(\d+\.?\d*)\s*(km|mi|miles?)/i);
  if (match) {
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    // 转换为公里
    if (unit.startsWith('mi')) {
      return value * 1.60934;  // 英里转公里
    }
    return value;
  }
  return undefined;
}

export function parseElevation(text: string): number | undefined {
  // 匹配 "200 m" 或 "656 ft" 或 "1,131 m"（支持千位分隔符）
  // 先移除所有逗号，然后匹配
  const cleanedText = text.replace(/,/g, '');
  const match = cleanedText.match(/(\d+\.?\d*)\s*(m|ft|feet)/i);
  if (match) {
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    // 转换为米
    if (unit.startsWith('ft')) {
      return Math.round(value * 0.3048);  // 英尺转米
    }
    return Math.round(value);
  }
  return undefined;
}

export function extractRiskFactors(description: string): string[] {
  const factors: string[] = [];
  const lower = description.toLowerCase();

  // 技术动作
  if (lower.includes('rope') || lower.includes('roped')) {
    factors.push('rope');
  }
  if (lower.includes('exposure') || lower.includes('exposed') || lower.includes('cliff')) {
    factors.push('exposure');
  }
  if (lower.includes('scramble') || lower.includes('scrambling')) {
    factors.push('scramble');
  }
  if (lower.includes('technical') || lower.includes('technically')) {
    factors.push('technical');
  }

  // 地形不可逆
  if (lower.includes('ice') || lower.includes('icy')) {
    factors.push('ice');
  }
  if (lower.includes('loose rock') || lower.includes('scree')) {
    factors.push('loose_rock');
  }
  if (lower.includes('unstable') || lower.includes('unstable terrain')) {
    factors.push('unstable');
  }

  // 季节风险
  if (lower.includes('winter') && lower.includes('ice')) {
    factors.push('winter_ice');
  }
  if (lower.includes('snow')) {
    factors.push('snow');
  }

  return factors;
}

/**
 * 解析单个路线详情页
 */
export function parseTrailDetail(html: string, trailUrl: string, debug: boolean = false): AllTrailsTrail {
  const $ = cheerio.load(html);
  const trail: AllTrailsTrail = { 
    url: trailUrl,
    name: 'N/A'  // 默认值，后续会被覆盖
  };
  
  if (debug) {
    console.log('🔍 开始解析页面...');
  }

  try {
    // 路线名称
    trail.name = $('h1').first().text().trim() || 'N/A';
  } catch (e) {
    trail.name = 'N/A';
  }

  try {
    // 难度等级 - 尝试多个选择器
    const difficultySelectors = [
      '[data-testid="difficulty-label"]',
      '.difficulty-label',
      '.trail-difficulty',
      '[class*="Difficulty"]',
      '[class*="difficulty"]',
      // 尝试从星级图标中提取
      '.star-rating',
      '[aria-label*="difficulty"]',
      '[aria-label*="Difficulty"]',
    ];
    
    let difficultyText = '';
    for (const sel of difficultySelectors) {
      const diffEl = $(sel).first();
      if (diffEl.length > 0) {
        difficultyText = diffEl.text().trim() || diffEl.attr('aria-label') || diffEl.attr('title') || '';
        if (difficultyText) {
    trail.difficulty = parseDifficulty(difficultyText);
          if (trail.difficulty) break; // 找到后停止
        }
      }
    }
    
    // 如果还没找到，尝试从页面文本中搜索
    if (!trail.difficulty) {
      const pageText = $('body').text().toUpperCase();
      if (pageText.includes('EASY')) {
        trail.difficulty = 'EASY';
      } else if (pageText.includes('MODERATE')) {
        trail.difficulty = 'MODERATE';
      } else if (pageText.includes('HARD')) {
        trail.difficulty = 'HARD';
      } else if (pageText.includes('EXTREME')) {
        trail.difficulty = 'EXTREME';
      }
    }
  } catch (e) {
    console.warn('⚠️  解析难度失败:', e);
  }

  // 首先尝试从 JSON-LD 数据中获取原始值（通常包含原始单位）
  try {
    $('script[type="application/ld+json"]').each((_, element) => {
      try {
        const jsonLd = $(element).html();
        if (jsonLd) {
          const data = JSON.parse(jsonLd);
          const items = Array.isArray(data) ? data : [data];
          
          for (const item of items) {
            // 尝试从结构化数据中获取距离和海拔
            if (item.length) {
              // 可能是字符串格式 "7.4 mi" 或对象格式
              if (typeof item.length === 'string') {
                const match = item.length.match(/(\d+\.?\d*)\s*(mi|km|miles?)/i);
                if (match && !trail.length) {
                  trail.length = item.length;
                  trail.totalDistance = parseDistance(item.length);
                  if (debug) console.log(`  ✅ 从 JSON-LD 找到长度: ${item.length}`);
                }
              }
            }
            
            // 尝试获取海拔
            if (item.elevationGain || item.elevation) {
              const elev = item.elevationGain || item.elevation;
              if (typeof elev === 'string') {
                const match = elev.match(/(\d+\.?\d*)\s*(ft|m|feet?)/i);
                if (match && !trail.elevationGain) {
                  trail.elevationGain = elev;
                  trail.elevationGainMeters = parseElevation(elev);
                  if (debug) console.log(`  ✅ 从 JSON-LD 找到海拔增益: ${elev}`);
                }
          }
        }
      }
    }
  } catch (e) {
        // 忽略 JSON 解析错误
      }
    });
  } catch (e) {
    // 忽略
  }

  // 统一解析 TrailStats - 遍历所有 stat 元素
  try {
    // 支持多种可能的 CSS 类名变体（单下划线和双下划线）
    const statSelectors = [
      '.TrailStats_stat_02GvM',
      '[class*="TrailStats_stat"]',
    ];
    
    const valueSelectors = [
      '.TrailStats_statValueSm__HlKIU',  // 双下划线
      '.TrailStats_statValueSm_HlKIU',    // 单下划线
      '[class*="TrailStats_statValue"]',
    ];
    
    const labelSelectors = [
      '.TrailStats_statLabel_vKMLy',
      '[class*="TrailStats_statLabel"]',
    ];

    // 遍历所有 stat 元素
    $('.TrailStats_stat_02GvM, [class*="TrailStats_stat"]').each((_, element) => {
      const $stat = $(element);
      
      // 尝试找到 label
      let label = '';
      for (const labelSel of labelSelectors) {
        const labelEl = $stat.find(labelSel).first();
        if (labelEl.length > 0) {
          label = labelEl.text().trim().toLowerCase();
          break;
        }
      }
      
      if (!label) return; // 没有 label，跳过
      
      // 尝试找到 value
      let valueEl: cheerio.Cheerio | null = null;
      for (const valueSel of valueSelectors) {
        const el = $stat.find(valueSel).first();
        if (el.length > 0) {
          valueEl = el;
          break;
        }
      }
      
      if (!valueEl || valueEl.length === 0) return;
      
      // 提取数字和单位
      // 根据图片，HTML 结构是：
      // <span class="TrailStats_statValueSm_HlKIU">7.4</span><span>mi</span>
      // 所以数字在 valueEl 中，单位在 valueEl 的下一个兄弟 span 中
      
      // 方法1: 提取 valueEl 中的数字（移除所有子元素）
      let numberText = valueEl.clone().children().remove().end().text().trim();
      
      // 方法2: 尝试从 valueEl 的直接子 span 中获取单位
      let unitSpan = valueEl.find('span').first();
      let unit = unitSpan.length > 0 ? unitSpan.text().trim() : '';
      
      // 方法3: 如果单位不在子元素中，尝试从下一个兄弟元素获取
      if (!unit) {
        const nextSibling = valueEl.next();
        if (nextSibling.length > 0 && nextSibling.is('span')) {
          unit = nextSibling.text().trim();
        }
      }
      
      // 方法4: 如果还是没有，尝试从父元素的完整文本中提取
      if (!unit || !numberText) {
        const parent = valueEl.parent();
        const allText = parent.text().trim();
        
        // 尝试匹配 "数字 单位" 的模式
        const match = allText.match(/(\d+\.?\d*)\s*(mi|km|ft|m|miles?|feet?|hr|hours?)/i);
        if (match) {
          numberText = match[1];
          unit = match[2];
        }
      }
      
      // 方法5: 如果还是没有，尝试从 valueEl 的完整文本中提取（包含所有子元素）
      if (!unit || !numberText) {
        const fullText = valueEl.text().trim();
        const match = fullText.match(/(\d+\.?\d*)\s*(mi|km|ft|m|miles?|feet?|hr|hours?)/i);
        if (match) {
          numberText = match[1];
          unit = match[2];
        } else {
          // 如果还是没有匹配，可能是纯数字，尝试提取数字
          const numMatch = fullText.match(/(\d+\.?\d*)/);
          if (numMatch) {
            numberText = numMatch[1];
          }
        }
      }
      
      const fullValue = unit ? `${numberText} ${unit}` : numberText;
      
      if (debug) {
        console.log(`  🔍 解析 stat [${label}]:`);
        console.log(`     - valueEl HTML: ${valueEl.html()?.substring(0, 100)}`);
        console.log(`     - valueEl text: "${valueEl.text()}"`);
        console.log(`     - numberText: "${numberText}"`);
        console.log(`     - unit: "${unit}"`);
        console.log(`     - fullValue: "${fullValue}"`);
      }
      
      // 根据 label 分类处理（如果还没有从 JSON-LD 获取，才从 HTML 提取）
      if (label.includes('length') && !trail.length) {
        trail.length = fullValue;
        trail.totalDistance = parseDistance(fullValue);
        if (debug) console.log(`  ✅ 从 HTML 找到长度: ${fullValue} (${trail.totalDistance} km)`);
      } else if (label.includes('elevation') && label.includes('gain') && !trail.elevationGain) {
        trail.elevationGain = fullValue;
        trail.elevationGainMeters = parseElevation(fullValue);
        if (debug) console.log(`  ✅ 从 HTML 找到海拔增益: ${fullValue} (${trail.elevationGainMeters} m)`);
      } else if (label.includes('elevation') && (label.includes('max') || label.includes('high'))) {
        // 最高海拔
        trail.maxElevation = parseElevation(fullValue);
        if (debug) console.log(`  ✅ 找到最高海拔: ${fullValue} (${trail.maxElevation} m)`);
      } else if ((label.includes('time') || label.includes('estimated')) && !trail.estimatedTime) {
        trail.estimatedTime = fullValue;
        if (debug) console.log(`  ✅ 找到预估时间: ${fullValue}`);
      } else if (debug) {
        console.log(`  ℹ️  未处理的 stat: ${label} = ${fullValue}`);
      }
      // 其他 stat 可以在这里扩展
    });
  } catch (e) {
    console.warn('⚠️  解析 TrailStats 失败:', e);
  }

  try {
    // 评分 - 尝试多个选择器
    const ratingSelectors = [
      '[itemprop="ratingValue"]',
      '.rating-value',
      '.trail-rating',
      '[data-testid="rating-value"]',
      '[class*="Rating"]',
      '[class*="rating"]',
      '.star-rating',
      '.rating-stars',
    ];
    
    let ratingText = '';
    for (const sel of ratingSelectors) {
      const ratingEl = $(sel).first();
      if (ratingEl.length > 0) {
        ratingText = ratingEl.text().trim() || 
                     ratingEl.attr('data-rating') || 
                     ratingEl.attr('aria-label') || 
                     ratingEl.attr('title') || '';
        if (ratingText) {
          // 清理文本，只保留数字
          ratingText = ratingText.replace(/[^0-9.]/g, '');
          if (ratingText) break;
        }
      }
    }
    
    trail.rating = ratingText || undefined;
  } catch (e) {
    console.warn('⚠️  解析评分失败:', e);
  }

  try {
    // 描述 - 使用实际的 CSS 类名
    // 从图片中看到：Description_description_d8JyX
    const descriptionSelectors = [
      '.Description_description_d8JyX',
      '[class*="Description_description"]',
      '[data-testid="trail-description"]',
      '.trail-description',
      '.description',
      '.PageSection_description',
    ];
    
    let descriptionText = '';
    for (const sel of descriptionSelectors) {
      const descEl = $(sel).first();
      if (descEl.length > 0) {
        descriptionText = descEl.text().trim();
        if (descriptionText) break;
      }
    }
    
    // 如果描述被截断，尝试点击 "more" 按钮（但这里只能获取初始文本）
    if (!descriptionText) {
      // 尝试从 overview 区域提取
      descriptionText = $('#overview .description, #overview p').first().text().trim();
    }
    
    trail.description = descriptionText || undefined;
    
    // 从描述中提取风险因素
    if (trail.description) {
      trail.riskFactors = extractRiskFactors(trail.description);
    }
  } catch (e) {
    console.warn('⚠️  解析描述失败:', e);
  }

  try {
    // 位置 - 尝试多个选择器
    const locationSelectors = [
      '[data-testid="location-label"]',
      '.location',
      '.trail-location',
      '.PageSection_location',
      '.breadcrumb',
      '.trail-breadcrumb',
      '[aria-label*="location"]',
      // 尝试从标题区域提取位置信息
      'h1 + *',
      '.trail-header .location',
    ];
    
    let locationText = '';
    for (const sel of locationSelectors) {
      const locEl = $(sel).first();
      if (locEl.length > 0) {
        locationText = locEl.text().trim();
        if (locationText && locationText.length > 3) break; // 确保不是空文本
      }
    }
    
    trail.location = locationText || undefined;
  } catch (e) {
    console.warn('⚠️  解析位置失败:', e);
  }
  
  // 提取路线类型（如 "Out & back"）
  try {
    // 路线类型可能在 stat label 中
    $('.TrailStats_stat_02GvM, [class*="TrailStats_stat"]').each((_, element) => {
      const $stat = $(element);
      const label = $stat.find('.TrailStats_statLabel_vKMLy, [class*="TrailStats_statLabel"]')
        .first()
        .text()
        .trim()
        .toLowerCase();
      
      // 检查是否是路线类型（不是数字统计）
      if (label && !label.includes('length') && !label.includes('elevation') && 
          !label.includes('time') && !label.includes('rating') && 
          (label.includes('out') || label.includes('back') || label.includes('loop') || 
           label.includes('point') || label.includes('type'))) {
        // 这可能是路线类型，可以添加到 metadata
        // 暂时不处理，因为 AllTrailsTrail 接口中没有这个字段
      }
    });
  } catch (e) {
    // 忽略
  }

  try {
    // 坐标（可能在 JSON-LD 或 meta 标签中）
    // 尝试多个 JSON-LD 脚本
    $('script[type="application/ld+json"]').each((_, element) => {
      try {
        const jsonLd = $(element).html();
        if (jsonLd) {
        const data = JSON.parse(jsonLd);
          
          // 处理单个对象或数组
          const items = Array.isArray(data) ? data : [data];
          
          for (const item of items) {
            // 尝试多种可能的坐标格式
            if (item.geo) {
              if (item.geo.latitude && item.geo.longitude) {
          trail.coordinates = {
                  lat: parseFloat(item.geo.latitude),
                  lng: parseFloat(item.geo.longitude),
                };
                return false; // 找到后停止
              }
            }
            
            // 尝试 GeoCoordinates 格式
            if (item['@type'] === 'GeoCoordinates' || item.type === 'GeoCoordinates') {
              if (item.latitude && item.longitude) {
                trail.coordinates = {
                  lat: parseFloat(item.latitude),
                  lng: parseFloat(item.longitude),
                };
                return false;
              }
            }
            
            // 尝试 Place 格式
            if (item['@type'] === 'Place' || item.type === 'Place') {
              if (item.geo?.latitude && item.geo?.longitude) {
          trail.coordinates = {
                  lat: parseFloat(item.geo.latitude),
                  lng: parseFloat(item.geo.longitude),
          };
                return false;
              }
            }
          }
        }
      } catch (e) {
        // 忽略单个 JSON 解析错误，继续尝试下一个
      }
    });
    
    // 如果 JSON-LD 中没有，尝试从 meta 标签提取
    if (!trail.coordinates) {
      const latMeta = $('meta[property="place:location:latitude"], meta[name="latitude"]').attr('content');
      const lngMeta = $('meta[property="place:location:longitude"], meta[name="longitude"]').attr('content');
      if (latMeta && lngMeta) {
        trail.coordinates = {
          lat: parseFloat(latMeta),
          lng: parseFloat(lngMeta),
        };
      }
    }
  } catch (e) {
    console.warn('⚠️  解析坐标失败:', e);
  }

  // 检查是否需要装备/向导（从描述中推断）
  if (trail.description) {
    const desc = trail.description.toLowerCase();
    trail.requiresEquipment = desc.includes('equipment') || 
                             desc.includes('gear') || 
                             desc.includes('rope') ||
                             desc.includes('crampons');
    trail.requiresGuide = desc.includes('guide') || 
                         desc.includes('guided tour') ||
                         desc.includes('professional');
  }

  return trail;
}

export function convertToSystemFormat(trail: AllTrailsTrail): {
  difficultyMetadata?: any;
  fatigueMetadata?: any;
  metadata: any;
} {
  const metadata: any = {
    source: 'alltrails',
    sourceUrl: trail.url,
    name: trail.name,
    location: trail.location,
    rating: trail.rating,
    description: trail.description,
    // 添加 Fatigue 相关字段
    length: trail.length,
    elevationGain: trail.elevationGain,
    estimatedTime: trail.estimatedTime,
    // 用于 PhysicalMetadataGenerator
    visitDuration: trail.estimatedTime ? `${trail.estimatedTime} hours` : undefined,
  };

  // Difficulty Metadata
  let difficultyMetadata: any = undefined;
  if (trail.difficulty || trail.riskFactors) {
    difficultyMetadata = {
      level: trail.difficulty || 'MODERATE',  // 默认中等
      source: 'alltrails',
      confidence: 0.9,  // AllTrails 数据置信度高
      riskFactors: trail.riskFactors || [],
      requiresEquipment: trail.requiresEquipment,
      requiresGuide: trail.requiresGuide,
    };
  }

  // Fatigue Metadata（从 GPX 或页面数据）
  let fatigueMetadata: any = undefined;
  if (trail.totalDistance || trail.elevationGainMeters) {
    fatigueMetadata = {
      totalDistance: trail.totalDistance,
      elevationGain: trail.elevationGainMeters,
      maxElevation: trail.maxElevation,
    };
  }

  return {
    difficultyMetadata,
    fatigueMetadata,
    metadata,
  };
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  
  // 支持两种模式：
  // 1. 爬取单个路线：node scrape-alltrails.ts --url <url>
  // 2. 爬取列表页：node scrape-alltrails.ts --list <list_url>
  
  if (args.includes('--url')) {
    const urlIndex = args.indexOf('--url');
    const trailUrl = args[urlIndex + 1];
    
    if (!trailUrl) {
      console.error('❌ 请提供路线 URL');
      process.exit(1);
    }

    console.log(`🔍 正在爬取单个路线: ${trailUrl}`);
    
    // 检查是否使用英制单位
    const preferImperial = args.includes('--imperial');
    if (preferImperial) {
      console.log('📏 使用英制单位模式（尝试获取 mi/ft）');
    }
    
    // 先访问首页获取 Cookie（模拟真实用户行为）
    console.log('📋 正在访问首页以获取 Cookie...');
    await makeRequest(BASE_URL, 1000, undefined, 3, true, preferImperial);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const html = await makeRequest(trailUrl, 3000, BASE_URL, 3, true, preferImperial);
    
    if (!html) {
      console.error('❌ 无法获取页面');
      process.exit(1);
    }

    const debug = args.includes('--debug');
    const trail = parseTrailDetail(html, trailUrl, debug);
    const systemFormat = convertToSystemFormat(trail);
    
    if (debug) {
      console.log('\n🔍 原始解析结果:');
      console.log(JSON.stringify(trail, null, 2));
    }

    console.log('\n📊 爬取结果:');
    console.log(JSON.stringify(systemFormat, null, 2));

    // 保存到文件
    const outputFile = `alltrails_${Date.now()}.json`;
    await fs.writeFile(outputFile, JSON.stringify(systemFormat, null, 2), 'utf-8');
    console.log(`\n✅ 数据已保存到: ${outputFile}`);

  } else if (args.includes('--list')) {
    const urlIndex = args.indexOf('--list');
    const listUrl = args[urlIndex + 1];
    
    if (!listUrl) {
      console.error('❌ 请提供列表页 URL');
      process.exit(1);
    }

    console.log(`🔍 正在爬取列表页: ${listUrl}`);
    
    // 检查是否使用英制单位
    const preferImperial = args.includes('--imperial');
    
    // 先访问首页获取 Cookie
    console.log('📋 正在访问首页以获取 Cookie...');
    await makeRequest(BASE_URL, 1000, undefined, 3, true, preferImperial);
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const html = await makeRequest(listUrl, 3000, BASE_URL, 3, true, preferImperial);
    
    if (!html) {
      console.error('❌ 无法获取列表页');
      console.error('💡 提示：');
      console.error('   1. 检查 URL 是否正确');
      console.error('   2. 尝试增加延时时间');
      console.error('   3. 使用 Playwright 模式（需要先安装: npx playwright install chromium）');
      process.exit(1);
    }

    const debug = args.includes('--debug');
    const trailUrls = parseTrailList(html, debug);
    console.log(`📋 找到 ${trailUrls.length} 条路线`);
    
    if (trailUrls.length === 0) {
      console.warn('⚠️  未找到任何路线链接，可能的原因：');
      console.warn('   1. URL 不正确或页面结构已变化');
      console.warn('   2. 需要登录或验证');
      console.warn('   3. 该地区没有路线数据');
      console.warn('\n💡 建议：');
      console.warn('   - 检查 URL 是否正确');
      console.warn('   - 尝试在浏览器中手动访问该 URL');
      console.warn('   - 使用 --debug 模式查看页面内容');
      process.exit(1);
    }

    const allTrails: any[] = [];
    const limit = args.includes('--limit') 
      ? parseInt(args[args.indexOf('--limit') + 1]) 
      : trailUrls.length;

    for (let i = 0; i < Math.min(limit, trailUrls.length); i++) {
      const trailUrl = trailUrls[i];
      console.log(`\n[${i + 1}/${Math.min(limit, trailUrls.length)}] 正在处理: ${trailUrl}`);

      // 增加延时，避免被封
      const delay = 3000 + Math.random() * 2000; // 3-5 秒随机延时
      const detailHtml = await makeRequest(trailUrl, delay, listUrl, 3, true, preferImperial);
      
      if (detailHtml) {
        const debug = args.includes('--debug');
        const trail = parseTrailDetail(detailHtml, trailUrl, debug);
        const systemFormat = convertToSystemFormat(trail);
        allTrails.push(systemFormat);
        console.log(`  ✅ 已抓取: ${trail.name || 'Unknown'}`);
        
        // 每抓取 5 条路线，保存一次（防止数据丢失）
        if ((i + 1) % 5 === 0) {
          const tempFile = `alltrails_list_temp_${Date.now()}.json`;
          await fs.writeFile(tempFile, JSON.stringify(allTrails, null, 2), 'utf-8');
          console.log(`  💾 临时保存到: ${tempFile} (已抓取 ${i + 1} 条)`);
        }
      } else {
        console.log(`  ⚠️  跳过，无法获取页面`);
      }
    }

    // 保存到文件
    const outputFile = `alltrails_list_${Date.now()}.json`;
    await fs.writeFile(outputFile, JSON.stringify(allTrails, null, 2), 'utf-8');
    console.log(`\n✅ 数据已保存到: ${outputFile} (共 ${allTrails.length} 条)`);

  } else if (args.includes('--playwright')) {
    // 强制使用 Playwright 模式
    const urlIndex = args.indexOf('--playwright');
    const trailUrl = args[urlIndex + 1];
    
    if (!trailUrl) {
      console.error('❌ 请提供路线 URL');
      process.exit(1);
    }

    if (!playwright) {
      console.error('❌ Playwright 未安装');
      console.error('   请运行: npx playwright install chromium');
      process.exit(1);
    }

    console.log(`🔍 正在使用 Playwright 爬取: ${trailUrl}`);
    const html = await scrapeWithPlaywright(trailUrl);
    
    if (!html) {
      console.error('❌ 无法获取页面');
      process.exit(1);
    }

    const debug = args.includes('--debug');
    const trail = parseTrailDetail(html, trailUrl, debug);
    const systemFormat = convertToSystemFormat(trail);
    
    if (debug) {
      console.log('\n🔍 原始解析结果:');
      console.log(JSON.stringify(trail, null, 2));
    }

    console.log('\n📊 爬取结果:');
    console.log(JSON.stringify(systemFormat, null, 2));

    const outputFile = `alltrails_${Date.now()}.json`;
    await fs.writeFile(outputFile, JSON.stringify(systemFormat, null, 2), 'utf-8');
    console.log(`\n✅ 数据已保存到: ${outputFile}`);

  } else {
    console.log(`
使用方法:
  爬取单个路线（HTTP，失败时自动降级到 Playwright）:
    npm run scrape:alltrails -- --url <trail_url>
  
  爬取单个路线（强制使用 Playwright）:
    npm run scrape:alltrails -- --playwright <trail_url>
  
  爬取列表页:
    npm run scrape:alltrails -- --list <list_url> [--limit <number>]

示例:
  npm run scrape:alltrails -- --url https://www.alltrails.com/trail/us/arizona/tempe-town-lake-trail--2
  npm run scrape:alltrails -- --url <url> --debug  # 启用调试模式
  npm run scrape:alltrails -- --url <url> --imperial  # 尝试获取英制单位（mi/ft）
  npm run scrape:alltrails -- --playwright https://www.alltrails.com/trail/us/arizona/tempe-town-lake-trail--2
  npm run scrape:alltrails -- --list https://www.alltrails.com/parks --limit 5
    `);
  }
}

// 运行
if (require.main === module) {
  main().catch(console.error);
}
