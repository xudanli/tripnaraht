#!/usr/bin/env ts-node

/**
 * ⚠️ 已废弃：打包模板和指南管理接口已删除
 * 
 * 打包模板和指南已集成到 ReadinessPack 中。
 * 请使用 ReadinessPack 接口获取打包数据：
 * - GET /api/readiness/admin/packs/:id?includePacking=true
 * 
 * 此测试脚本保留用于历史参考，但接口已不再可用。
 */

import axios, { AxiosInstance } from 'axios';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function logSuccess(message: string) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function logError(message: string) {
  console.log(`${colors.red}❌ ${message}${colors.reset}`);
}

function logInfo(message: string) {
  console.log(`${colors.blue}ℹ️  ${message}${colors.reset}`);
}

function logSection(title: string) {
  console.log(`\n${colors.cyan}${'='.repeat(70)}${colors.reset}`);
  console.log(`${colors.cyan}${title}${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(70)}${colors.reset}\n`);
}

// 创建 axios 实例
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 测试 1: 获取打包清单模板列表
async function testGetPackingTemplates() {
  logSection('测试 1: 获取打包清单模板列表');

  try {
    const response = await api.get('/api/readiness/admin/packing-templates', {
      params: { page: 1, limit: 20 },
    });

    if (response.data && response.data.success) {
      const data = response.data.data;
      logSuccess('获取模板列表成功');
      console.log(`  总数: ${data.total}`);
      console.log(`  当前页: ${data.page}`);
      console.log(`  每页数量: ${data.limit}`);
      console.log(`  总页数: ${data.totalPages}`);
      console.log(`  模板数量: ${data.templates.length}`);

      if (data.templates.length > 0) {
        const template = data.templates[0];
        console.log(`\n  第一个模板:`);
        console.log(`    ID: ${template.id}`);
        console.log(`    版本: ${template.version}`);
        console.log(`    最后更新: ${template.lastUpdated}`);
        console.log(`    是否激活: ${template.isActive}`);
        if (template.metadata) {
          console.log(`    元数据版本: ${template.metadata.version || 'N/A'}`);
        }
      }

      return true;
    } else {
      logError('获取模板列表失败');
      console.log(`  错误: ${JSON.stringify(response.data?.error)}`);
      return false;
    }
  } catch (error: any) {
    logError(`获取模板列表失败: ${error.message}`);
    if (error.response) {
      console.log(`  状态码: ${error.response.status}`);
      console.log(`  响应: ${JSON.stringify(error.response.data)}`);
    }
    return false;
  }
}

// 测试 2: 获取打包清单模板统计
async function testGetPackingTemplatesStats() {
  logSection('测试 2: 获取打包清单模板统计');

  try {
    const response = await api.get('/api/readiness/admin/packing-templates/stats');

    if (response.data && response.data.success) {
      const data = response.data.data;
      logSuccess('获取模板统计成功');
      console.log(`  总数: ${data.total}`);
      console.log(`  激活: ${data.active}`);
      console.log(`  未激活: ${data.inactive}`);
      console.log(`  最新版本: ${data.latestVersion || 'N/A'}`);
      console.log(`  最后更新: ${data.latestUpdated || 'N/A'}`);

      return true;
    } else {
      logError('获取模板统计失败');
      console.log(`  错误: ${JSON.stringify(response.data?.error)}`);
      return false;
    }
  } catch (error: any) {
    logError(`获取模板统计失败: ${error.message}`);
    if (error.response) {
      console.log(`  状态码: ${error.response.status}`);
      console.log(`  响应: ${JSON.stringify(error.response.data)}`);
    }
    return false;
  }
}

// 测试 3: 获取打包指南列表
async function testGetPackingGuides() {
  logSection('测试 3: 获取打包指南列表');

  try {
    const response = await api.get('/api/readiness/admin/packing-guides', {
      params: { page: 1, limit: 20 },
    });

    if (response.data && response.data.success) {
      const data = response.data.data;
      logSuccess('获取指南列表成功');
      console.log(`  总数: ${data.total}`);
      console.log(`  当前页: ${data.page}`);
      console.log(`  每页数量: ${data.limit}`);
      console.log(`  总页数: ${data.totalPages}`);
      console.log(`  指南数量: ${data.guides.length}`);

      if (data.guides.length > 0) {
        const guide = data.guides[0];
        console.log(`\n  第一个指南:`);
        console.log(`    ID: ${guide.id}`);
        console.log(`    版本: ${guide.version}`);
        console.log(`    最后更新: ${guide.lastUpdated}`);
        console.log(`    是否激活: ${guide.isActive}`);
        if (guide.metadata) {
          console.log(`    元数据版本: ${guide.metadata.version || 'N/A'}`);
        }
      }

      return true;
    } else {
      logError('获取指南列表失败');
      console.log(`  错误: ${JSON.stringify(response.data?.error)}`);
      return false;
    }
  } catch (error: any) {
    logError(`获取指南列表失败: ${error.message}`);
    if (error.response) {
      console.log(`  状态码: ${error.response.status}`);
      console.log(`  响应: ${JSON.stringify(error.response.data)}`);
    }
    return false;
  }
}

