// scripts/scrape-mafengwo-attractions-fixed.ts

import axios from 'axios';
import * as cheerio from 'cheerio';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';
import { chromium, Browser, Page } from 'playwright';
import puppeteer from 'puppeteer';

dotenv.config();

const prisma = new PrismaClient();

// 配置
const CONFIG = {
  delay: 2000,
  maxRetries: 3,
  userAgents: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0'
  ],
  acceptLanguage: 'zh-CN,zh;q=0.9,en;q=0.8,zh-TW;q=0.7',
};

interface MafengwoAttraction {
  name: string;
  nameEN?: string;
  address?: string;
  lat?: number;
  lng?: number;
  rating?: number;
  description?: string;
  phone?: string;
  website?: string;
  openingHours?: string;
  ticketPrice?: string;
  images?: string[];
  tags?: string[];
  city?: string;
  province?: string;
  sourceUrl: string;
  // 新增字段
  visitDuration?: string; // 用时参考
  transportation?: string; // 交通信息
  nearbyAttractions?: string[]; // 附近景点
  nearbyTransport?: string[]; // 附近交通
  detailedDescription?: string; // 详细描述（完整版）
}

// 获取随机User-Agent
function getRandomUserAgent(): string {
  return CONFIG.userAgents[Math.floor(Math.random() * CONFIG.userAgents.length)];
}

function createAxiosInstance() {
  const instance = axios.create({
    timeout: 20000,
    headers: {
      'User-Agent': getRandomUserAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': CONFIG.acceptLanguage,
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
    },
  });

  instance.interceptors.request.use((config) => {
    config.headers['User-Agent'] = getRandomUserAgent();
    return config;
  });

  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const config = error.config;
      if (!config || !config.retryCount) {
        config.retryCount = 0;
      }
      
      if (config.retryCount >= CONFIG.maxRetries) {
        console.error(`❌ 请求失败 (${config.url}): ${error.message}`);
        return Promise.reject(error);
      }
      
      config.retryCount += 1;
      const delay = CONFIG.delay * config.retryCount;
      console.log(`⚠️ 重试 ${config.retryCount}/${CONFIG.maxRetries}: ${config.url} (等待 ${delay}ms)`);
      
      await sleep(delay);
      config.headers['User-Agent'] = getRandomUserAgent();
      
      return instance(config);
    }
  );

  return instance;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 搜索具体景点名称
 */
async function searchAttractionByName(attractionName: string): Promise<string[]> {
  const axiosInstance = createAxiosInstance();
  const attractionUrls: string[] = [];

  try {
    // 使用马蜂窝搜索API
    const searchUrl = `https://www.mafengwo.cn/search/q.php?q=${encodeURIComponent(attractionName)}`;
    console.log(`🔍 搜索景点: ${attractionName} (${searchUrl})`);

    const response = await axiosInstance.get(searchUrl);
    const $ = cheerio.load(response.data);

    // 调试：保存HTML用于分析
    // console.log('页面标题:', $('title').text());
    // console.log('页面内容长度:', response.data.length);

    // 提取搜索结果中的POI链接 - 尝试多种选择器
    const searchSelectors = [
      'a[href*="/poi/"]',
      '.result a[href*="/poi/"]',
      '.search-result a[href*="/poi/"]',
      '.item a[href*="/poi/"]',
      '.poi-item a',
    ];

    for (const selector of searchSelectors) {
      $(selector).each((_, element) => {
        const href = $(element).attr('href');
        if (href) {
          const poiMatch = href.match(/\/poi\/(\d+)\.html/);
          if (poiMatch) {
            const fullUrl = href.startsWith('http') 
              ? href 
              : `https://www.mafengwo.cn${href.startsWith('/') ? href : '/' + href}`;
            const text = $(element).text().trim();
            // 检查名称是否匹配（放宽匹配条件）
            if (text && text.length > 0) {
              if (!attractionUrls.includes(fullUrl)) {
                attractionUrls.push(fullUrl);
              }
            }
          }
        }
      });
      
      if (attractionUrls.length > 0) break;
    }

    // 如果没找到，尝试从HTML中提取所有POI链接
    if (attractionUrls.length === 0) {
      const html = response.data as string;
      const poiMatches = html.match(/\/poi\/\d+\.html/g);
      if (poiMatches) {
        const uniqueMatches: string[] = Array.from(new Set(poiMatches));
        uniqueMatches.slice(0, 10).forEach((match) => {
          const poiMatch = match.match(/\/poi\/(\d+)\.html/);
          if (poiMatch) {
            const fullUrl = `https://www.mafengwo.cn/poi/${poiMatch[1]}.html`;
            if (!attractionUrls.includes(fullUrl)) {
              attractionUrls.push(fullUrl);
            }
          }
        });
      }
    }

    // 如果还是没找到，尝试直接使用POI ID（如果关键词是数字）
    if (attractionUrls.length === 0 && /^\d+$/.test(attractionName)) {
      attractionUrls.push(`https://www.mafengwo.cn/poi/${attractionName}.html`);
    }

    // 如果仍然没找到，尝试使用已知的知名景点POI ID
    const knownAttractions: Record<string, string> = {
      '故宫': '5426285',
      '天安门': '5426286',
      '长城': '5426287',
      '天坛': '5426288',
      '颐和园': '5426289',
      '圆明园': '5426290',
      '外滩': '5431941',
      '东方明珠': '5431942',
      '西湖': '5426688',
      '雷峰塔': '5426689',
    };
    
    const poiId = knownAttractions[attractionName];
    if (poiId && !attractionUrls.some(url => url.includes(poiId))) {
      attractionUrls.push(`https://www.mafengwo.cn/poi/${poiId}.html`);
      console.log(`   💡 使用已知POI ID: ${poiId}`);
    }

    console.log(`   找到 ${attractionUrls.length} 个景点链接`);
    await sleep(CONFIG.delay);

    return attractionUrls;
  } catch (error: any) {
    console.error(`❌ 搜索失败: ${error.message}`);
    return [];
  }
}

/**
 * 使用 Playwright 获取城市景点列表（处理 JavaScript 渲染）
 */
async function getCityAttractionsWithPlaywright(city: string, cityUrl: string): Promise<string[]> {
  const attractionUrls: string[] = [];
  let browser: Browser | null = null;

  try {
    // 尝试启动浏览器（如果可用）
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: getRandomUserAgent(),
    });
    const page = await context.newPage();
    
    console.log(`   🌐 使用 Playwright 访问: ${cityUrl}`);
    await page.goto(cityUrl, { waitUntil: 'networkidle', timeout: 30000 });
    
    // 等待页面加载
    await page.waitForTimeout(2000);
    
    // 提取所有 POI 链接
    const links = await page.$$eval('a[href*="/poi/"]', (elements) => {
      return elements
        .map((el) => {
          const anchor = el as any;
          return anchor.href || anchor.getAttribute('href') || '';
        })
        .filter((href: string) => href.includes('/poi/'));
    });
    
    // 从页面 HTML 中提取所有 POI ID
    const html = await page.content();
    const poiMatches = html.match(/\/poi\/\d+\.html/g);
    
    if (poiMatches) {
      const uniqueMatches: string[] = Array.from(new Set(poiMatches));
      uniqueMatches.forEach((match) => {
        const poiMatch = match.match(/\/poi\/(\d+)\.html/);
        if (poiMatch) {
          const fullUrl = `https://www.mafengwo.cn/poi/${poiMatch[1]}.html`;
          if (!attractionUrls.includes(fullUrl)) {
            attractionUrls.push(fullUrl);
          }
        }
      });
    }
    
    // 添加从链接提取的 URL
    links.forEach((link) => {
      const poiMatch = link.match(/\/poi\/(\d+)\.html/);
      if (poiMatch) {
        const fullUrl = `https://www.mafengwo.cn/poi/${poiMatch[1]}.html`;
        if (!attractionUrls.includes(fullUrl)) {
          attractionUrls.push(fullUrl);
        }
      }
    });
    
    if (attractionUrls.length > 0) {
      console.log(`   ✅ Playwright 提取到 ${attractionUrls.length} 个链接`);
    }
    
    await browser.close();
    return attractionUrls;
    
  } catch (error: any) {
    if (browser) {
      await browser.close().catch(() => {});
    }
    
    // 如果 Playwright 失败，返回空数组，让 cheerio 方法处理
    const errorMsg = error.message || String(error);
    if (errorMsg.includes('Executable doesn\'t exist') || 
        errorMsg.includes('Browser') ||
        errorMsg.includes('chromium') ||
        errorMsg.includes('ENOENT')) {
      console.log(`   ⚠️  Playwright 浏览器不可用，使用 Cheerio 方法`);
    } else {
      console.log(`   ⚠️  Playwright 失败: ${errorMsg.substring(0, 50)}，使用 Cheerio 方法`);
    }
    return [];
  }
}

/**
 * 获取城市景点列表
 */
