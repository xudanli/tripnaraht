// scripts/seed-payment-profiles.ts
// 使用 AI 生成的支付画像数据填充数据库

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

// PaymentType 枚举值（使用字符串字面量）
type PaymentType = 'CASH_HEAVY' | 'BALANCED' | 'DIGITAL_ONLY';

dotenv.config();

const prisma = new PrismaClient();

/**
 * 国家支付画像数据
 * 
 * 基于真实世界的支付习惯和基础设施
 */
interface PaymentProfileData {
  isoCode: string;
  nameCN: string;
  currencyCode: string;
  currencyName: string;
  paymentType: PaymentType;
  paymentInfo: {
    tipping?: string;
    atm_network?: string;
    wallet_apps?: string[];
    cash_preparation?: string;
    notes?: string;
  };
}

/**
 * 第一批：亚洲主要国家（约100行）
 */
const asiaProfiles: PaymentProfileData[] = [
  // 中国
  {
    isoCode: 'CN',
    nameCN: '中国',
    currencyCode: 'CNY',
    currencyName: '人民币',
    paymentType: 'DIGITAL_ONLY' as PaymentType, // 极其依赖移动支付
    paymentInfo: {
      tipping: '完全没有小费文化，餐厅和出租车都不需要给小费。',
      atm_network: '大型银行（如中国银行、工商银行）的 ATM 支持 Visa/Mastercard 取现。',
      wallet_apps: ['Alipay (支付宝)', 'WeChat Pay (微信支付)'],
      cash_preparation: '现金使用率极低。虽然法律规定接受现金，但很多路边摊或小店可能找不开零钱。',
      notes: '二维码支付统治一切。外国游客务必提前下载支付宝/微信，并绑定海外信用卡（现在已支持直接绑定外卡）。',
    },
  },
    // 日本
  {
    isoCode: 'JP',
    nameCN: '日本',
    currencyCode: 'JPY',
    currencyName: '日元',
    paymentType: 'CASH_HEAVY' as PaymentType,
    paymentInfo: {
      tipping: '绝对不要给小费，会被视为无礼。服务费通常已包含在账单中。',
      atm_network: '7-11、Lawson、FamilyMart 的 ATM 支持银联卡取现。邮局 ATM 也支持。',
      wallet_apps: ['Suica (Apple Pay)', 'PayPay', 'LINE Pay', 'Rakuten Pay'],
      cash_preparation: '硬币使用极高（500日元硬币很常见），务必准备零钱袋。建议在国内换好 50,000-100,000 日元现金。',
      notes: '虽然大城市开始接受信用卡，但小餐厅、寺庙、自动贩卖机仍主要使用现金。',
    },
  },
  // 韩国
  {
    isoCode: 'KR',
    nameCN: '韩国',
    currencyCode: 'KRW',
    currencyName: '韩元',
    paymentType: 'BALANCED' as PaymentType,
    paymentInfo: {
      tipping: '通常不需要小费，但高档餐厅可能期望 10% 小费。',
      atm_network: 'KB Bank、Shinhan Bank 的 ATM 支持银联卡。便利店（GS25、CU）ATM 也支持。',
      wallet_apps: ['Kakao Pay', 'Naver Pay', 'Samsung Pay', 'Toss'],
      cash_preparation: '建议携带少量现金（约 100,000-200,000 韩元），大部分地方可刷卡。',
      notes: '首尔等大城市数字化程度高，但传统市场和小店仍需要现金。',
    },
  },
  // 泰国
  {
    isoCode: 'TH',
    nameCN: '泰国',
    currencyCode: 'THB',
    currencyName: '泰铢',
    paymentType: 'BALANCED' as PaymentType,
    paymentInfo: {
      tipping: '餐厅通常给 10% 小费，或留下零钱。按摩、导游等服务可给 50-100 泰铢。',
      atm_network: '所有主要银行 ATM 支持银联卡，但会收取 220 泰铢手续费。建议在国内换好现金。',
      wallet_apps: ['TrueMoney', 'PromptPay', 'Rabbit LINE Pay'],
      cash_preparation: '建议在国内换好 20,000-30,000 泰铢现金。夜市、路边摊、小餐厅主要用现金。',
      notes: '大商场、连锁店可刷卡，但传统市场和街头小贩只收现金。',
    },
  },
  // 新加坡
  {
    isoCode: 'SG',
    nameCN: '新加坡',
    currencyCode: 'SGD',
    currencyName: '新加坡元',
    paymentType: 'DIGITAL_ONLY' as PaymentType,
    paymentInfo: {
      tipping: '通常不需要小费，高档餐厅可能收取 10% 服务费。',
      atm_network: '所有银行 ATM 支持银联卡，手续费较低。',
      wallet_apps: ['PayNow', 'GrabPay', 'FavePay', 'DBS PayLah!'],
      cash_preparation: '基本不需要现金，一张支持 Contactless 的信用卡即可。',
      notes: '新加坡是亚洲最数字化的国家之一，几乎所有地方都支持无接触支付。',
    },
  },
  // 马来西亚
  {
    isoCode: 'MY',
    nameCN: '马来西亚',
    currencyCode: 'MYR',
    currencyName: '马来西亚林吉特',
    paymentType: 'BALANCED' as PaymentType,
    paymentInfo: {
      tipping: '通常不需要小费，但高档餐厅可能期望 10% 小费。',
      atm_network: 'Maybank、CIMB Bank 的 ATM 支持银联卡。',
      wallet_apps: ['GrabPay', 'Touch \'n Go eWallet', 'Boost', 'BigPay'],
      cash_preparation: '建议携带少量现金（约 500-1000 林吉特），大部分地方可刷卡。',
      notes: '大城市数字化程度较高，但小城镇和传统市场仍主要使用现金。',
    },
  },
  // 印度尼西亚
  {
    isoCode: 'ID',
    nameCN: '印度尼西亚',
    currencyCode: 'IDR',
    currencyName: '印尼盾',
    paymentType: 'CASH_HEAVY' as PaymentType,
    paymentInfo: {
      tipping: '餐厅通常给 10% 小费，或留下零钱。',
      atm_network: 'BCA、Mandiri Bank 的 ATM 支持银联卡，但手续费较高。',
      wallet_apps: ['GoPay', 'OVO', 'DANA', 'LinkAja'],
      cash_preparation: '建议在国内换好 2,000,000-5,000,000 印尼盾现金。面额很大，注意数零。',
      notes: '虽然数字钱包很流行，但现金仍是主要支付方式，特别是小商家和偏远地区。',
    },
  },
  // 越南
  {
    isoCode: 'VN',
    nameCN: '越南',
    currencyCode: 'VND',
    currencyName: '越南盾',
    paymentType: 'CASH_HEAVY' as PaymentType,
    paymentInfo: {
      tipping: '餐厅通常给 10% 小费，或留下零钱。',
      atm_network: 'Vietcombank、BIDV 的 ATM 支持银联卡，但手续费较高。',
      wallet_apps: ['MoMo', 'ZaloPay', 'ViettelPay'],
      cash_preparation: '建议在国内换好 5,000,000-10,000,000 越南盾现金。面额极大，注意数零。',
      notes: '现金是主要支付方式，虽然数字钱包在年轻人中流行，但大部分商家仍只收现金。',
    },
  },
  // 菲律宾
  {
    isoCode: 'PH',
    nameCN: '菲律宾',
    currencyCode: 'PHP',
    currencyName: '菲律宾比索',
    paymentType: 'CASH_HEAVY' as PaymentType,
    paymentInfo: {
      tipping: '餐厅通常给 10% 小费，或留下零钱。',
      atm_network: 'BDO、BPI 的 ATM 支持银联卡，但手续费较高。',
      wallet_apps: ['GCash', 'PayMaya', 'Coins.ph'],
      cash_preparation: '建议在国内换好 20,000-50,000 比索现金。大部分地方只收现金。',
      notes: '现金是主要支付方式，虽然数字钱包在增长，但接受度仍有限。',
    },
  },
];

