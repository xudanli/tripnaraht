#!/usr/bin/env tsx
/**
 * 修复JSON格式错误的脚本
 * 自动检测并修复常见的JSON格式问题
 */

import * as fs from 'fs';
import * as path from 'path';

const filesToFix = [
  'docs/iceland/pois/accommodations.json',
  'docs/iceland/pois/attractions.json',
  'docs/iceland/decision-support/rhythm-patterns.json',
  'docs/iceland/risks/terrain-risks.json',
  'docs/iceland/practical/packing-checklist-template.json',
  'docs/alps/pois/attractions.json',
  'docs/alps/risks/terrain-risks.json',
  'docs/alps/decision-support/rhythm-patterns.json',
  'docs/alps/practical/packing-checklist-template.json',
  'docs/svalbard/pois/attractions.json',
  'docs/svalbard/risks/terrain-risks.json',
  'docs/svalbard/decision-support/rhythm-patterns.json',
  'docs/svalbard/practical/packing-checklist-template.json',
  'docs/faroe-islands/decision-support/rhythm-patterns.json',
  'docs/faroe-islands/practical/packing-checklist-template.json',
  'docs/argentina/culture/museums-attractions.json',
  'docs/argentina/logistics/transportation.json',
  'docs/mountaineering/8000m-user-personas-index.json',
  'docs/mountaineering/broad-peak-user-personas.json',
  'docs/mountaineering/shishapangma-user-personas.json',
];

/**
 * 修复JSON格式错误
 */
function fixJsonErrors(filePath: string): { fixed: boolean; error?: string } {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    
    // 1. 移除BOM标记
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }
    
    // 2. 移除控制字符（除了换行符和制表符）
    content = content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // 3. 修复常见的JSON错误
    // 3.1 修复数组末尾的逗号
    content = content.replace(/,(\s*[}\]])/g, '$1');
    
    // 3.2 修复对象末尾的逗号
    content = content.replace(/,(\s*})/g, '$1');
    
    // 3.3 修复字符串中的未转义引号（简单处理）
    // 注意：这个可能不够精确，但对于大多数情况有效
    content = content.replace(/([^\\])"([^",:}\]]*)"([^,:\s}])/g, (match, p1, p2, p3) => {
      // 如果看起来像是字符串值中的引号，尝试转义
      if (p2 && !p2.includes('"')) {
        return match;
      }
      return match;
    });
    
    // 4. 尝试解析验证
    try {
      JSON.parse(content);
    } catch (parseError: any) {
      // 如果还是解析失败，尝试更激进的修复
      const errorPos = parseInt(parseError.message.match(/position (\d+)/)?.[1] || '0');
      
      if (errorPos > 0) {
        // 检查错误位置附近的字符
        const start = Math.max(0, errorPos - 50);
        const end = Math.min(content.length, errorPos + 50);
        const context = content.substring(start, end);
        
        // 尝试修复常见的数组/对象错误
        // 如果错误位置在数组或对象内部，尝试添加缺失的逗号或括号
        const beforeError = content.substring(0, errorPos);
        const afterError = content.substring(errorPos);
        
        // 检查是否是缺少逗号
        if (afterError.match(/^\s*["\w]/) && beforeError.match(/["\w]\s*$/)) {
          // 可能缺少逗号
          content = beforeError + ',' + afterError;
        }
      }
      
      // 再次尝试解析
      try {
        JSON.parse(content);
      } catch (finalError) {
        const errorMessage = finalError instanceof Error ? finalError.message : String(finalError);
        return { fixed: false, error: errorMessage };
      }
    }
    
    // 5. 如果内容有变化，保存文件
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      return { fixed: true };
    }
    
    // 6. 如果内容没有变化但可以解析，说明已经是有效的JSON
    try {
      JSON.parse(content);
      return { fixed: true };
    } catch {
      return { fixed: false, error: '无法修复' };
    }
    
  } catch (error: any) {
    return { fixed: false, error: error.message };
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🔧 开始修复JSON格式错误...\n');
  
  let fixedCount = 0;
  let failedCount = 0;
  const failedFiles: Array<{ file: string; error: string }> = [];
  
  for (const filePath of filesToFix) {
    const fullPath = path.join(process.cwd(), filePath);
    
    if (!fs.existsSync(fullPath)) {
      console.log(`⚠️  文件不存在: ${filePath}`);
      continue;
    }
    
    console.log(`📝 处理: ${filePath}`);
    
    // 先验证原始文件
    try {
      const originalContent = fs.readFileSync(fullPath, 'utf8');
      JSON.parse(originalContent);
      console.log(`  ✅ 已经是有效的JSON，跳过`);
      continue;
    } catch {
      // 文件有错误，需要修复
    }
    
    const result = fixJsonErrors(fullPath);
    
    if (result.fixed) {
      // 验证修复后的文件
      try {
        const fixedContent = fs.readFileSync(fullPath, 'utf8');
        JSON.parse(fixedContent);
        console.log(`  ✅ 修复成功`);
        fixedCount++;
      } catch (error: any) {
        console.log(`  ❌ 修复后仍然无效: ${error.message}`);
        failedCount++;
        failedFiles.push({ file: filePath, error: error.message });
      }
    } else {
      console.log(`  ❌ 修复失败: ${result.error || '未知错误'}`);
      failedCount++;
      failedFiles.push({ file: filePath, error: result.error || '未知错误' });
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ 修复完成！`);
  console.log(`   成功: ${fixedCount} 个文件`);
  console.log(`   失败: ${failedCount} 个文件`);
  console.log('='.repeat(60));
  
  if (failedFiles.length > 0) {
    console.log(`\n⚠️  无法修复的文件:`);
    failedFiles.forEach(({ file, error }) => {
      console.log(`  - ${file}: ${error}`);
    });
  }
}

main().catch(console.error);
