// scripts/scrape-visa.ts
// 从 Wikipedia 抓取中国护照的签证要求数据

import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 签证信息接口
 */
interface VisaInfo {
  country: string;
  requirementRaw: string; // 原始文本，如 "Visa not required"
  status: 'VISA_FREE' | 'VISA_ON_ARRIVAL' | 'E_VISA' | 'VISA_REQUIRED';
  allowedStay?: string;   // 停留时长，如 "30 days"
  notes?: string;         // 备注
}

/**
 * 清洗工具：去掉 [1], \n 等垃圾字符
 */
function cleanText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\[.*?\]/g, '') // 去掉 [1], [note 2]
    .replace(/\n/g, ' ')      // 去掉换行
    .replace(/\s+/g, ' ')    // 多个空格合并为一个
    .trim();
}

/**
 * 解析签证状态
 * 
 * 将自然语言转换为枚举值
 */
function parseVisaStatus(requirementText: string): VisaInfo['status'] {
  const lowerReq = requirementText.toLowerCase();
  
  if (lowerReq.includes('visa not required') || lowerReq.includes('visa free')) {
    return 'VISA_FREE';
  } else if (lowerReq.includes('visa on arrival')) {
    return 'VISA_ON_ARRIVAL';
  } else if (lowerReq.includes('evisa') || lowerReq.includes('e-visa') || lowerReq.includes('electronic')) {
    return 'E_VISA';
  }
  
  return 'VISA_REQUIRED';
}

/**
 * 处理 HTML 数据（提取和解析）
 */
