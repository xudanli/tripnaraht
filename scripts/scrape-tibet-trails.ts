// scripts/scrape-tibet-trails.ts

/**
 * 批量爬取中国西藏的徒步路线
 * 
 * 使用方法:
 *   npm run scrape:tibet [--limit <number>] [--debug]
 * 
 * 示例:
 *   npm run scrape:tibet -- --limit 10
 *   npm run scrape:tibet -- --limit 50 --debug
 */

import { execSync } from 'child_process';

const TIBET_SEARCH_URLS = [
  // 尝试多个可能的 URL 格式
  'https://www.alltrails.com/trails/china/tibet',
  'https://www.alltrails.com/china/tibet',
  'https://www.alltrails.com/explore?q=tibet',
  'https://www.alltrails.com/explore?q=%E8%A5%BF%E8%97%8F', // 西藏（中文）
  'https://www.alltrails.com/explore?q=xizang',
];

async function main() {
  const args = process.argv.slice(2);
  const limit = args.includes('--limit') 
    ? parseInt(args[args.indexOf('--limit') + 1]) 
    : 20;
  
  const debug = args.includes('--debug');
  const imperial = args.includes('--imperial');
  
  console.log('🏔️  开始批量爬取中国西藏的徒步路线...\n');
  console.log(`📊 限制数量: ${limit}`);
  console.log(`🌐 尝试的 URL:`);
  TIBET_SEARCH_URLS.forEach((url, i) => {
    console.log(`   ${i + 1}. ${url}`);
  });
  console.log('');

  // 尝试每个 URL
  for (let i = 0; i < TIBET_SEARCH_URLS.length; i++) {
    const url = TIBET_SEARCH_URLS[i];
    console.log(`\n🔍 尝试 URL ${i + 1}/${TIBET_SEARCH_URLS.length}: ${url}`);
    
    try {
      // 构建命令
      const cmdParts = [
        'npm run scrape:alltrails --',
        '--list',
        `"${url}"`,
        '--limit',
        limit.toString(),
      ];
      
      if (debug) cmdParts.push('--debug');
      if (imperial) cmdParts.push('--imperial');
      
      const cmd = cmdParts.join(' ');
      console.log(`📝 执行命令: ${cmd}\n`);
      
      execSync(cmd, {
        stdio: 'inherit',
        cwd: process.cwd(),
      });
      
      console.log(`\n✅ 成功爬取数据！`);
      return; // 成功则退出
      
    } catch (error: any) {
      console.error(`\n❌ URL ${i + 1} 失败: ${error.message}`);
      if (i < TIBET_SEARCH_URLS.length - 1) {
        console.log('⏭️  尝试下一个 URL...\n');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  
  console.error('\n❌ 所有 URL 都失败了。');
  console.error('💡 建议：');
  console.error('   1. 检查网络连接');
  console.error('   2. 手动访问 AllTrails 网站，搜索 "Tibet" 或 "西藏"');
  console.error('   3. 复制正确的列表页 URL，然后使用：');
  console.error('      npm run scrape:alltrails -- --list <url> --limit <number>');
  process.exit(1);
}

if (require.main === module) {
  main().catch(console.error);
}

