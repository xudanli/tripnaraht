// scripts/seed-iceland-profile.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🇮🇸 正在写入冰岛国家档案...');

  await prisma.countryProfile.upsert({
    where: { isoCode: 'IS' },
    update: {},
    create: {
      isoCode: 'IS',
      nameCN: '冰岛',
      // 🔌 欧洲标准 (双圆孔)
      powerInfo: {
        voltage: '230V',
        frequency: '50Hz',
        plugs: ['C', 'F'] 
      },
      // 🚑 统一紧急电话 112
      emergency: {
        police: '112',
        ambulance: '112',
        fire: '112',
        rescue: '112 (Search & Rescue)' // 冰岛特色：搜救队非常重要
      },
      // 💳 极度数字化
      paymentInfo: {
        type: 'DIGITAL_ONLY', // 几乎不需要现金
        tips: '无需小费 (包含在账单中)',
        apps: ['Apple Pay', 'Google Pay', 'Strætó (公交)']
      },
      // 🛂 申根区
      visaForCN: {
        status: 'VISA_REQUIRED', // 需申根签
        cost: 650, // 约80-90欧元
        link: 'https://www.government.is/diplomatic-missions/embassy-of-iceland-in-beijing/'
      },
      // ✈️ 昂贵的机票
      flightEstimates: {
        low_season: 6000,
        high_season: 12000
      }
    }
  });

  console.log('✅ 冰岛档案写入完成！');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());