/**
 * 第二批：欧洲主要国家（约100行）
 */
const europeProfiles: PaymentProfileData[] = [
  // 英国
  {
    isoCode: 'GB',
    nameCN: '英国',
    currencyCode: 'GBP',
    currencyName: '英镑',
    paymentType: 'DIGITAL_ONLY' as PaymentType,
    paymentInfo: {
      tipping: '餐厅通常给 10-12.5% 小费，或查看账单是否已包含服务费。',
      atm_network: '所有银行 ATM 支持银联卡，但手续费较高。建议使用信用卡。',
      wallet_apps: ['Apple Pay', 'Google Pay', 'PayPal', 'Revolut'],
      cash_preparation: '基本不需要现金，一张支持 Contactless 的信用卡即可。',
      notes: '伦敦等大城市几乎完全数字化，但小城镇可能仍需要少量现金。',
    },
  },
  // 法国
  {
    isoCode: 'FR',
    nameCN: '法国',
    currencyCode: 'EUR',
    currencyName: '欧元',
    paymentType: 'BALANCED' as PaymentType,
    paymentInfo: {
      tipping: '餐厅通常给 10% 小费，或查看账单是否已包含服务费（service compris）。',
      atm_network: '所有银行 ATM 支持银联卡，但手续费较高。',
      wallet_apps: ['Apple Pay', 'Google Pay', 'Lydia', 'Paylib'],
      cash_preparation: '建议携带少量现金（约 200-500 欧元），大部分地方可刷卡。',
      notes: '大城市数字化程度高，但小餐厅、市场、公厕可能只收现金。',
    },
  },
  // 德国
  {
    isoCode: 'DE',
    nameCN: '德国',
    currencyCode: 'EUR',
    currencyName: '欧元',
    paymentType: 'CASH_HEAVY' as PaymentType,
    paymentInfo: {
      tipping: '餐厅通常给 5-10% 小费，或四舍五入到整数。',
      atm_network: '所有银行 ATM 支持银联卡，但手续费较高。',
      wallet_apps: ['Apple Pay', 'Google Pay', 'PayPal', 'Giropay'],
      cash_preparation: '建议携带较多现金（约 500-1000 欧元），德国人偏爱现金支付。',
      notes: '德国是欧洲现金使用率最高的国家之一，许多小商家只收现金。',
    },
  },
  // 意大利
  {
    isoCode: 'IT',
    nameCN: '意大利',
    currencyCode: 'EUR',
    currencyName: '欧元',
    paymentType: 'BALANCED' as PaymentType,
    paymentInfo: {
      tipping: '餐厅通常给 10% 小费，或查看账单是否已包含服务费（coperto）。',
      atm_network: '所有银行 ATM 支持银联卡，但手续费较高。',
      wallet_apps: ['Apple Pay', 'Google Pay', 'Satispay'],
      cash_preparation: '建议携带适量现金（约 300-600 欧元），许多小商家只收现金。',
      notes: '大城市可刷卡，但小餐厅、市场、公厕通常只收现金。',
    },
  },
  // 西班牙
  {
    isoCode: 'ES',
    nameCN: '西班牙',
    currencyCode: 'EUR',
    currencyName: '欧元',
    paymentType: 'BALANCED' as PaymentType,
    paymentInfo: {
      tipping: '餐厅通常给 5-10% 小费，或留下零钱。',
      atm_network: '所有银行 ATM 支持银联卡，但手续费较高。',
      wallet_apps: ['Apple Pay', 'Google Pay', 'Bizum'],
      cash_preparation: '建议携带适量现金（约 300-600 欧元），许多小商家只收现金。',
      notes: '大城市可刷卡，但小餐厅、市场、公厕通常只收现金。',
    },
  },
  // 冰岛
  {
    isoCode: 'IS',
    nameCN: '冰岛',
    currencyCode: 'ISK',
    currencyName: '冰岛克朗',
    paymentType: 'DIGITAL_ONLY' as PaymentType,
    paymentInfo: {
      tipping: '无需小费（包含在账单中）。',
      atm_network: '所有银行 ATM 支持银联卡，但手续费较高。',
      wallet_apps: ['Apple Pay', 'Google Pay', 'Strætó (公交)'],
      cash_preparation: '基本不需要现金，一张支持 Contactless 的信用卡即可。',
      notes: '冰岛是欧洲最数字化的国家之一，几乎所有地方都支持无接触支付。',
    },
  },
  // 瑞典
  {
    isoCode: 'SE',
    nameCN: '瑞典',
    currencyCode: 'SEK',
    currencyName: '瑞典克朗',
    paymentType: 'DIGITAL_ONLY' as PaymentType,
    paymentInfo: {
      tipping: '通常不需要小费，但高档餐厅可能期望 10% 小费。',
      atm_network: '所有银行 ATM 支持银联卡，但手续费较高。',
      wallet_apps: ['Swish', 'Apple Pay', 'Google Pay'],
      cash_preparation: '基本不需要现金，瑞典几乎是无现金社会。',
      notes: '瑞典是欧洲最数字化的国家之一，许多商店甚至不接受现金。',
    },
  },
];