async function processHtmlData(htmlData: string) {
  // 加载到 Cheerio
  const $ = cheerio.load(htmlData);
  const results: VisaInfo[] = [];
  
  console.log('📖 正在解析表格...');
    
    // 3. 定位表格
    // 维基百科的表格通常有 'wikitable' 和 'sortable' 这两个 class
    // 主表格应该有5列：Country / Region | Visa requirement | Allowed stay | Notes | Reciprocity
    // 我们需要找到列数最多且包含签证要求信息的表格
    const tables = $('table.wikitable.sortable');
    let table = null;
    
    // 查找主表格（应该有5列，且行数最多）
    tables.each((i, t) => {
      const $t = $(t);
      const colCount = $t.find('thead tr th').length;
      const rowCount = $t.find('tbody tr').length;
      
      // 主表格应该有5列，且行数较多（通常>100行）
      if (colCount === 5 && rowCount > 50) {
        table = $t;
        console.log(`✅ 找到主表格（第${i+1}个表格，${colCount}列，${rowCount}行）`);
        return false; // 跳出循环
      }
    });
    
    // 如果没找到5列表格，尝试找列数最多的表格
    if (!table) {
      let maxCols = 0;
      tables.each((i, t) => {
        const $t = $(t);
        const colCount = $t.find('thead tr th').length;
        if (colCount > maxCols) {
          maxCols = colCount;
          table = $t;
        }
      });
      console.log(`⚠️  使用列数最多的表格（${maxCols}列）`);
    }
    
    if (!table || table.length === 0) {
      console.error('❌ 未找到目标表格，可能页面结构已变化');
      return;
    }
    
    // 4. 遍历每一行 (tr)
    table.find('tbody tr').each((i, el) => {
      // 跳过表头
      if (i === 0) return;
      
      const cols = $(el).find('td');
      
      // 维基百科有时第一列是 th (Country)，有时是 td，做个兼容
      let countryName = $(el).find('th').text().trim();
      if (!countryName) {
        countryName = cols.eq(0).text().trim();
      }
      
      // 清洗国家名：去掉引用角标，如 "Japan[2]" -> "Japan"
      countryName = cleanText(countryName);
      
      // 跳过空行或无效数据
      if (!countryName || countryName.length < 2) {
        return;
      }
      
      // 获取签证要求文本（主表格的第二列：Visa requirement）
      const requirementText = cleanText(cols.eq(1).text());
      
      // 获取允许停留时间（主表格的第三列：Allowed stay）
      const stayText = cleanText(cols.eq(2).text());
      
      // 获取备注信息（主表格的第四列：Notes）
      const notesText = cleanText(cols.eq(3).text());
      
      // 解析签证状态
      const status = parseVisaStatus(requirementText);
      
      // 只有当解析出有效国家名时才推入数组
      if (countryName) {
        results.push({
          country: countryName,
          status: status,
          requirementRaw: requirementText,
          allowedStay: stayText || undefined,
          notes: notesText || undefined,
        });
      }
    });
    
    // 5. 保存结果
    const outputPath = path.join(process.cwd(), 'visa_requirements.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    
    console.log(`✅ 抓取完成！共获取 ${results.length} 个国家的数据。`);
    console.log(`📂 已保存至 ${outputPath}`);
    
    // 6. 统计信息
    const stats = {
      VISA_FREE: results.filter(r => r.status === 'VISA_FREE').length,
      VISA_ON_ARRIVAL: results.filter(r => r.status === 'VISA_ON_ARRIVAL').length,
      E_VISA: results.filter(r => r.status === 'E_VISA').length,
      VISA_REQUIRED: results.filter(r => r.status === 'VISA_REQUIRED').length,
    };
    
    console.log('\n📊 统计信息：');
    console.log(`  免签: ${stats.VISA_FREE} 个国家`);
    console.log(`  落地签: ${stats.VISA_ON_ARRIVAL} 个国家`);
    console.log(`  电子签: ${stats.E_VISA} 个国家`);
    console.log(`  需要签证: ${stats.VISA_REQUIRED} 个国家`);
}

/**
 * 主函数：抓取签证要求
 */
async function scrapeVisaRequirements() {
  console.log('🚀 开始下载 Wikipedia 页面...');
  const url = 'https://en.wikipedia.org/wiki/Visa_requirements_for_Chinese_citizens';
  
  // 检查是否可以使用本地文件（用于测试或离线场景）
  const localFile = path.join(process.cwd(), 'visa_page.html');
  if (fs.existsSync(localFile)) {
    console.log('📂 发现本地文件 visa_page.html，使用本地文件...');
    try {
      const localData = fs.readFileSync(localFile, 'utf-8');
      await processHtmlData(localData);
      return;
    } catch (error) {
      console.warn('⚠️  本地文件读取失败，尝试在线抓取...');
    }
  }
  
  try {
    // 1. 获取 HTML
    // Wikipedia 页面可能很大，增加超时时间和重试机制
    let data: string | null = null;
    let retries = 3;
    let lastError: Error | null = null;
    
    while (retries > 0) {
      try {
        console.log(`📡 正在请求（剩余 ${retries} 次尝试）...`);
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          timeout: 60000, // 60秒超时
          maxRedirects: 5,
        });
        data = response.data;
        console.log('✅ 页面下载成功');
        break; // 成功获取，退出重试循环
      } catch (error) {
        // 详细错误信息
        let errorMessage = '未知错误';
        if (axios.isAxiosError(error)) {
          if (error.code === 'ECONNABORTED') {
            errorMessage = '请求超时（60秒）';
          } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            errorMessage = `网络连接失败: ${error.message}`;
          } else if (error.response) {
            errorMessage = `HTTP ${error.response.status}: ${error.response.statusText}`;
          } else if (error.request) {
            errorMessage = '无响应（可能是网络问题或防火墙阻止）';
          } else {
            errorMessage = error.message;
          }
        } else if (error instanceof Error) {
          errorMessage = error.message;
        } else {
          errorMessage = String(error);
        }
        
        lastError = new Error(errorMessage);
        retries--;
        if (retries > 0) {
          console.log(`⚠️  请求失败: ${errorMessage}`);
          console.log(`   等待 2 秒后重试...`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒后重试
        } else {
          console.log(`❌ 所有重试均失败`);
        }
      }
    }
    
    if (!data) {
      throw lastError || new Error('无法获取页面数据');
    }
    
    // 可选：保存 HTML 到本地（用于调试）
    const saveHtml = process.env.SAVE_HTML === 'true';
    if (saveHtml) {
      fs.writeFileSync(localFile, data);
      console.log(`💾 HTML 已保存到 ${localFile}`);
    }
    
    // 2. 处理 HTML 数据
    await processHtmlData(data);
  } catch (error) {
    console.error('\n❌ 抓取失败！');
    console.error('错误详情:', error instanceof Error ? error.message : String(error));
    
    if (axios.isAxiosError(error)) {
      if (error.code) {
        console.error(`错误代码: ${error.code}`);
      }
      if (error.response) {
        console.error(`HTTP 状态: ${error.response.status} ${error.response.statusText}`);
      } else if (error.request) {
        console.error('⚠️  可能的原因：');
        console.error('  1. 网络连接问题');
        console.error('  2. 防火墙或代理设置');
        console.error('  3. Wikipedia 服务器响应慢');
        console.error('\n💡 建议：');
        console.error('  - 检查网络连接');
        console.error('  - 如果使用代理，请配置 HTTP_PROXY 环境变量');
        console.error('  - 尝试使用 VPN 或更换网络');
      }
    }
    
    console.error('\n📝 备选方案：');
    console.error('  如果无法访问 Wikipedia，可以手动下载页面：');
    console.error('  1. 访问: https://en.wikipedia.org/wiki/Visa_requirements_for_Chinese_citizens');
    console.error('  2. 保存 HTML 为 visa_page.html');
    console.error('  3. 脚本会自动使用本地文件');
    
    process.exit(1);
  }
}

// 执行抓取
scrapeVisaRequirements();
