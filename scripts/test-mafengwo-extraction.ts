import axios from 'axios';
import * as cheerio from 'cheerio';
import * as dotenv from 'dotenv';

dotenv.config();

async function testExtraction() {
  const url = 'https://www.mafengwo.cn/poi/5426285.html'; // 故宫
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    const $ = cheerio.load(response.data);
    const bodyText = $('body').text();
    
    console.log('🔍 测试提取故宫页面信息...\n');
    console.log('━'.repeat(80));
    console.log(`📄 响应状态: ${response.status}`);
    console.log(`📄 HTML长度: ${response.data.length} 字符`);
    console.log(`📄 前500字符: ${response.data.substring(0, 500)}`);
    console.log('━'.repeat(80));
    
    // 测试电话提取
    console.log('\n📞 电话提取测试:');
    const phonePatterns = [
      /电话[：:\s]*([0-9\-\s\+\(\)]{7,15})/,
      /(400[0-9]{7})/,
    ];
    for (const pattern of phonePatterns) {
      const match = bodyText.match(pattern);
      if (match) {
        console.log(`   ✅ 找到: ${match[0]}`);
        console.log(`   提取: ${match[1]}`);
      }
    }
    
    // 测试开放时间提取
    console.log('\n🕐 开放时间提取测试:');
    const timeMatch = bodyText.match(/(?:开放时间|营业时间)[：:\s]*([\s\S]{20,500})/);
    if (timeMatch) {
      console.log(`   ✅ 找到: ${timeMatch[1].substring(0, 200)}...`);
    } else {
      console.log('   ❌ 未找到');
      // 查找包含时间的文本
      const timeSnippets = bodyText.match(/08:[\d:]+|09:[\d:]+|开放时间|营业时间/g);
      if (timeSnippets) {
        console.log(`   💡 找到相关关键词: ${timeSnippets.slice(0, 5).join(', ')}`);
      }
    }
    
    // 测试门票提取
    console.log('\n💰 门票提取测试:');
    const ticketMatch = bodyText.match(/门票[：:\s]*([\s\S]{20,1000})/);
    if (ticketMatch) {
      console.log(`   ✅ 找到: ${ticketMatch[1].substring(0, 200)}...`);
    } else {
      console.log('   ❌ 未找到');
      // 查找包含门票的文本
      const ticketSnippets = bodyText.match(/门票|票价|\d+元|\d+人民币/g);
      if (ticketSnippets) {
        console.log(`   💡 找到相关关键词: ${ticketSnippets.slice(0, 10).join(', ')}`);
      }
    }
    
    // 测试交通提取
    console.log('\n🚇 交通提取测试:');
    const transportMatch = bodyText.match(/交通[：:\s]*([\s\S]{50,1000})/);
    if (transportMatch) {
      console.log(`   ✅ 找到: ${transportMatch[1].substring(0, 200)}...`);
    } else {
      console.log('   ❌ 未找到');
      // 查找包含交通的文本
      const transportSnippets = bodyText.match(/交通|公交|地铁|地铁站/g);
      if (transportSnippets) {
        console.log(`   💡 找到相关关键词: ${transportSnippets.slice(0, 10).join(', ')}`);
      }
    }
    
    // 测试用时参考提取
    console.log('\n⏱️  用时参考提取测试:');
    const durationMatch = bodyText.match(/用时参考[：:\s]*([^\n。；;]{3,50})/);
    if (durationMatch) {
      console.log(`   ✅ 找到: ${durationMatch[1]}`);
    } else {
      console.log('   ❌ 未找到');
    }
    
    // 测试描述提取
    console.log('\n📝 描述提取测试:');
    const descSelectors = ['.summary', '.mod-detail', '.introduction', '.detail', 'p'];
    for (const selector of descSelectors) {
      const text = $(selector).first().text().trim();
      if (text && text.length > 100) {
        console.log(`   ✅ 从 "${selector}" 找到: ${text.substring(0, 200)}...`);
        break;
      }
    }
    
    // 显示页面结构提示
    console.log('\n📋 页面结构分析:');
    console.log(`   页面标题: ${$('title').text()}`);
    console.log(`   页面文本长度: ${bodyText.length} 字符`);
    
    // 查找包含关键信息的元素
    const keyElements = $('*').filter((_, el) => {
      const text = $(el).text();
      return text.includes('电话') || text.includes('开放时间') || text.includes('门票') || text.includes('交通');
    });
    console.log(`   包含关键信息的元素数量: ${keyElements.length}`);
    if (keyElements.length > 0) {
      console.log(`   示例元素类名: ${keyElements.first().attr('class') || '无类名'}`);
      console.log(`   示例元素文本: ${keyElements.first().text().substring(0, 100)}...`);
    }
    
    console.log('\n' + '━'.repeat(80));
    
  } catch (error: any) {
    console.error('❌ 测试失败:', error.message);
  }
}

testExtraction();
