// scripts/scrape-alltrails-puppeteer.ts

/**
 * AllTrails 数据爬取脚本（使用 Playwright）
 * 
 * 当普通 HTTP 请求被 403 拒绝时，使用 Playwright 模拟真实浏览器
 * 
 * 注意：Playwright 需要安装浏览器
 * 运行前执行: npx playwright install chromium
 */

import * as fs from 'fs/promises';
import { chromium, Browser, Page } from 'playwright';
import { AllTrailsTrail, parseDifficulty, parseDistance, parseElevation, extractRiskFactors, convertToSystemFormat } from './scrape-alltrails';

const BASE_URL = 'https://www.alltrails.com';

/**
 * 使用 Playwright 爬取页面（替代 Puppeteer）
 */
async function scrapeWithPlaywright(url: string): Promise<string | null> {
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
      ],
    });

    // 创建浏览器上下文并设置更真实的浏览器环境
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
    });
    
    const page = await context.newPage();
    
    // 隐藏 webdriver 特征
    await page.addInitScript(() => {
      // @ts-ignore - navigator 在浏览器环境中存在
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
    });

    // 访问页面
    console.log(`🌐 正在使用 Playwright 访问: ${url}`);
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // 等待页面加载
    await page.waitForTimeout(2000);

    // 获取页面 HTML
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
 * 解析路线详情（复用原有逻辑）
 */
async function parseTrailDetailPuppeteer(url: string): Promise<AllTrailsTrail | null> {
  const html = await scrapeWithPlaywright(url);
  if (!html) {
    return null;
  }

  // 使用 cheerio 解析（需要导入）
  const cheerio = await import('cheerio');
  const $ = cheerio.load(html);
  const trail: AllTrailsTrail = { 
    url,
    name: 'N/A'
  };

  try {
    trail.name = $('h1').first().text().trim() || 'N/A';
  } catch (e) {
    trail.name = 'N/A';
  }

  try {
    const difficultyText = $('[data-testid="difficulty-label"], .difficulty-label, .trail-difficulty')
      .first()
      .text()
      .trim();
    trail.difficulty = parseDifficulty(difficultyText);
  } catch (e) {
    // 忽略
  }

  try {
    // 长度 - 使用实际的 CSS 类名（与主脚本一致）
    const lengthStat = $('.TrailStats_stat_02GvM').first();
    if (lengthStat.length > 0) {
      const label = lengthStat.find('.TrailStats_statLabel_vKMLy').text().trim();
      if (label.toLowerCase().includes('length')) {
        const lengthValue = lengthStat.find('.TrailStats_statValueSm__HlKIU').first();
        if (lengthValue.length > 0) {
          const numberText = lengthValue.clone().children().remove().end().text().trim();
          const unitSpan = lengthValue.find('span').first();
          const unit = unitSpan.length > 0 ? unitSpan.text().trim() : '';
          
          if (numberText) {
            trail.length = unit ? `${numberText} ${unit}` : numberText;
            trail.totalDistance = parseDistance(trail.length);
          }
        }
      }
    }
  } catch (e) {
    // 忽略
  }

  try {
    // 海拔增益 - 使用实际的 CSS 类名（与主脚本一致）
    $('.TrailStats_stat_02GvM').each((_, element) => {
      const $stat = $(element);
      const label = $stat.find('.TrailStats_statLabel_vKMLy').text().trim().toLowerCase();
      
      if (label.includes('elevation') || label.includes('gain')) {
        const elevationValue = $stat.find('.TrailStats_statValueSm__HlKIU').first();
        if (elevationValue.length > 0) {
          const numberText = elevationValue.clone().children().remove().end().text().trim();
          const unitSpan = elevationValue.find('span').first();
          const unit = unitSpan.length > 0 ? unitSpan.text().trim() : '';
          
          if (numberText) {
            trail.elevationGain = unit ? `${numberText} ${unit}` : numberText;
            trail.elevationGainMeters = parseElevation(trail.elevationGain);
          }
        }
        return false;
      }
    });
  } catch (e) {
    // 忽略
  }

  try {
    // 预估时间 - 使用实际的 CSS 类名（与主脚本一致）
    $('.TrailStats_stat_02GvM').each((_, element) => {
      const $stat = $(element);
      const label = $stat.find('.TrailStats_statLabel_vKMLy').text().trim().toLowerCase();
      
      if (label.includes('time') || label.includes('estimated')) {
        const timeValue = $stat.find('.TrailStats_statValueSm__HlKIU').first().text().trim();
        if (timeValue) {
          trail.estimatedTime = timeValue;
        }
        return false;
      }
    });
  } catch (e) {
    // 忽略
  }

  try {
    trail.rating = $('[itemprop="ratingValue"], .rating-value, .trail-rating')
      .first()
      .text()
      .trim();
  } catch (e) {
    // 忽略
  }

  try {
    trail.description = $('[data-testid="trail-description"], .trail-description, .description')
      .first()
      .text()
      .trim();
    
    if (trail.description) {
      trail.riskFactors = extractRiskFactors(trail.description);
    }
  } catch (e) {
    // 忽略
  }

  try {
    trail.location = $('[data-testid="location-label"], .location, .trail-location')
      .first()
      .text()
      .trim();
  } catch (e) {
    // 忽略
  }

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

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--url')) {
    const urlIndex = args.indexOf('--url');
    const trailUrl = args[urlIndex + 1];
    
    if (!trailUrl) {
      console.error('❌ 请提供路线 URL');
      process.exit(1);
    }

    console.log(`🔍 正在使用 Playwright 爬取: ${trailUrl}`);
    const trail = await parseTrailDetailPuppeteer(trailUrl);
    
    if (!trail) {
      console.error('❌ 无法获取页面');
      process.exit(1);
    }

    const systemFormat = convertToSystemFormat(trail);

    console.log('\n📊 爬取结果:');
    console.log(JSON.stringify(systemFormat, null, 2));

    const outputFile = `alltrails_puppeteer_${Date.now()}.json`;
    await fs.writeFile(outputFile, JSON.stringify(systemFormat, null, 2), 'utf-8');
    console.log(`\n✅ 数据已保存到: ${outputFile}`);
  } else {
    console.log(`
使用方法:
  npm run scrape:alltrails:puppeteer -- --url <trail_url>

示例:
  npm run scrape:alltrails:puppeteer -- --url https://www.alltrails.com/trail/us/arizona/tempe-town-lake-trail--2
    `);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
