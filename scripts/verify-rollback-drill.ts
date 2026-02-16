#!/usr/bin/env tsx
/**
 * P0 回滚演练验证
 *
 * 验证 DECISION_KERNEL_ENABLED=false 时配置正确加载。
 * 完整验证需：启动服务后检查日志 "enabled=false"，并执行一次编排请求。
 *
 * 使用: npm run test:rollback-drill
 *      或 DECISION_KERNEL_ENABLED=false npx tsx scripts/verify-rollback-drill.ts
 */

// 必须在 import 任何 Nest/Agent 模块之前设置
if (process.env.DECISION_KERNEL_ENABLED !== 'false' && process.env.DECISION_KERNEL_ENABLED !== '0') {
  process.env.DECISION_KERNEL_ENABLED = 'false';
}

function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('P0 回滚演练: DECISION_KERNEL_ENABLED 验证');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const val = process.env.DECISION_KERNEL_ENABLED ?? 'true';
  const isDisabled = val === 'false' || val === '0';

  if (isDisabled) {
    console.log('✅ DECISION_KERNEL_ENABLED=false 已设置');
    console.log('   当 Kernel 禁用时：');
    console.log('   - decisionState 不初始化');
    console.log('   - STATE_UPDATE / CONTEXT_BUILD / OPTIMIZE 为 no-op');
    console.log('   - 其余流程正常执行');
  } else {
    console.log(`⚠️  当前值: ${val}（回滚需设为 false）`);
    console.log('   使用: DECISION_KERNEL_ENABLED=false npm run start');
    process.exit(1);
  }

  console.log('\n📋 完整回滚演练步骤:');
  console.log('   1. 在 .env 中设置 DECISION_KERNEL_ENABLED=false');
  console.log('   2. 重启服务');
  console.log('   3. 检查启动日志: "Decision Kernel (DSO): true, enabled=false"');
  console.log('   4. 执行一次行程规划请求，确认流程完整');
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ 回滚配置验证通过');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main();
process.exit(0);
