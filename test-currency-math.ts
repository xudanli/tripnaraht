// test-currency-math.ts
// 测试脚本：验证货币速算工具类

import { CurrencyMathUtil } from './src/common/utils/currency-math.util';

const scenarios = [
  { currency: 'JPY (日元)', rate: 0.0483, code: 'JPY', name: '日元' },
  { currency: 'KRW (韩元)', rate: 0.0052, code: 'KRW', name: '韩元' },
  { currency: 'THB (泰铢)', rate: 0.208, code: 'THB', name: '泰铢' },
  { currency: 'TWD (台币)', rate: 0.225, code: 'TWD', name: '新台币' },
  { currency: 'USD (美元)', rate: 7.24, code: 'USD', name: '美元' },
  { currency: 'GBP (英镑)', rate: 9.12, code: 'GBP', name: '英镑' },
  { currency: 'HKD (港币)', rate: 0.92, code: 'HKD', name: '港币' },
  { currency: 'VND (越南盾)', rate: 0.00029, code: 'VND', name: '越南盾' },
  { currency: 'EUR (欧元)', rate: 7.85, code: 'EUR', name: '欧元' },
];

console.log('🧪 货币速算工具类测试\n');
console.log('='.repeat(60));

scenarios.forEach((item) => {
  const rule = CurrencyMathUtil.generateRule(item.rate);
  const quickTable = CurrencyMathUtil.generateQuickTable(item.rate);
  const tip = CurrencyMathUtil.formatTip(item.rate, item.code, item.name);

  console.log(`\n💱 ${item.currency}`);
  console.log(`   汇率: 1 ${item.code} = ${item.rate} CNY`);
  console.log(`   速算口诀: "${rule}"`);
  console.log(`   快速对照表:`);
  quickTable.slice(0, 3).forEach((entry) => {
    console.log(`     ${entry.local.toLocaleString()} ${item.code} ≈ ${entry.home} 元`);
  });
  console.log(`   提示文本:`);
  console.log(`   ${tip.split('\n').join('\n   ')}`);
});

console.log('\n' + '='.repeat(60));
console.log('\n✅ 测试完成！');

