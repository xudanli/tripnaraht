#!/usr/bin/env ts-node
/**
 * 检查所有控制器中缺少 Swagger 文档的接口
 */

import * as fs from 'fs';
import * as path from 'path';

interface MissingDoc {
  file: string;
  method: string;
  route: string;
  line: number;
}

const controllersDir = path.join(__dirname, '../src');
const missingDocs: MissingDoc[] = [];

function checkFile(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  // 检查是否是控制器文件
  if (!content.includes('@Controller') || !content.includes('@ApiTags')) {
    return;
  }
  
  // 查找所有 HTTP 方法装饰器
  const httpMethods = ['@Get', '@Post', '@Put', '@Delete', '@Patch'];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 检查是否有 HTTP 方法装饰器
    const hasHttpMethod = httpMethods.some(method => line.includes(`${method}(`));
    
    if (hasHttpMethod) {
      // 检查接下来的几行是否有 @ApiOperation
      const nextLines = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');
      
      if (!nextLines.includes('@ApiOperation')) {
        // 提取路由路径
        const routeMatch = line.match(/@(Get|Post|Put|Delete|Patch)\(['"`]([^'"`]*)['"`]\)/);
        const route = routeMatch ? routeMatch[2] : '';
        const method = routeMatch ? routeMatch[1] : '';
        
        missingDocs.push({
          file: path.relative(controllersDir, filePath),
          method,
          route: route || '(root)',
          line: i + 1,
        });
      }
    }
  }
}

function walkDir(dir: string) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      walkDir(filePath);
    } else if (file.endsWith('.controller.ts')) {
      checkFile(filePath);
    }
  }
}

// 开始检查
walkDir(controllersDir);

// 输出结果
console.log('🔍 Swagger 文档检查结果\n');
console.log(`📊 总计发现 ${missingDocs.length} 个缺少 @ApiOperation 的接口\n`);

if (missingDocs.length > 0) {
  console.log('❌ 缺少 Swagger 文档的接口：\n');
  
  const groupedByFile = missingDocs.reduce((acc, doc) => {
    if (!acc[doc.file]) {
      acc[doc.file] = [];
    }
    acc[doc.file].push(doc);
    return acc;
  }, {} as Record<string, MissingDoc[]>);
  
  for (const [file, docs] of Object.entries(groupedByFile)) {
    console.log(`📄 ${file}:`);
    for (const doc of docs) {
      console.log(`   - ${doc.method} ${doc.route} (line ${doc.line})`);
    }
    console.log('');
  }
} else {
  console.log('✅ 所有接口都已配置 Swagger 文档！');
}
