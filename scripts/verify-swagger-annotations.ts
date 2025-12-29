// scripts/verify-swagger-annotations.ts
/**
 * 验证新接口的 Swagger 注解
 */

import * as fs from 'fs';
import * as path from 'path';

interface ApiEndpoint {
  file: string;
  method: string;
  path: string;
  hasApiOperation: boolean;
  hasApiTags: boolean;
  tag?: string;
}

const endpoints: ApiEndpoint[] = [];

// 检查文件中的 Swagger 注解
function checkFile(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  let currentTag = '';
  let inController = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 检查 @ApiTags
    if (line.includes('@ApiTags')) {
      const match = line.match(/@ApiTags\(['"]([^'"]+)['"]\)/);
      if (match) {
        currentTag = match[1];
      }
    }
    
    // 检查 @Controller
    if (line.includes('@Controller')) {
      inController = true;
    }
    
    // 检查路由装饰器
    const routeMatch = line.match(/@(Get|Post|Put|Delete|Patch)\(['"]?([^'"]*)['"]?\)/);
    if (routeMatch && inController) {
      const method = routeMatch[1].toUpperCase();
      const routePath = routeMatch[2] || '';
      
      // 检查后续几行是否有 @ApiOperation
      let hasApiOperation = false;
      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        if (lines[j].includes('@ApiOperation')) {
          hasApiOperation = true;
          break;
        }
        if (lines[j].includes('async ') || lines[j].includes('function ')) {
          break;
        }
      }
      
      endpoints.push({
        file: path.basename(filePath),
        method,
        path: routePath,
        hasApiOperation,
        hasApiTags: !!currentTag,
        tag: currentTag,
      });
    }
  }
}

// 检查新实现的文件
const filesToCheck = [
  'src/trips/trips.controller.ts',
  'src/trips/decision/decision.controller.ts',
  'src/rag/rag.controller.ts',
  'src/countries/countries.controller.ts',
  'src/trips/readiness/readiness.controller.ts',
];

console.log('🔍 检查 Swagger 注解...\n');

filesToCheck.forEach(file => {
  const fullPath = path.join(process.cwd(), file);
  if (fs.existsSync(fullPath)) {
    checkFile(fullPath);
  }
});

// 筛选新接口
const newEndpoints = endpoints.filter(ep => {
  // 行程管理新接口
  if (ep.file === 'trips.controller.ts') {
    return ep.path.includes('emergency') || 
           ep.path.includes('budget') || 
           ep.path.includes('adjust');
  }
  // 决策层新接口
  if (ep.file === 'decision.controller.ts') {
    return ep.path.includes('validate-safety') ||
           ep.path.includes('adjust-pacing') ||
           ep.path.includes('replace-nodes');
  }
  // RAG 新接口
  if (ep.file === 'rag.controller.ts') {
    return ep.path.includes('destination-insights') ||
           ep.path.includes('extract-compliance-rules');
  }
  // 国家档案新接口
  if (ep.file === 'countries.controller.ts') {
    return ep.path.includes('payment-info') ||
           ep.path.includes('terrain-advice');
  }
  // 准备度检查新接口
  if (ep.file === 'readiness.controller.ts') {
    return ep.path.includes('personalized-checklist') ||
           ep.path.includes('risk-warnings');
  }
  return false;
});

console.log('📋 新接口 Swagger 注解检查结果:\n');

let allGood = true;
newEndpoints.forEach(ep => {
  const status = ep.hasApiOperation && ep.hasApiTags ? '✅' : '❌';
  if (!ep.hasApiOperation || !ep.hasApiTags) {
    allGood = false;
  }
  console.log(`${status} ${ep.method} ${ep.path}`);
  console.log(`   文件: ${ep.file}`);
  console.log(`   Tag: ${ep.tag || '未设置'}`);
  console.log(`   @ApiOperation: ${ep.hasApiOperation ? '✅' : '❌'}`);
  console.log(`   @ApiTags: ${ep.hasApiTags ? '✅' : '❌'}`);
  console.log('');
});

if (allGood) {
  console.log('✅ 所有新接口都已正确配置 Swagger 注解！');
} else {
  console.log('⚠️  部分接口缺少 Swagger 注解，请检查上述结果。');
  process.exit(1);
}