// 测试 4: 获取打包指南统计
async function testGetPackingGuidesStats() {
  logSection('测试 4: 获取打包指南统计');

  try {
    const response = await api.get('/api/readiness/admin/packing-guides/stats');

    if (response.data && response.data.success) {
      const data = response.data.data;
      logSuccess('获取指南统计成功');
      console.log(`  总数: ${data.total}`);
      console.log(`  激活: ${data.active}`);
      console.log(`  未激活: ${data.inactive}`);
      console.log(`  最新版本: ${data.latestVersion || 'N/A'}`);
      console.log(`  最后更新: ${data.latestUpdated || 'N/A'}`);

      return true;
    } else {
      logError('获取指南统计失败');
      console.log(`  错误: ${JSON.stringify(response.data?.error)}`);
      return false;
    }
  } catch (error: any) {
    logError(`获取指南统计失败: ${error.message}`);
    if (error.response) {
      console.log(`  状态码: ${error.response.status}`);
      console.log(`  响应: ${JSON.stringify(error.response.data)}`);
    }
    return false;
  }
}

// 测试 5: 测试搜索功能
async function testSearch() {
  logSection('测试 5: 测试搜索功能');

  try {
    // 测试模板搜索
    const templateResponse = await api.get('/api/readiness/admin/packing-templates', {
      params: { page: 1, limit: 20, search: '1.0.0' },
    });

    if (templateResponse.data && templateResponse.data.success) {
      logSuccess('模板搜索成功');
      console.log(`  搜索结果: ${templateResponse.data.data.templates.length} 条`);
    } else {
      logError('模板搜索失败');
    }

    // 测试指南搜索
    const guideResponse = await api.get('/api/readiness/admin/packing-guides', {
      params: { page: 1, limit: 20, search: '1.0.0' },
    });

    if (guideResponse.data && guideResponse.data.success) {
      logSuccess('指南搜索成功');
      console.log(`  搜索结果: ${guideResponse.data.data.guides.length} 条`);
    } else {
      logError('指南搜索失败');
    }

    return true;
  } catch (error: any) {
    logError(`搜索测试失败: ${error.message}`);
    return false;
  }
}

// 主测试函数
async function main() {
  console.log(`${colors.yellow}
╔══════════════════════════════════════════════════════════════════════╗
║           ⚠️  打包清单模板管理接口已删除                              ║
║           请使用 ReadinessPack 接口获取打包数据                       ║
╚══════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

  logInfo(`API Base URL: ${API_BASE_URL}`);
  logError('这些接口已被删除，请使用 ReadinessPack 接口代替');
  console.log(`\n${colors.cyan}推荐使用:`);
  console.log(`  GET /api/readiness/admin/packs/:id?includePacking=true${colors.reset}\n`);
  
  process.exit(0);

  const results = {
    templates: false,
    templatesStats: false,
    guides: false,
    guidesStats: false,
    search: false,
  };

  try {
    // 测试所有接口
    results.templates = await testGetPackingTemplates();
    results.templatesStats = await testGetPackingTemplatesStats();
    results.guides = await testGetPackingGuides();
    results.guidesStats = await testGetPackingGuidesStats();
    results.search = await testSearch();

    // 测试总结
    logSection('测试总结');
    console.log('测试结果:');
    console.log(`  ${results.templates ? '✅' : '❌'} 获取打包清单模板列表`);
    console.log(`  ${results.templatesStats ? '✅' : '❌'} 获取打包清单模板统计`);
    console.log(`  ${results.guides ? '✅' : '❌'} 获取打包指南列表`);
    console.log(`  ${results.guidesStats ? '✅' : '❌'} 获取打包指南统计`);
    console.log(`  ${results.search ? '✅' : '❌'} 搜索功能`);

    const successCount = Object.values(results).filter(Boolean).length;
    const totalCount = Object.keys(results).length;
    console.log(`\n成功率: ${successCount}/${totalCount} (${Math.round(successCount / totalCount * 100)}%)`);

    if (successCount === totalCount) {
      logSuccess('所有测试通过！');
    } else {
      logError('部分测试失败，请检查上述错误信息');
      process.exit(1);
    }

    console.log(`\n${colors.cyan}💡 提示:`);
    console.log(`  - 所有接口都需要 /api 前缀`);
    console.log(`  - 支持分页、筛选、搜索功能`);
    console.log(`  - 默认只返回激活的记录${colors.reset}\n`);

  } catch (error: any) {
    logError(`测试失败: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  main().catch((error) => {
    console.error('未捕获的错误:', error);
    process.exit(1);
  });
}

export { main };