/**
 * 第三批：美洲主要国家
 */
const americasProfiles: PaymentProfileData[] = [
    // 🇺🇸 美国
    {
      isoCode: 'US',
      nameCN: '美国',
      currencyCode: 'USD',
      currencyName: '美元',
      paymentType: 'BALANCED' as PaymentType, // 虽然卡通用，但小费文化导致现金仍有必要
      paymentInfo: {
        tipping: '小费文化极其重要！餐厅必给 18-22%，酒吧每杯酒 $1，酒店行李员每件 $2-5。',
        atm_network: 'ATM 遍布，但非本行卡通常收取 $3-5 手续费。',
        wallet_apps: ['Apple Pay', 'Google Pay', 'Venmo (仅限当地)', 'Cash App'],
        cash_preparation: '建议随身携带 20-50 美元的小额现金（$1/$5）用于支付小费。',
        notes: '⚠️ 标价不含税！结账时会额外加上 7%-10% 的消费税。很多小费现在也可以在刷卡机上直接选比例支付。',
      },
    },
  
    // 🇨🇦 加拿大
    {
      isoCode: 'CA',
      nameCN: '加拿大',
      currencyCode: 'CAD',
      currencyName: '加元',
      paymentType: 'DIGITAL_ONLY' as PaymentType,
      paymentInfo: {
        tipping: '与美国类似，餐厅通常需支付 15-20% 小费。',
        atm_network: '五大银行（RBC, TD, Scotiabank 等）ATM 网络密集。',
        wallet_apps: ['Apple Pay', 'Google Pay', 'Interac Flash (当地感应支付)'],
        cash_preparation: '现金使用率极低，即使是购买一杯咖啡通常也是刷卡/手机支付。',
        notes: '加拿大的银行卡终端普遍支持 "Tap to Pay" (非接触支付)。标价通常不含税。',
      },
    },
  
    // 🇲🇽 墨西哥
    {
      isoCode: 'MX',
      nameCN: '墨西哥',
      currencyCode: 'MXN',
      currencyName: '墨西哥比索',
      paymentType: 'CASH_HEAVY' as PaymentType,
      paymentInfo: {
        tipping: '通常在 10-15%，被称为 "Propina"。',
        atm_network: '建议只在银行内部或商场内的 ATM 取款（出于安全考虑）。',
        wallet_apps: ['Mercado Pago', 'WhatsApp (用于沟通价格)'],
        cash_preparation: '路边摊 (Tacos)、小店、公共交通和厕所必须使用现金。',
        notes: '虽然旅游区收美元，但汇率极差。强烈建议在 ATM 取比索消费。',
      },
    },
  
    // 🇧🇷 巴西
    {
      isoCode: 'BR',
      nameCN: '巴西',
      currencyCode: 'BRL',
      currencyName: '巴西雷亚尔',
      paymentType: 'DIGITAL_ONLY' as PaymentType, // 惊人的数字化程度
      paymentInfo: {
        tipping: '通常餐厅会在账单中自动包含 10% 服务费 (Serviço)。',
        atm_network: 'Banco24Horas 是主要的 ATM 网络，支持银联。',
        wallet_apps: ['PIX (当地国民级支付)', 'Apple Pay', 'WhatsApp Pay'],
        cash_preparation: '海滩小贩甚至卖椰子的都随身带刷卡机，现金需求很低。',
        notes: '巴西拥有全球最发达的即时支付系统 "PIX"（类似二维码），但游客通常只能通过信用卡支付，覆盖率极高。',
      },
    },
  
    // 🇦🇷 阿根廷
    {
      isoCode: 'AR',
      nameCN: '阿根廷',
      currencyCode: 'ARS',
      currencyName: '阿根廷比索',
      paymentType: 'CASH_HEAVY' as PaymentType, // 特殊国情：为了汇率
      paymentInfo: {
        tipping: '餐厅通常给 10%。',
        atm_network: '极度不推荐使用 ATM 取现，汇率差且手续费高昂。',
        wallet_apps: ['Mercado Pago', 'Western Union (西联汇款 App)'],
        cash_preparation: '带足崭新的 100 美元现钞！通过 "Blue Dollar" (黑市/西联) 换汇，购买力是官方汇率的近两倍。',
        notes: '⚠️ 这是一个汇率双轨制的国家。虽然现在 Visa/Mastercard 推出了 "MEP" 汇率（接近黑市价），但现金依然是最稳妥且优惠的硬通货。',
      },
    },
  ];