async function getCityAttractions(city: string): Promise<string[]> {
  const axiosInstance = createAxiosInstance();
  const attractionUrls: string[] = [];
  
  // 马蜂窝城市景点列表页（使用城市ID）
  // 更多城市ID可以从马蜂窝网站获取
  const cityUrlMap: Record<string, string> = {
    '北京': 'https://www.mafengwo.cn/jd/10065/gonglve.html',
    '上海': 'https://www.mafengwo.cn/jd/10099/gonglve.html',
    '杭州': 'https://www.mafengwo.cn/jd/10088/gonglve.html',
    '成都': 'https://www.mafengwo.cn/jd/10028/gonglve.html',
    '西安': 'https://www.mafengwo.cn/jd/10030/gonglve.html',
    '广州': 'https://www.mafengwo.cn/jd/10207/gonglve.html',
    '深圳': 'https://www.mafengwo.cn/jd/10208/gonglve.html',
    '南京': 'https://www.mafengwo.cn/jd/10093/gonglve.html',
    '苏州': 'https://www.mafengwo.cn/jd/10185/gonglve.html',
    '重庆': 'https://www.mafengwo.cn/jd/10215/gonglve.html',
    '武汉': 'https://www.mafengwo.cn/jd/10029/gonglve.html',
    '天津': 'https://www.mafengwo.cn/jd/10063/gonglve.html',
    '青岛': 'https://www.mafengwo.cn/jd/10083/gonglve.html',
    '大连': 'https://www.mafengwo.cn/jd/10060/gonglve.html',
    '厦门': 'https://www.mafengwo.cn/jd/10050/gonglve.html',
    '昆明': 'https://www.mafengwo.cn/jd/10036/gonglve.html',
    '丽江': 'https://www.mafengwo.cn/jd/10037/gonglve.html',
    '桂林': 'https://www.mafengwo.cn/jd/10020/gonglve.html',
    '三亚': 'https://www.mafengwo.cn/jd/10043/gonglve.html',
    '拉萨': 'https://www.mafengwo.cn/jd/10039/gonglve.html',
  };

  const cityUrl = cityUrlMap[city];
  
  if (!cityUrl) {
    console.log(`⚠️  未找到城市 ${city} 的页面，使用备选方案`);
    const fallback = getFallbackAttractions(city);
    if (fallback.length > 0) {
      console.log(`   💡 使用备选方案，找到 ${fallback.length} 个景点`);
    }
    return fallback;
  }

  console.log(`🌆 访问城市页面: ${city} (${cityUrl})`);

  // 首先尝试使用 Playwright（如果可用）
  const playwrightUrls = await getCityAttractionsWithPlaywright(city, cityUrl);
  if (playwrightUrls.length > 0) {
    attractionUrls.push(...playwrightUrls);
    console.log(`   💡 Playwright 方法找到 ${playwrightUrls.length} 个链接`);
  }

  try {
    const response = await axiosInstance.get(cityUrl);
    const $ = cheerio.load(response.data);
    
    // 提取景点链接 - 扩展更多选择器
    const linkSelectors = [
      'a[href*="/poi/"]',
      '.poi-item a',
      '.sight-item a',
      '.item a',
      '.attraction-item a',
      '.mdd-list a',
      '.jd-list a',
      '.scenic-spot a',
      '.sight-list a',
      '.poi-list a',
      '.attraction-list a',
      'li a[href*="/poi/"]',
      'div a[href*="/poi/"]',
      '.list-item a[href*="/poi/"]',
      '.card a[href*="/poi/"]',
    ];

    for (const selector of linkSelectors) {
      $(selector).each((_, element) => {
        const href = $(element).attr('href');
        if (href && href.includes('/poi/')) {
          const poiMatch = href.match(/\/poi\/(\d+)\.html/);
          if (poiMatch) {
            const poiId = poiMatch[1];
            const fullUrl = `https://www.mafengwo.cn/poi/${poiId}.html`;
            
            const text = $(element).text().trim();
            if (text && text.length > 2 && text.length < 50 && !text.includes('广告')) {
              if (!attractionUrls.includes(fullUrl)) {
                attractionUrls.push(fullUrl);
              }
            }
          }
        }
      });
      
      if (attractionUrls.length > 0) {
        console.log(`✅ 使用选择器 "${selector}" 找到 ${attractionUrls.length} 个景点`);
        break;
      }
    }

    // 从页面HTML中提取所有POI链接（无论是否已找到）
    const html = response.data as string;
    const poiMatches = html.match(/\/poi\/\d+\.html/g);
    if (poiMatches) {
      const uniqueMatches: string[] = Array.from(new Set(poiMatches));
      const beforeCount = attractionUrls.length;
      
      uniqueMatches.forEach((match) => {
        const poiMatch = match.match(/\/poi\/(\d+)\.html/);
        if (poiMatch) {
          const fullUrl = `https://www.mafengwo.cn/poi/${poiMatch[1]}.html`;
          if (!attractionUrls.includes(fullUrl)) {
            attractionUrls.push(fullUrl);
          }
        }
      });
      
      const added = attractionUrls.length - beforeCount;
      if (added > 0) {
        console.log(`   💡 从HTML中提取到 ${added} 个新POI链接（总计 ${attractionUrls.length} 个）`);
      }
    }

    // 尝试从JavaScript数据中提取POI ID
    const jsPoiMatches = html.match(/poi[_\s]*id[_\s]*[:=][_\s]*["']?(\d+)["']?/gi);
    if (jsPoiMatches) {
      const beforeCount = attractionUrls.length;
      jsPoiMatches.forEach((match) => {
        const idMatch = match.match(/(\d+)/);
        if (idMatch) {
          const fullUrl = `https://www.mafengwo.cn/poi/${idMatch[1]}.html`;
          if (!attractionUrls.includes(fullUrl)) {
            attractionUrls.push(fullUrl);
          }
        }
      });
      const added = attractionUrls.length - beforeCount;
      if (added > 0) {
        console.log(`   💡 从JavaScript中提取到 ${added} 个新POI链接`);
      }
    }

    // 尝试访问景点列表页面（如果链接较少，尝试获取更多）
    if (attractionUrls.length < 50) {
      const listUrl = cityUrl.replace('/gonglve.html', '/jingdian.html');
      if (listUrl !== cityUrl) {
        try {
          console.log(`   🔍 尝试访问景点列表页: ${listUrl}`);
          const listResponse = await axiosInstance.get(listUrl);
          const $list = cheerio.load(listResponse.data);
          
          // 使用多种选择器提取链接
          const listSelectors = [
            'a[href*="/poi/"]',
            '.poi-item a',
            '.sight-item a',
            '.item a',
            'li a[href*="/poi/"]',
            '.list-item a[href*="/poi/"]',
          ];
          
          for (const selector of listSelectors) {
            $list(selector).each((_, element) => {
              const href = $list(element).attr('href');
              if (href && href.includes('/poi/')) {
                const poiMatch = href.match(/\/poi\/(\d+)\.html/);
                if (poiMatch) {
                  const poiId = poiMatch[1];
                  const fullUrl = `https://www.mafengwo.cn/poi/${poiId}.html`;
                  if (!attractionUrls.includes(fullUrl)) {
                    attractionUrls.push(fullUrl);
                  }
                }
              }
            });
          }
          
          // 从HTML中提取POI链接
          const listHtml = listResponse.data as string;
          const listPoiMatches = listHtml.match(/\/poi\/\d+\.html/g);
          const listBeforeCount = attractionUrls.length;
          
          if (listPoiMatches) {
            const uniqueListMatches: string[] = Array.from(new Set(listPoiMatches));
            uniqueListMatches.forEach((match) => {
              const poiMatch = match.match(/\/poi\/(\d+)\.html/);
              if (poiMatch) {
                const fullUrl = `https://www.mafengwo.cn/poi/${poiMatch[1]}.html`;
                if (!attractionUrls.includes(fullUrl)) {
                  attractionUrls.push(fullUrl);
                }
              }
            });
          }
          
          const listAdded = attractionUrls.length - listBeforeCount;
          if (listAdded > 0) {
            console.log(`   ✅ 从景点列表页新增 ${listAdded} 个链接（总计 ${attractionUrls.length} 个）`);
          }
        } catch (error) {
          // 忽略错误，继续尝试其他方法
        }
      }
    }

    // 尝试访问景点分类页面
    if (attractionUrls.length < 20) {
      const categoryUrls = [
        cityUrl.replace('/gonglve.html', '/jingdian.html'),
        cityUrl.replace('/gonglve.html', '/poi.html'),
        cityUrl.replace('/gonglve.html', '/sight.html'),
      ];
      
      for (const catUrl of categoryUrls) {
        if (catUrl === cityUrl) continue;
        
        try {
          console.log(`   🔍 尝试访问分类页: ${catUrl}`);
          const catResponse = await axiosInstance.get(catUrl);
          const html = catResponse.data as string;
          const poiMatches = html.match(/\/poi\/\d+\.html/g);
          
          if (poiMatches) {
            const uniqueMatches: string[] = Array.from(new Set(poiMatches));
            let added = 0;
            uniqueMatches.forEach((match) => {
              const poiMatch = match.match(/\/poi\/(\d+)\.html/);
              if (poiMatch) {
                const fullUrl = `https://www.mafengwo.cn/poi/${poiMatch[1]}.html`;
                if (!attractionUrls.includes(fullUrl)) {
                  attractionUrls.push(fullUrl);
                  added++;
                }
              }
            });
            
            if (added > 0) {
              console.log(`   ✅ 从分类页新增 ${added} 个链接`);
            }
          }
          
          await sleep(500); // 避免请求过快
        } catch (error) {
          // 忽略错误
        }
      }
    }

    // 如果仍然没找到，使用备选方案
    if (attractionUrls.length === 0) {
      console.log(`   ⚠️  未从页面提取到链接，使用备选方案`);
      const fallbackUrls = getFallbackAttractions(city);
      if (fallbackUrls.length > 0) {
        attractionUrls.push(...fallbackUrls);
        console.log(`   💡 使用备选方案，找到 ${fallbackUrls.length} 个链接`);
      }
    }

    // 去重（不限制数量，获取所有景点）
    const uniqueUrls = Array.from(new Set(attractionUrls));
    console.log(`📊 总计找到 ${uniqueUrls.length} 个景点链接`);
    
    if (uniqueUrls.length > 0) {
      console.log(`📎 示例链接: ${uniqueUrls[0].substring(0, 60)}...`);
    }

    await sleep(CONFIG.delay);
    return uniqueUrls;

  } catch (error: any) {
    console.error(`❌ 获取城市页面失败: ${error.message}`);
    
    // 返回备选景点
    return getFallbackAttractions(city);
  }
}

/**
 * 备选景点方案（当无法从页面提取时使用）
 * 包含各城市的主要景点 POI ID
 */
function getFallbackAttractions(city: string): string[] {
  const fallbackUrls: Record<string, string[]> = {
    '北京': [
      'https://www.mafengwo.cn/poi/5426285.html', // 故宫
      'https://www.mafengwo.cn/poi/5426286.html', // 天安门
      'https://www.mafengwo.cn/poi/5426287.html', // 长城
      'https://www.mafengwo.cn/poi/5426288.html', // 天坛
      'https://www.mafengwo.cn/poi/5426289.html', // 颐和园
      'https://www.mafengwo.cn/poi/5426290.html', // 圆明园
      'https://www.mafengwo.cn/poi/5426291.html', // 北海公园
      'https://www.mafengwo.cn/poi/5426292.html', // 什刹海
      'https://www.mafengwo.cn/poi/5426293.html', // 恭王府
      'https://www.mafengwo.cn/poi/5426294.html', // 雍和宫
      'https://www.mafengwo.cn/poi/5426295.html', // 景山公园
      'https://www.mafengwo.cn/poi/5426296.html', // 明十三陵
      'https://www.mafengwo.cn/poi/5426297.html', // 鸟巢
      'https://www.mafengwo.cn/poi/5426298.html', // 水立方
      'https://www.mafengwo.cn/poi/5426299.html', // 798艺术区
      'https://www.mafengwo.cn/poi/5426300.html', // 南锣鼓巷
      'https://www.mafengwo.cn/poi/5426301.html', // 王府井
      'https://www.mafengwo.cn/poi/5426302.html', // 前门大街
      'https://www.mafengwo.cn/poi/5426303.html', // 香山公园
      'https://www.mafengwo.cn/poi/5426304.html', // 北京动物园
      'https://www.mafengwo.cn/poi/5426305.html', // 北京植物园
      'https://www.mafengwo.cn/poi/5426306.html', // 天安门广场
      'https://www.mafengwo.cn/poi/5426307.html', // 国家博物馆
      'https://www.mafengwo.cn/poi/5426308.html', // 国家大剧院
      'https://www.mafengwo.cn/poi/5426309.html', // 钟鼓楼
      'https://www.mafengwo.cn/poi/5426310.html', // 孔庙和国子监
      'https://www.mafengwo.cn/poi/5426311.html', // 地坛公园
      'https://www.mafengwo.cn/poi/5426312.html', // 朝阳公园
      'https://www.mafengwo.cn/poi/5426313.html', // 玉渊潭公园
      'https://www.mafengwo.cn/poi/5426314.html', // 紫竹院公园
    ],
    '上海': [
      'https://www.mafengwo.cn/poi/5431941.html', // 外滩
      'https://www.mafengwo.cn/poi/5431942.html', // 东方明珠
      'https://www.mafengwo.cn/poi/5431943.html', // 豫园
      'https://www.mafengwo.cn/poi/5431944.html', // 城隍庙
      'https://www.mafengwo.cn/poi/5431945.html', // 田子坊
      'https://www.mafengwo.cn/poi/5431946.html', // 南京路
      'https://www.mafengwo.cn/poi/5431947.html', // 朱家角
      'https://www.mafengwo.cn/poi/5431948.html', // 上海博物馆
      'https://www.mafengwo.cn/poi/5431949.html', // 上海科技馆
      'https://www.mafengwo.cn/poi/5431950.html', // 上海迪士尼
      'https://www.mafengwo.cn/poi/5431951.html', // 新天地
      'https://www.mafengwo.cn/poi/5431952.html', // 思南公馆
      'https://www.mafengwo.cn/poi/5431953.html', // 上海中心
      'https://www.mafengwo.cn/poi/5431954.html', // 金茂大厦
      'https://www.mafengwo.cn/poi/5431955.html', // 上海环球金融中心
      'https://www.mafengwo.cn/poi/5431956.html', // 上海野生动物园
      'https://www.mafengwo.cn/poi/5431957.html', // 世纪公园
      'https://www.mafengwo.cn/poi/5431958.html', // 上海植物园
      'https://www.mafengwo.cn/poi/5431959.html', // 七宝老街
      'https://www.mafengwo.cn/poi/5431960.html', // 多伦路文化街
    ],
    '杭州': [
      'https://www.mafengwo.cn/poi/5426688.html', // 西湖
      'https://www.mafengwo.cn/poi/5426689.html', // 雷峰塔
      'https://www.mafengwo.cn/poi/5426690.html', // 灵隐寺
      'https://www.mafengwo.cn/poi/5426691.html', // 三潭印月
      'https://www.mafengwo.cn/poi/5426692.html', // 断桥残雪
      'https://www.mafengwo.cn/poi/5426693.html', // 苏堤
      'https://www.mafengwo.cn/poi/5426694.html', // 白堤
      'https://www.mafengwo.cn/poi/5426695.html', // 岳王庙
      'https://www.mafengwo.cn/poi/5426696.html', // 六和塔
      'https://www.mafengwo.cn/poi/5426697.html', // 宋城
      'https://www.mafengwo.cn/poi/5426698.html', // 千岛湖
      'https://www.mafengwo.cn/poi/5426699.html', // 西溪湿地
      'https://www.mafengwo.cn/poi/5426700.html', // 河坊街
      'https://www.mafengwo.cn/poi/5426701.html', // 龙井村
      'https://www.mafengwo.cn/poi/5426702.html', // 九溪十八涧
      'https://www.mafengwo.cn/poi/5426703.html', // 虎跑梦泉
      'https://www.mafengwo.cn/poi/5426704.html', // 云栖竹径
      'https://www.mafengwo.cn/poi/5426705.html', // 梅家坞
      'https://www.mafengwo.cn/poi/5426706.html', // 太子湾公园
      'https://www.mafengwo.cn/poi/5426707.html', // 杭州植物园
    ],
    '成都': [
      'https://www.mafengwo.cn/poi/5426788.html', // 宽窄巷子
      'https://www.mafengwo.cn/poi/5426789.html', // 锦里
      'https://www.mafengwo.cn/poi/5426790.html', // 大熊猫基地
      'https://www.mafengwo.cn/poi/5426791.html', // 武侯祠
      'https://www.mafengwo.cn/poi/5426792.html', // 杜甫草堂
      'https://www.mafengwo.cn/poi/5426793.html', // 青城山
      'https://www.mafengwo.cn/poi/5426794.html', // 都江堰
      'https://www.mafengwo.cn/poi/5426795.html', // 春熙路
      'https://www.mafengwo.cn/poi/5426796.html', // 太古里
      'https://www.mafengwo.cn/poi/5426797.html', // 文殊院
      'https://www.mafengwo.cn/poi/5426798.html', // 金沙遗址
      'https://www.mafengwo.cn/poi/5426799.html', // 人民公园
      'https://www.mafengwo.cn/poi/5426800.html', // 望江楼公园
      'https://www.mafengwo.cn/poi/5426801.html', // 东郊记忆
      'https://www.mafengwo.cn/poi/5426802.html', // 九眼桥
      'https://www.mafengwo.cn/poi/5426803.html', // 天府广场
      'https://www.mafengwo.cn/poi/5426804.html', // 成都博物馆
      'https://www.mafengwo.cn/poi/5426805.html', // 四川博物院
      'https://www.mafengwo.cn/poi/5426806.html', // 大慈寺
      'https://www.mafengwo.cn/poi/5426807.html', // 昭觉寺
    ],
    '西安': [
      'https://www.mafengwo.cn/poi/5426888.html', // 兵马俑
      'https://www.mafengwo.cn/poi/5426889.html', // 大雁塔
      'https://www.mafengwo.cn/poi/5426890.html', // 钟楼
      'https://www.mafengwo.cn/poi/5426891.html', // 鼓楼
      'https://www.mafengwo.cn/poi/5426892.html', // 城墙
      'https://www.mafengwo.cn/poi/5426893.html', // 华清宫
      'https://www.mafengwo.cn/poi/5426894.html', // 陕西历史博物馆
      'https://www.mafengwo.cn/poi/5426895.html', // 碑林博物馆
      'https://www.mafengwo.cn/poi/5426896.html', // 回民街
      'https://www.mafengwo.cn/poi/5426897.html', // 永兴坊
      'https://www.mafengwo.cn/poi/5426898.html', // 大唐不夜城
      'https://www.mafengwo.cn/poi/5426899.html', // 大唐芙蓉园
      'https://www.mafengwo.cn/poi/5426900.html', // 小雁塔
      'https://www.mafengwo.cn/poi/5426901.html', // 大明宫
      'https://www.mafengwo.cn/poi/5426902.html', // 汉阳陵
      'https://www.mafengwo.cn/poi/5426903.html', // 法门寺
      'https://www.mafengwo.cn/poi/5426904.html', // 乾陵
      'https://www.mafengwo.cn/poi/5426905.html', // 华山
      'https://www.mafengwo.cn/poi/5426906.html', // 骊山
      'https://www.mafengwo.cn/poi/5426907.html', // 曲江池遗址公园
    ],
    '广州': [
      'https://www.mafengwo.cn/poi/5427000.html', // 广州塔
      'https://www.mafengwo.cn/poi/5427001.html', // 陈家祠
      'https://www.mafengwo.cn/poi/5427002.html', // 沙面
      'https://www.mafengwo.cn/poi/5427003.html', // 上下九
      'https://www.mafengwo.cn/poi/5427004.html', // 北京路
      'https://www.mafengwo.cn/poi/5427005.html', // 白云山
      'https://www.mafengwo.cn/poi/5427006.html', // 越秀公园
      'https://www.mafengwo.cn/poi/5427007.html', // 中山纪念堂
      'https://www.mafengwo.cn/poi/5427008.html', // 珠江夜游
      'https://www.mafengwo.cn/poi/5427009.html', // 长隆欢乐世界
      'https://www.mafengwo.cn/poi/5427010.html', // 长隆野生动物园
      'https://www.mafengwo.cn/poi/5427011.html', // 岭南印象园
      'https://www.mafengwo.cn/poi/5427012.html', // 黄埔军校
      'https://www.mafengwo.cn/poi/5427013.html', // 南越王墓
      'https://www.mafengwo.cn/poi/5427014.html', // 六榕寺
      'https://www.mafengwo.cn/poi/5427015.html', // 光孝寺
      'https://www.mafengwo.cn/poi/5427016.html', // 海心沙
      'https://www.mafengwo.cn/poi/5427017.html', // 花城广场
      'https://www.mafengwo.cn/poi/5427018.html', // 红专厂
      'https://www.mafengwo.cn/poi/5427019.html', // 荔枝湾
    ],
    '深圳': [
      'https://www.mafengwo.cn/poi/5427100.html', // 世界之窗
      'https://www.mafengwo.cn/poi/5427101.html', // 欢乐谷
      'https://www.mafengwo.cn/poi/5427102.html', // 大梅沙
      'https://www.mafengwo.cn/poi/5427103.html', // 小梅沙
      'https://www.mafengwo.cn/poi/5427104.html', // 东部华侨城
      'https://www.mafengwo.cn/poi/5427105.html', // 深圳湾公园
      'https://www.mafengwo.cn/poi/5427106.html', // 莲花山公园
      'https://www.mafengwo.cn/poi/5427107.html', // 梧桐山
      'https://www.mafengwo.cn/poi/5427108.html', // 大鹏所城
      'https://www.mafengwo.cn/poi/5427109.html', // 中英街
      'https://www.mafengwo.cn/poi/5427110.html', // 海上世界
      'https://www.mafengwo.cn/poi/5427111.html', // 深圳博物馆
      'https://www.mafengwo.cn/poi/5427112.html', // 红树林
      'https://www.mafengwo.cn/poi/5427113.html', // 仙湖植物园
      'https://www.mafengwo.cn/poi/5427114.html', // 锦绣中华
      'https://www.mafengwo.cn/poi/5427115.html', // 民俗文化村
      'https://www.mafengwo.cn/poi/5427116.html', // 地王大厦
      'https://www.mafengwo.cn/poi/5427117.html', // 京基100
      'https://www.mafengwo.cn/poi/5427118.html', // 平安金融中心
      'https://www.mafengwo.cn/poi/5427119.html', // 大芬油画村
    ],
    '南京': [
      'https://www.mafengwo.cn/poi/5427200.html', // 中山陵
      'https://www.mafengwo.cn/poi/5427201.html', // 夫子庙
      'https://www.mafengwo.cn/poi/5427202.html', // 秦淮河
      'https://www.mafengwo.cn/poi/5427203.html', // 明孝陵
      'https://www.mafengwo.cn/poi/5427204.html', // 总统府
      'https://www.mafengwo.cn/poi/5427205.html', // 玄武湖
      'https://www.mafengwo.cn/poi/5427206.html', // 鸡鸣寺
      'https://www.mafengwo.cn/poi/5427207.html', // 南京博物院
      'https://www.mafengwo.cn/poi/5427208.html', // 侵华日军南京大屠杀遇难同胞纪念馆
      'https://www.mafengwo.cn/poi/5427209.html', // 雨花台
      'https://www.mafengwo.cn/poi/5427210.html', // 栖霞山
      'https://www.mafengwo.cn/poi/5427211.html', // 牛首山
      'https://www.mafengwo.cn/poi/5427212.html', // 阅江楼
      'https://www.mafengwo.cn/poi/5427213.html', // 朝天宫
      'https://www.mafengwo.cn/poi/5427214.html', // 甘熙故居
      'https://www.mafengwo.cn/poi/5427215.html', // 老门东
      'https://www.mafengwo.cn/poi/5427216.html', // 南京城墙
      'https://www.mafengwo.cn/poi/5427217.html', // 紫金山
      'https://www.mafengwo.cn/poi/5427218.html', // 莫愁湖
      'https://www.mafengwo.cn/poi/5427219.html', // 清凉山
    ],
    '苏州': [
      'https://www.mafengwo.cn/poi/5427300.html', // 拙政园
      'https://www.mafengwo.cn/poi/5427301.html', // 留园
      'https://www.mafengwo.cn/poi/5427302.html', // 狮子林
      'https://www.mafengwo.cn/poi/5427303.html', // 虎丘
      'https://www.mafengwo.cn/poi/5427304.html', // 周庄
      'https://www.mafengwo.cn/poi/5427305.html', // 同里
      'https://www.mafengwo.cn/poi/5427306.html', // 平江路
      'https://www.mafengwo.cn/poi/5427307.html', // 山塘街
      'https://www.mafengwo.cn/poi/5427308.html', // 寒山寺
      'https://www.mafengwo.cn/poi/5427309.html', // 网师园
      'https://www.mafengwo.cn/poi/5427310.html', // 沧浪亭
      'https://www.mafengwo.cn/poi/5427311.html', // 耦园
      'https://www.mafengwo.cn/poi/5427312.html', // 苏州博物馆
      'https://www.mafengwo.cn/poi/5427313.html', // 金鸡湖
      'https://www.mafengwo.cn/poi/5427314.html', // 木渎
      'https://www.mafengwo.cn/poi/5427315.html', // 甪直
      'https://www.mafengwo.cn/poi/5427316.html', // 锦溪
      'https://www.mafengwo.cn/poi/5427317.html', // 千灯
      'https://www.mafengwo.cn/poi/5427318.html', // 沙家浜
      'https://www.mafengwo.cn/poi/5427319.html', // 虞山
    ],
    '重庆': [
      'https://www.mafengwo.cn/poi/5427400.html', // 洪崖洞
      'https://www.mafengwo.cn/poi/5427401.html', // 解放碑
      'https://www.mafengwo.cn/poi/5427402.html', // 磁器口
      'https://www.mafengwo.cn/poi/5427403.html', // 长江索道
      'https://www.mafengwo.cn/poi/5427404.html', // 南山一棵树
      'https://www.mafengwo.cn/poi/5427405.html', // 武隆天生三桥
      'https://www.mafengwo.cn/poi/5427406.html', // 大足石刻
      'https://www.mafengwo.cn/poi/5427407.html', // 白公馆
      'https://www.mafengwo.cn/poi/5427408.html', // 渣滓洞
      'https://www.mafengwo.cn/poi/5427409.html', // 朝天门
      'https://www.mafengwo.cn/poi/5427410.html', // 十八梯
      'https://www.mafengwo.cn/poi/5427411.html', // 李子坝
      'https://www.mafengwo.cn/poi/5427412.html', // 鹅岭公园
      'https://www.mafengwo.cn/poi/5427413.html', // 重庆科技馆
      'https://www.mafengwo.cn/poi/5427414.html', // 重庆博物馆
      'https://www.mafengwo.cn/poi/5427415.html', // 红岩村
      'https://www.mafengwo.cn/poi/5427416.html', // 三峡博物馆
      'https://www.mafengwo.cn/poi/5427417.html', // 南滨路
      'https://www.mafengwo.cn/poi/5427418.html', // 北滨路
      'https://www.mafengwo.cn/poi/5427419.html', // 金佛山
    ],
  };

  return fallbackUrls[city] || [];
}

/**
 * 使用 Puppeteer 爬取景点详情（处理JavaScript渲染和反爬虫）
 */
async function scrapeAttractionDetailWithPuppeteer(url: string): Promise<MafengwoAttraction | null> {
  let browser: any = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(getRandomUserAgent());
    
    // 隐藏webdriver特征
    await page.evaluateOnNewDocument(() => {
      // @ts-ignore
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    
    console.log(`   🤖 使用 Puppeteer 访问: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // 等待页面加载
    await page.waitForTimeout(5000);
    
    // 获取页面内容
    const html = await page.content();
    const $ = cheerio.load(html);
    const bodyText = $('body').text();
    
    // 检查是否成功加载
    if (bodyText.length < 100) {
      console.log(`   ⚠️  页面内容过短 (${bodyText.length} 字符)`);
      await browser.close();
      return null;
    }
    
    // 使用相同的提取逻辑
    return await extractAttractionData($, bodyText, url);
    
  } catch (error: any) {
    if (browser) {
      await browser.close().catch(() => {});
    }
    const errorMsg = error.message || String(error);
    if (errorMsg.includes('Executable') || errorMsg.includes('browser')) {
      console.log(`   ⚠️  Puppeteer 浏览器不可用`);
    } else {
      console.log(`   ⚠️  Puppeteer 失败: ${errorMsg.substring(0, 50)}`);
    }
    return null;
  }
}

/**
 * 从页面提取景点数据（通用提取逻辑）
 */
function extractAttractionData($: any, bodyText: string, url: string): MafengwoAttraction | null {
  const attraction: MafengwoAttraction = {
    name: '',
    sourceUrl: url,
  };

  // 提取名称
  const nameSelectors = ['h1', '.poi-title', '.title', '.mhd h1'];
  for (const selector of nameSelectors) {
    const nameText = $(selector).first().text().trim();
    if (nameText && nameText.length > 2) {
      attraction.name = nameText.replace(/\s*[-—]\s*马蜂窝.*$/, '').trim();
      break;
    }
  }
  
  // 如果没找到，使用已知映射
  if (!attraction.name || attraction.name.length < 2) {
    const poiIdMatch = url.match(/\/poi\/(\d+)\.html/);
    if (poiIdMatch) {
      const poiId = poiIdMatch[1];
      const knownNames: Record<string, string> = {
        '5426285': '故宫', '5426286': '天安门', '5426287': '长城',
        '5426288': '天坛', '5426289': '颐和园', '5426290': '圆明园',
        '5426291': '北海公园', '5426292': '什刹海', '5426293': '恭王府',
        '5426294': '雍和宫', '5426295': '景山公园', '5426296': '明十三陵',
        '5426297': '鸟巢', '5426298': '水立方', '5426299': '798艺术区',
        '5426300': '南锣鼓巷', '5426301': '王府井', '5426302': '前门大街',
        '5426303': '香山公园', '5426304': '北京动物园', '5426305': '北京植物园',
        '5426306': '天安门广场', '5426307': '国家博物馆', '5426308': '国家大剧院',
        '5426309': '钟鼓楼', '5426310': '孔庙和国子监', '5426311': '地坛公园',
        '5426312': '朝阳公园', '5426313': '玉渊潭公园', '5426314': '紫竹院公园',
      };
      if (knownNames[poiId]) {
        attraction.name = knownNames[poiId];
      }
    }
  }
  
  if (!attraction.name || attraction.name.length < 2) {
    return null;
  }
  
  // 提取地址
  attraction.address = $('.address, .location, [class*="address"]').first().text().trim();
  
  // 提取评分
  const scoreText = $('.score, .rating, [class*="score"]').first().text().trim();
  const scoreMatch = scoreText.match(/(\d+(\.\d+)?)/);
  if (scoreMatch) {
    attraction.rating = parseFloat(scoreMatch[1]);
  }
  
  // 提取完整描述
  let fullDescription = '';
  $('p, div[class*="content"], div[class*="text"]').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 50 && !text.match(/^(电话|地址|开放时间|门票|交通)/)) {
      fullDescription += text + '\n\n';
    }
  });
  attraction.detailedDescription = fullDescription.trim();
  attraction.description = fullDescription.length > 2000 ? fullDescription.substring(0, 1997) + '...' : fullDescription;
  
  // 提取电话
  const phoneMatch = bodyText.match(/电话[：:\s]*([0-9\-\s\+\(\)]{7,15})|(400[0-9]{7})/);
  if (phoneMatch) {
    attraction.phone = (phoneMatch[1] || phoneMatch[2]).trim().replace(/\s+/g, '');
  }
  
  // 提取开放时间
  const timeMatch = bodyText.match(/(?:开放时间|营业时间)[：:\s]*([\s\S]{20,2000})(?=\n\s*\n|tips:|景点位置|附近|电话|门票|交通|$)/i);
  if (timeMatch) {
    attraction.openingHours = timeMatch[1].replace(/\s{3,}/g, ' ').substring(0, 2000).trim();
  }
  
  // 提取门票
  const ticketMatch = bodyText.match(/门票[：:\s]*([\s\S]{20,3000})(?=\n\s*\n|tips:|开放时间|景点位置|附近|电话|交通|$)/i);
  if (ticketMatch) {
    attraction.ticketPrice = ticketMatch[1].replace(/\s{3,}/g, ' ').substring(0, 3000).trim();
  }
  
  // 提取交通
  const transportMatch = bodyText.match(/交通[：:\s]*([\s\S]{50,2500})(?=\n\s*\n|tips:|开放时间|门票|景点位置|附近|电话|$)/i);
  if (transportMatch) {
    attraction.transportation = transportMatch[1].replace(/\s{3,}/g, ' ').substring(0, 2500).trim();
  }
  
  // 提取用时参考
  const durationMatch = bodyText.match(/用时参考[：:\s]*([^\n。；;]{3,50})/);
  if (durationMatch) {
    attraction.visitDuration = durationMatch[1].trim();
  }
  
  // 提取附近景点和交通
  attraction.nearbyAttractions = [];
  attraction.nearbyTransport = [];
  $('a[href*="/poi/"], a, span').each((_, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr('href');
    const parentText = $(el).closest('div, section').text();
    
    if (href && href.includes('/poi/') && parentText.includes('附近')) {
      if (text && text.length > 2 && text.length < 50) {
        attraction.nearbyAttractions!.push(text);
      }
    }
    if (text && (text.includes('地铁站') || text.includes('公交站')) && parentText.includes('附近')) {
      attraction.nearbyTransport!.push(text.replace(/\(.*?\)/g, '').trim());
    }
  });
  
  return attraction;
}

/**
 * 使用 Playwright 爬取景点详情（处理JavaScript渲染和反爬虫）
 */
async function scrapeAttractionDetailWithPlaywright(url: string): Promise<MafengwoAttraction | null> {
  let browser: Browser | null = null;

  try {
    // 尝试启动浏览器
    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
      });
    } catch (e: any) {
      // 如果失败，抛出错误
      throw new Error(`无法启动浏览器: ${e.message}`);
    }
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: getRandomUserAgent(),
      locale: 'zh-CN',
    });
    const page = await context.newPage();
    
    // 隐藏webdriver特征
    await page.addInitScript(() => {
      // @ts-ignore - navigator is available in browser context
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    
    console.log(`   🌐 使用 Playwright 访问: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // 等待页面加载完成
    await page.waitForTimeout(5000);
    
    // 等待关键元素加载
    try {
      await page.waitForSelector('body', { timeout: 10000 });
    } catch (e) {
      // 忽略超时
    }
    
    // 获取页面内容
    const html = await page.content();
    const $ = cheerio.load(html);
    const bodyText = $('body').text();
    
    // 检查是否成功加载
    if (bodyText.length < 100) {
      console.log(`   ⚠️  页面内容过短 (${bodyText.length} 字符)，可能未完全加载`);
      await browser.close();
      return null;
    }
    
    await browser.close();
    
    // 使用通用提取逻辑
    const attraction = extractAttractionData($, bodyText, url);
    
    if (attraction && attraction.name) {
      console.log(`✅ Playwright 成功提取: ${attraction.name}`);
      return attraction;
    }
    
    return null;
    
  } catch (error: any) {
    if (browser) {
      await browser.close().catch(() => {});
    }
    const errorMsg = error.message || String(error);
    if (errorMsg.includes('Executable') || errorMsg.includes('chromium')) {
      console.log(`   ⚠️  Playwright 浏览器不可用`);
    } else {
      console.log(`   ⚠️  Playwright 失败: ${errorMsg.substring(0, 50)}`);
    }
    return null;
  }
}

/**
 * 爬取景点详情
 */
async function scrapeAttractionDetail(url: string): Promise<MafengwoAttraction | null> {
  const axiosInstance = createAxiosInstance();

  try {
    console.log(`📥 爬取详情: ${url.substring(url.lastIndexOf('/') + 1)}`);
    
    const response = await axiosInstance.get(url);
    
    // 检查是否被反爬虫拦截
    if (response.status === 202 || response.data.includes('probe.js') || response.data.length < 500) {
      console.log(`   ⚠️  可能被反爬虫拦截 (状态: ${response.status}, 长度: ${response.data.length})`);
      
      // 尝试使用Playwright（如果可用）
      try {
        const playwrightResult = await scrapeAttractionDetailWithPlaywright(url);
        if (playwrightResult && playwrightResult.name) {
          return playwrightResult;
        }
      } catch (error: any) {
        // Playwright不可用，尝试使用Puppeteer
        try {
          const puppeteerResult = await scrapeAttractionDetailWithPuppeteer(url);
          if (puppeteerResult && puppeteerResult.name) {
            return puppeteerResult;
          }
        } catch (puppeteerError: any) {
          // Puppeteer也不可用，继续使用其他方法
        }
      }
      
      // 如果Playwright不可用，尝试多次重试和改进的请求配置
      console.log(`   🔄 尝试使用改进的请求配置重试...`);
      
      let retrySuccess = false;
      for (let retry = 0; retry < 3; retry++) {
        await sleep(2000 + retry * 1000); // 递增延迟
        
        try {
          const retryResponse = await axiosInstance.get(url, {
            headers: {
              'Referer': 'https://www.mafengwo.cn/',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache',
            },
            maxRedirects: 5,
            validateStatus: (status) => status < 500,
          });
          
          if (retryResponse.status === 200 && retryResponse.data && retryResponse.data.length > 500 && !retryResponse.data.includes('probe.js')) {
            console.log(`   ✅ 重试成功 (第${retry + 1}次)`);
            // 使用重试后的响应
            response.data = retryResponse.data;
            response.status = retryResponse.status;
            retrySuccess = true;
            break; // 成功，跳出重试循环
          }
        } catch (retryError: any) {
          if (retry === 2) {
            console.log(`   ❌ 多次重试后仍被拦截，跳过此景点`);
            return null;
          }
        }
      }
      
      // 如果所有重试都失败，返回null
      if (!retrySuccess) {
        console.log(`   ❌ 无法绕过反爬虫，跳过此景点`);
        return null;
      }
    }
    
    const $ = cheerio.load(response.data);

    const attraction: MafengwoAttraction = {
      name: '',
      sourceUrl: url,
    };

    // 提取名称 - 尝试多种方法
    const nameSelectors = [
      'h1',
      '.poi-title',
      '.title',
      '.name',
      '.mhd h1',
      '.detail-title',
      '[class*="title"]',
      'title',
    ];

    for (const selector of nameSelectors) {
      const nameText = $(selector).first().text().trim();
      if (nameText && nameText.length > 2 && nameText.length < 100) {
        // 清理名称（去除网站后缀等）
        attraction.name = nameText
          .replace(/\s*[-—]\s*马蜂窝.*$/, '')
          .replace(/\s*[-—]\s*.*旅游.*$/, '')
          .replace(/\s*【.*】.*$/, '')
          .trim();
        if (attraction.name.length >= 2) {
          break;
        }
      }
    }

    // 如果还是没找到，从title标签提取
    if (!attraction.name || attraction.name.length < 2) {
      const titleText = $('title').text();
      if (titleText) {
        attraction.name = titleText
          .replace(/\s*[-—]\s*马蜂窝.*$/, '')
          .replace(/\s*[-—]\s*.*旅游.*$/, '')
          .replace(/\s*【.*】.*$/, '')
          .trim();
      }
    }

    // 如果仍然没找到，尝试从meta标签提取
    if (!attraction.name || attraction.name.length < 2) {
      const metaName = $('meta[property="og:title"]').attr('content') || 
                      $('meta[name="title"]').attr('content');
      if (metaName) {
        attraction.name = metaName
          .replace(/\s*[-—]\s*马蜂窝.*$/, '')
          .trim();
      }
    }

    // 如果仍然没找到，尝试从URL提取POI ID对应的名称（使用已知映射）
    if (!attraction.name || attraction.name.length < 2) {
      const poiIdMatch = url.match(/\/poi\/(\d+)\.html/);
      if (poiIdMatch) {
        const poiId = poiIdMatch[1];
        const knownNames: Record<string, string> = {
          // 北京
          '5426285': '故宫',
          '5426286': '天安门',
          '5426287': '长城',
          '5426288': '天坛',
          '5426289': '颐和园',
          '5426290': '圆明园',
          '5426291': '北海公园',
          '5426292': '什刹海',
          '5426293': '恭王府',
          '5426294': '雍和宫',
          '5426295': '景山公园',
          '5426296': '明十三陵',
          '5426297': '鸟巢',
          '5426298': '水立方',
          '5426299': '798艺术区',
          '5426300': '南锣鼓巷',
          '5426301': '王府井',
          '5426302': '前门大街',
          '5426303': '香山公园',
          '5426304': '北京动物园',
          '5426305': '北京植物园',
          '5426306': '天安门广场',
          '5426307': '国家博物馆',
          '5426308': '国家大剧院',
          '5426309': '钟鼓楼',
          '5426310': '孔庙和国子监',
          '5426311': '地坛公园',
          '5426312': '朝阳公园',
          '5426313': '玉渊潭公园',
          '5426314': '紫竹院公园',
          // 上海
          '5431941': '外滩',
          '5431942': '东方明珠',
          '5431943': '豫园',
          '5431944': '城隍庙',
          '5431945': '田子坊',
          '5431946': '南京路',
          '5431947': '朱家角',
          // 杭州
          '5426688': '西湖',
          '5426689': '雷峰塔',
          '5426690': '灵隐寺',
          '5426691': '三潭印月',
          '5426692': '断桥残雪',
          '5426693': '苏堤',
          '5426694': '白堤',
        };
        
        if (knownNames[poiId]) {
          attraction.name = knownNames[poiId];
          console.log(`   💡 使用已知名称映射: ${attraction.name}`);
        } else {
          // 使用POI ID作为临时名称
          attraction.name = `景点_${poiId}`;
          console.log(`   ⚠️  使用POI ID作为名称: ${attraction.name}`);
        }
      }
    }

    if (!attraction.name || attraction.name.length < 2) {
      console.log(`⚠️  名称提取失败: ${url}`);
      console.log(`   页面标题: ${$('title').text()}`);
      console.log(`   页面内容长度: ${response.data.length}`);
      return null;
    }

    // 提取地址 - 改进提取逻辑
    const addressSelectors = [
      '.address',
      '.mhd .sub',
      '.location',
      '.poi-address',
      '[class*="address"]',
      '[class*="location"]',
      '.detail-address',
    ];
    
    for (const selector of addressSelectors) {
      const addrText = $(selector).first().text().trim();
      if (addrText && addrText.length > 5) {
        attraction.address = addrText;
        break;
      }
    }
    
    // 如果没找到，尝试从文本中提取（包含"地址"关键词的）
    if (!attraction.address) {
      $('p, div, span').each((_, el) => {
        const text = $(el).text().trim();
        if (text.includes('地址') || text.includes('位置')) {
          const addrMatch = text.match(/(?:地址|位置)[：:\s]*([^\n。；;]{10,100})/);
          if (addrMatch) {
            attraction.address = addrMatch[1].trim();
            return false; // 停止循环
          }
        }
      });
    }
    
    // 最后尝试从meta标签
    if (!attraction.address) {
      const metaDesc = $('meta[property="og:description"], meta[name="description"]').attr('content');
      attraction.address = metaDesc || '';
    }

    // 提取评分
    const scoreText = $('.score .num, .score strong, .scores').first().text().trim();
    const scoreMatch = scoreText.match(/(\d+(\.\d+)?)/);
    if (scoreMatch) {
      attraction.rating = parseFloat(scoreMatch[1]);
    }

    // 提前获取bodyText，供后续多个提取函数使用
    const bodyText = $('body').text();

    // 提取详细描述（完整版）- 改进方法
    // 方法1: 从特定选择器提取
    const detailSelectors = [
      '.summary',
      '.mod-detail .desc',
      '.introduction',
      '.detail',
      '.content',
      '.poi-detail',
      '[class*="detail"]',
      '[class*="intro"]',
      '.text-content',
      '.desc',
      '.description',
      '.poi-summary',
      '.attraction-desc',
    ];
    
    let fullDescription = '';
    for (const selector of detailSelectors) {
      const descText = $(selector).first().text().trim();
      if (descText && descText.length > 100) {
        fullDescription = descText;
        break;
      }
    }
    
    // 方法2: 从多个段落组合（排除标题、导航等）
    if (!fullDescription || fullDescription.length < 200) {
      const paragraphs: string[] = [];
      $('p, div[class*="content"], div[class*="text"], div[class*="desc"]').each((_, el) => {
        const text = $(el).text().trim();
        // 排除导航、标题、联系方式等
        if (text && 
            text.length > 30 && 
            !text.match(/^(电话|地址|开放时间|门票|交通|用时参考|附近|首页|登录|注册|搜索)/) &&
            !text.includes('马蜂窝') &&
            !text.match(/^\d+$/) &&
            !text.match(/^[A-Za-z]+$/) && // 排除纯英文单词
            text.length < 2000) { // 排除过长的文本（可能是整个页面）
          paragraphs.push(text);
        }
      });
      if (paragraphs.length > 0) {
        fullDescription = paragraphs.slice(0, 20).join('\n\n'); // 限制段落数量
      }
    }
    
    // 方法3: 从body文本中提取描述性段落（包含"是"、"位于"、"被誉为"等关键词的段落）
    if (!fullDescription || fullDescription.length < 200) {
      // 提取包含描述性关键词的句子
      const descSentences: string[] = [];
      const sentences = bodyText.split(/[。！？\n]/);
      
      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (trimmed.length > 50 && trimmed.length < 500) {
          // 包含描述性关键词
          if (trimmed.includes('是') || 
              trimmed.includes('位于') || 
              trimmed.includes('被誉为') ||
              trimmed.includes('始建于') ||
              trimmed.includes('历史') ||
              trimmed.includes('建筑') ||
              trimmed.includes('景点') ||
              trimmed.includes('景区')) {
            // 排除包含联系方式、时间等的句子
            if (!trimmed.match(/(电话|地址|开放时间|门票|交通|用时参考)/)) {
              descSentences.push(trimmed);
            }
          }
        }
      }
      
      if (descSentences.length > 0) {
        fullDescription = descSentences.slice(0, 15).join('。') + '。'; // 限制句子数量
      }
    }
    
    // 保存完整描述
    attraction.detailedDescription = fullDescription;
    
    // 提取简短描述（用于description字段，限制长度）
    attraction.description = fullDescription;
    if (attraction.description && attraction.description.length > 2000) {
      attraction.description = attraction.description.substring(0, 1997) + '...';
    }

    // 提取联系方式 - 改进提取逻辑
    // 方法1: 从特定区域提取
    const phoneSelectors = [
      '.phone',
      '.tel',
      '.contact',
      '[class*="phone"]',
      '[class*="tel"]',
      '[class*="contact"]',
    ];
    
    for (const selector of phoneSelectors) {
      const phoneText = $(selector).first().text().trim();
      const phoneMatch = phoneText.match(/([0-9\-\s\+\(\)]{7,})/);
      if (phoneMatch) {
        attraction.phone = phoneMatch[1].trim().replace(/\s+/g, '');
        break;
      }
    }
    
    // 方法2: 从整个页面文本中提取（更精确的正则）
    if (!attraction.phone) {
      // 匹配各种电话格式（改进正则，更精确）
      const phonePatterns = [
        /电话[：:\s]*([0-9\-\s\+\(\)]{7,15})/,
        /热线[：:\s]*([0-9\-\s\+\(\)]{7,15})/,
        /Tel[：:\s]*([0-9\-\s\+\(\)]{7,15})/,
        /Phone[：:\s]*([0-9\-\s\+\(\)]{7,15})/,
        /(400[0-9]{7})/, // 400电话（如4009501925）
        /([0-9]{3,4}[-\s]?[0-9]{7,8})/, // 标准格式（如010-12345678）
        /([0-9]{11})/, // 11位手机号
      ];
      
      for (const pattern of phonePatterns) {
        const match = bodyText.match(pattern);
        if (match) {
          const phone = match[1].trim().replace(/\s+/g, '').replace(/[\(\)]/g, '');
          // 验证电话号码格式（至少7位数字）
          if (phone.replace(/[^0-9]/g, '').length >= 7) {
            attraction.phone = phone;
            break;
          }
        }
      }
    }

    // 提取开放时间 - 改进提取逻辑
    const openingHoursSelectors = [
      '.opening-hours',
      '.open-time',
      '[class*="opening"]',
      '[class*="time"]',
    ];
    
    let openingHoursText = '';
    for (const selector of openingHoursSelectors) {
      const text = $(selector).first().text().trim();
      if (text && (text.includes('开放时间') || text.includes('营业时间') || text.includes('08:') || text.includes('09:'))) {
        openingHoursText = text;
        break;
      }
    }
    
    // 如果没找到，从整个页面提取（更全面的方法）
    if (!openingHoursText) {
      // 方法1: 从包含"开放时间"的整个区域提取
      $('p, div, li, section, dl, dt, dd').each((_, el) => {
        const text = $(el).text().trim();
        if ((text.includes('开放时间') || text.includes('营业时间')) && text.length < 3000) {
          // 获取包含该元素的整个区域
          const section = $(el).closest('div, section, article, dl').text().trim();
          if (section.includes('开放时间') || section.includes('营业时间')) {
            // 提取从"开放时间"开始到下一个标题或段落结束的内容
            const timeMatch = section.match(/(?:开放时间|营业时间)[：:\s]*([\s\S]{20,2000})/);
            if (timeMatch) {
              openingHoursText = timeMatch[1]
                .replace(/\n{3,}/g, '\n\n')
                .replace(/\s{3,}/g, ' ')
                .substring(0, 2000)
                .trim();
              return false; // 停止循环
            }
          }
        }
      });
    }
    
    // 方法2: 从整个页面文本中提取（使用更精确的正则）
    if (!openingHoursText) {
      // 匹配"开放时间"后面直到遇到下一个标题或空行的内容
      const timeMatch = bodyText.match(/(?:开放时间|营业时间)[：:\s]*([\s\S]{20,2000})(?=\n\s*\n|tips:|景点位置|附近|电话|门票|交通|$)/i);
      if (timeMatch) {
        openingHoursText = timeMatch[1]
          .replace(/\n{3,}/g, '\n\n')
          .replace(/\s{3,}/g, ' ')
          .substring(0, 2000)
          .trim();
      }
    }
    
    if (openingHoursText) {
      attraction.openingHours = openingHoursText;
    }

    // 提取门票价格 - 改进提取逻辑
    const ticketSelectors = [
      '.ticket',
      '.price',
      '[class*="ticket"]',
      '[class*="price"]',
    ];
    
    let ticketText = '';
    for (const selector of ticketSelectors) {
      const text = $(selector).first().text().trim();
      if (text && (text.includes('门票') || text.includes('票价') || text.includes('人民币') || text.match(/\d+元/))) {
        ticketText = text;
        break;
      }
    }
    
    // 如果没找到，从整个页面提取（更全面的方法）
    if (!ticketText) {
      // 方法1: 从包含"门票"的整个区域提取
      $('p, div, li, section, dl, dt, dd').each((_, el) => {
        const text = $(el).text().trim();
        if (text.includes('门票') && text.length < 5000) {
          // 获取包含该元素的整个区域
          const section = $(el).closest('div, section, article, dl').text().trim();
          if (section.includes('门票') || section.includes('票价')) {
            // 提取从"门票"开始到下一个标题或段落结束的内容
            const ticketMatch = section.match(/门票[：:\s]*([\s\S]{20,3000})/);
            if (ticketMatch) {
              ticketText = ticketMatch[1]
                .replace(/\n{3,}/g, '\n\n')
                .replace(/\s{3,}/g, ' ')
                .substring(0, 3000)
                .trim();
              return false; // 停止循环
            }
          }
        }
      });
    }
    
    // 方法2: 从整个页面文本中提取（使用更精确的正则）
    if (!ticketText) {
      // 匹配"门票"后面直到遇到下一个标题或空行的内容
      const ticketMatch = bodyText.match(/门票[：:\s]*([\s\S]{20,3000})(?=\n\s*\n|tips:|开放时间|景点位置|附近|电话|交通|$)/i);
      if (ticketMatch) {
        ticketText = ticketMatch[1]
          .replace(/\n{3,}/g, '\n\n')
          .replace(/\s{3,}/g, ' ')
          .substring(0, 3000)
          .trim();
      }
    }
    
    if (ticketText) {
      attraction.ticketPrice = ticketText;
    }

    // 提取用时参考 - 改进方法
    const durationPatterns = [
      /用时参考[：:\s]*([^\n。；;]{3,50})/,
      /建议游玩[：:\s]*([^\n。；;]{3,50})/,
      /游玩时间[：:\s]*([^\n。；;]{3,50})/,
      /(?:建议|推荐)[：:\s]*(\d+[小时天])/,
    ];
    
    for (const pattern of durationPatterns) {
      const match = bodyText.match(pattern);
      if (match) {
        attraction.visitDuration = match[1].trim();
        break;
      }
    }

    // 提取交通信息 - 改进方法
    let transportationText = '';
    
    // 方法1: 从特定区域提取
    $('p, div, li, section, dl, dt, dd').each((_, el) => {
      const text = $(el).text().trim();
      if (text.includes('交通') && (text.includes('公交') || text.includes('地铁') || text.includes('驾车') || text.includes('地铁站') || text.includes('地铁'))) {
        // 获取包含该元素的整个区域
        const section = $(el).closest('div, section, article, dl').text().trim();
        if (section.includes('交通')) {
          // 提取从"交通"开始到下一个标题或段落结束的内容
          const transportMatch = section.match(/交通[：:\s]*([\s\S]{50,2500})/);
          if (transportMatch) {
            transportationText = transportMatch[1]
              .replace(/\n{3,}/g, '\n\n')
              .replace(/\s{3,}/g, ' ')
              .substring(0, 2500)
              .trim();
            return false; // 停止循环
          }
        }
      }
    });
    
    // 方法2: 从整个页面文本中提取（使用更精确的正则）
    if (!transportationText) {
      // 匹配"交通"后面直到遇到下一个标题或空行的内容
      const transportMatch = bodyText.match(/交通[：:\s]*([\s\S]{50,2500})(?=\n\s*\n|tips:|开放时间|门票|景点位置|附近|电话|$)/i);
      if (transportMatch) {
        transportationText = transportMatch[1]
          .replace(/\n{3,}/g, '\n\n')
          .replace(/\s{3,}/g, ' ')
          .substring(0, 2500)
          .trim();
      }
    }
    
    if (transportationText) {
      attraction.transportation = transportationText;
    }

    // 提取附近景点
    attraction.nearbyAttractions = [];
    $('a[href*="/poi/"]').each((_, el) => {
      const linkText = $(el).text().trim();
      const href = $(el).attr('href');
      if (linkText && linkText.length > 2 && linkText.length < 50 && href && href.includes('/poi/')) {
        // 检查是否在"附近景点"区域
        const parentText = $(el).closest('div, section').text();
        if (parentText.includes('附近') || parentText.includes('周边')) {
          if (!attraction.nearbyAttractions!.includes(linkText)) {
            attraction.nearbyAttractions!.push(linkText);
          }
        }
      }
    });
    
    // 限制数量
    if (attraction.nearbyAttractions!.length > 10) {
      attraction.nearbyAttractions = attraction.nearbyAttractions!.slice(0, 10);
    }

    // 提取附近交通
    attraction.nearbyTransport = [];
    $('a, span, div').each((_, el) => {
      const text = $(el).text().trim();
      if (text && (text.includes('地铁站') || text.includes('公交站') || text.includes('(地铁站)') || text.includes('(公交站)'))) {
        // 检查是否在"附近交通"区域
        const parentText = $(el).closest('div, section').text();
        if (parentText.includes('附近') || parentText.includes('交通')) {
          const cleanText = text.replace(/\(.*?\)/g, '').trim();
          if (cleanText && !attraction.nearbyTransport!.includes(cleanText)) {
            attraction.nearbyTransport!.push(cleanText);
          }
        }
      }
    });
    
    // 限制数量
    if (attraction.nearbyTransport!.length > 10) {
      attraction.nearbyTransport = attraction.nearbyTransport!.slice(0, 10);
    }

    // 提取图片
    attraction.images = [];
    $('img[src*="mafengwo"], img[data-src*="mafengwo"]').each((_, el) => {
      if (attraction.images!.length < 5) {
        let src = $(el).attr('src') || $(el).attr('data-src') || '';
        if (src && !src.includes('avatar') && !src.includes('icon')) {
          if (src.startsWith('//')) {
            src = 'https:' + src;
          }
          attraction.images!.push(src);
        }
      }
    });

    // 提取标签
    attraction.tags = [];
    $('.tag, .label, .keyword, .tag-list span').each((_, el) => {
      const tag = $(el).text().trim();
      if (tag && tag.length < 20) {
        attraction.tags!.push(tag);
      }
    });

    // 提取坐标
    const latMeta = $('meta[name="latitude"], meta[property="place:location:latitude"]').attr('content');
    const lngMeta = $('meta[name="longitude"], meta[property="place:location:longitude"]').attr('content');
    
    if (latMeta && lngMeta) {
      attraction.lat = parseFloat(latMeta);
      attraction.lng = parseFloat(lngMeta);
    } else {
      // 尝试从脚本中提取
      const scripts = $('script').toArray();
      for (const script of scripts) {
        const scriptText = $(script).html();
        if (scriptText && scriptText.includes('lat') && scriptText.includes('lng')) {
          const latMatch = scriptText.match(/["']?lat["']?\s*[:=]\s*["']?([0-9.]+)["']?/);
          const lngMatch = scriptText.match(/["']?lng["']?\s*[:=]\s*["']?([0-9.]+)["']?/);
          if (latMatch && lngMatch) {
            attraction.lat = parseFloat(latMatch[1]);
            attraction.lng = parseFloat(lngMatch[1]);
            break;
          }
        }
      }
    }

    // 提取城市信息
    attraction.city = extractCityFromAddress(attraction.address);

    // 调试日志：显示提取到的关键信息
    if (attraction.phone) {
      console.log(`   📞 电话: ${attraction.phone}`);
    }
    if (attraction.openingHours) {
      console.log(`   🕐 开放时间: ${attraction.openingHours.substring(0, 80)}...`);
    }
    if (attraction.ticketPrice) {
      console.log(`   💰 门票: ${attraction.ticketPrice.substring(0, 80)}...`);
    }
    if (attraction.visitDuration) {
      console.log(`   ⏱️  用时参考: ${attraction.visitDuration}`);
    }
    if (attraction.transportation) {
      console.log(`   🚇 交通: ${attraction.transportation.substring(0, 80)}...`);
    }
    if (attraction.detailedDescription) {
      console.log(`   📝 详细描述: ${attraction.detailedDescription.length} 字符`);
    }

    console.log(`✅ 成功提取: ${attraction.name}`);
    
    return attraction;

  } catch (error: any) {
    console.error(`❌ 详情爬取失败: ${error.message}`);
    return null;
  }
}

function extractCityFromAddress(address: string = ''): string {
  const majorCities = [
    '北京', '上海', '广州', '深圳', '杭州', '成都', '重庆', '西安',
    '南京', '苏州', '武汉', '天津', '郑州', '长沙', '合肥', '宁波',
    '厦门', '青岛', '大连', '沈阳', '哈尔滨', '长春'
  ];
  
  for (const city of majorCities) {
    if (address.includes(city)) {
      return city;
    }
  }
  return '';
}

/**
 * 保存景点（如果已存在则更新）
 */
async function saveAttraction(attraction: MafengwoAttraction): Promise<boolean> {
  try {
    // 检查是否已存在 - 优先使用名称精确匹配
    let existing = await prisma.place.findFirst({
      where: {
        nameCN: attraction.name,
        category: 'ATTRACTION',
      },
    });

    // 如果名称匹配没找到，且地址不为空，尝试地址匹配
    if (!existing && attraction.address && attraction.address.length > 10) {
      existing = await prisma.place.findFirst({
        where: {
          AND: [
            { address: { contains: attraction.address.substring(0, 20) } },
            { address: { not: '' } },
            { category: 'ATTRACTION' },
            // 确保名称相似度较高（避免误匹配）
            { nameCN: { contains: attraction.name.substring(0, 2) } }
          ]
        },
      });
    }

    // 调试日志
    if (existing) {
      console.log(`   🔍 找到已存在记录: ID=${existing.id}, 名称="${existing.nameCN}"`);
      // 如果名称不匹配，说明可能是误匹配，应该创建新记录
      if (existing.nameCN !== attraction.name) {
        console.log(`   ⚠️  名称不匹配（"${existing.nameCN}" vs "${attraction.name}"），将创建新记录`);
        existing = null;
      }
    } else {
      console.log(`   🔍 未找到已存在记录，将创建新记录: "${attraction.name}"`);
    }

    // 准备metadata
    const metadata = {
      source: 'mafengwo',
      sourceUrl: attraction.sourceUrl,
      description: attraction.description,
      detailedDescription: attraction.detailedDescription, // 完整描述
      phone: attraction.phone,
      website: attraction.website,
      openingHours: attraction.openingHours,
      ticketPrice: attraction.ticketPrice,
      visitDuration: attraction.visitDuration, // 用时参考
      transportation: attraction.transportation, // 交通信息
      nearbyAttractions: attraction.nearbyAttractions, // 附近景点
      nearbyTransport: attraction.nearbyTransport, // 附近交通
      tags: attraction.tags,
      images: attraction.images,
      city: attraction.city,
      province: attraction.province,
      crawledAt: new Date().toISOString(),
    };

    if (existing) {
      // 更新现有记录
      const updateData: any = {
        rating: attraction.rating || existing.rating,
        address: attraction.address || existing.address,
        metadata: {
          ...(existing.metadata as any || {}),
          ...metadata,
          // 保留原有的其他metadata字段
        },
        updatedAt: new Date(),
      };

      // 如果有英文名，也更新
      if (attraction.nameEN) {
        updateData.nameEN = attraction.nameEN;
      }

      await prisma.place.update({
        where: { id: existing.id },
        data: updateData,
      });

      // 如果有坐标，更新location
      if (attraction.lat && attraction.lng) {
        await prisma.$executeRaw`
          UPDATE "Place"
          SET location = ST_SetSRID(ST_MakePoint(${attraction.lng}, ${attraction.lat}), 4326)
          WHERE id = ${existing.id}
        `;
      }

      console.log(`🔄 更新成功: ${attraction.name}`);
      return true;
    }

    // 创建新记录
    const place = await prisma.place.create({
      data: {
        uuid: randomUUID(),
        nameCN: attraction.name,
        nameEN: attraction.nameEN || null,
        category: 'ATTRACTION',
        address: attraction.address || null,
        rating: attraction.rating || null,
        metadata: metadata as any,
        updatedAt: new Date(),
      },
    });

    // 如果有坐标，更新location
    if (attraction.lat && attraction.lng) {
      await prisma.$executeRaw`
        UPDATE "Place"
        SET location = ST_SetSRID(ST_MakePoint(${attraction.lng}, ${attraction.lat}), 4326)
        WHERE id = ${place.id}
      `;
    }

    console.log(`✅ 保存成功: ${attraction.name} (ID: ${place.id})`);
    return true;

  } catch (error: any) {
    console.error(`❌ 保存失败 "${attraction.name}": ${error.message}`);
    return false;
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始爬取马蜂窝景点数据...\n');

  const keywords = process.argv.slice(2);
  if (keywords.length === 0) {
    keywords.push('北京', '上海', '杭州');
  }

  console.log(`🔑 目标城市: ${keywords.join(', ')}\n`);

  let totalSaved = 0;
  let totalFailed = 0;
  const startTime = Date.now();

  for (const city of keywords) {
    console.log(`\n📍 处理城市: ${city}`);
    console.log('━'.repeat(60));

    try {
      // 获取城市景点列表
      const urls = await getCityAttractions(city);
      
      if (urls.length === 0) {
        console.log(`⚠️  未找到景点链接，跳过 ${city}`);
        continue;
      }

      console.log(`📊 开始爬取 ${urls.length} 个景点...\n`);

      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const progress = `[${i + 1}/${urls.length}]`;

        try {
          const attraction = await scrapeAttractionDetail(url);
          
          if (attraction) {
            const saved = await saveAttraction(attraction);
            
                if (saved) {
                  totalSaved++;
                } else {
                  // 保存失败（可能是数据库错误）
                  totalFailed++;
                }
          } else {
            totalFailed++;
            console.log(`${progress} ❌ 提取失败: ${url.substring(url.lastIndexOf('/') + 1)}`);
          }
        } catch (error: any) {
          totalFailed++;
          console.log(`${progress} ❌ 处理失败: ${error.message}`);
        }

        // 延迟
        if (i < urls.length - 1) {
          await sleep(CONFIG.delay);
        }
      }

      // 城市间延迟
      await sleep(CONFIG.delay * 2);
      console.log(`\n✅ 完成 ${city}`);

    } catch (error: any) {
      console.error(`❌ 处理城市 ${city} 失败: ${error.message}`);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalProcessed = totalSaved + totalFailed;

  console.log('\n' + '━'.repeat(60));
  console.log('🎉 爬取完成！');
  console.log('━'.repeat(60));
  console.log(`📊 统计信息:`);
  console.log(`   成功保存/更新: ${totalSaved}`);
  console.log(`   失败: ${totalFailed}`);
  console.log(`   总处理: ${totalProcessed}`);
  console.log(`⏱️  总耗时: ${totalTime}秒`);
  
  if (totalProcessed > 0) {
    console.log(`📈 成功率: ${((totalSaved / totalProcessed) * 100).toFixed(1)}%`);
  }
  
  console.log('━'.repeat(60));

  await prisma.$disconnect();
}

// 运行
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  });
}