/**
 * 合并所有国家数据
 */
const allProfiles: PaymentProfileData[] = [
  ...asiaProfiles,
  ...europeProfiles,
  ...americasProfiles,
  // 在这里添加您自己的国家数据数组
];

/**
 * 主函数：填充数据库
 */
async function main() {
  console.log('💳 开始填充支付画像数据...\n');

  let successCount = 0;
  let updateCount = 0;
  let createCount = 0;

  for (const profile of allProfiles) {
    try {
      const existing = await prisma.countryProfile.findUnique({
        where: { isoCode: profile.isoCode },
      });

      if (existing) {
        // 更新现有记录
        await prisma.countryProfile.update({
          where: { isoCode: profile.isoCode },
          data: {
            nameCN: profile.nameCN,
            currencyCode: profile.currencyCode,
            currencyName: profile.currencyName,
            paymentType: profile.paymentType as any,
            paymentInfo: profile.paymentInfo as any,
          } as any,
        });
        updateCount++;
        console.log(`✅ 已更新: ${profile.nameCN} (${profile.isoCode})`);
      } else {
        // 创建新记录
        await prisma.countryProfile.create({
          data: {
            isoCode: profile.isoCode,
            nameCN: profile.nameCN,
            currencyCode: profile.currencyCode,
            currencyName: profile.currencyName,
            paymentType: profile.paymentType as any,
            paymentInfo: profile.paymentInfo as any,
          } as any,
        });
        createCount++;
        console.log(`✨ 已创建: ${profile.nameCN} (${profile.isoCode})`);
      }
      successCount++;
    } catch (error) {
      console.error(`❌ 处理 ${profile.nameCN} (${profile.isoCode}) 失败:`, error);
    }
  }

  console.log(`\n📊 统计:`);
  console.log(`  总计: ${allProfiles.length} 个国家`);
  console.log(`  成功: ${successCount} 个`);
  console.log(`  创建: ${createCount} 个`);
  console.log(`  更新: ${updateCount} 个`);
  console.log(`\n✅ 支付画像数据填充完成！`);
}

main()
  .catch((error) => {
    console.error('❌ 执行失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });