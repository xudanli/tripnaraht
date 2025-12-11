import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const prisma = new PrismaClient();

interface AttractionUpdateData {
  name: string;
  phone?: string;
  openingHours?: string;
  ticketPrice?: string;
  visitDuration?: string;
  transportation?: string;
  detailedDescription?: string;
  nearbyAttractions?: string[];
  nearbyTransport?: string[];
}

/**
 * 从JSON文件批量更新景点详细信息
 */
async function updateAttractionsFromFile(filePath: string) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const data: AttractionUpdateData[] = JSON.parse(fileContent);
    
    console.log(`📝 从文件加载 ${data.length} 条景点数据...\n`);
    
    let updated = 0;
    let notFound = 0;
    
    for (const item of data) {
      const existing = await prisma.place.findFirst({
        where: {
          name: item.name,
          category: 'ATTRACTION',
        },
      });
      
      if (!existing) {
        console.log(`❌ 未找到: ${item.name}`);
        notFound++;
        continue;
      }
      
      const currentMetadata = (existing.metadata as any) || {};
      const updatedMetadata = {
        ...currentMetadata,
        phone: item.phone || currentMetadata.phone,
        openingHours: item.openingHours || currentMetadata.openingHours,
        ticketPrice: item.ticketPrice || currentMetadata.ticketPrice,
        visitDuration: item.visitDuration || currentMetadata.visitDuration,
        transportation: item.transportation || currentMetadata.transportation,
        detailedDescription: item.detailedDescription || currentMetadata.detailedDescription,
        nearbyAttractions: item.nearbyAttractions || currentMetadata.nearbyAttractions,
        nearbyTransport: item.nearbyTransport || currentMetadata.nearbyTransport,
        updatedAt: new Date().toISOString(),
      };
      
      await prisma.place.update({
        where: { id: existing.id },
        data: {
          metadata: updatedMetadata as any,
          updatedAt: new Date(),
        },
      });
      
      console.log(`✅ 更新成功: ${item.name}`);
      updated++;
    }
    
    console.log('\n' + '━'.repeat(60));
    console.log('📊 更新统计:');
    console.log(`   成功更新: ${updated}`);
    console.log(`   未找到: ${notFound}`);
    console.log('━'.repeat(60));
    
  } catch (error: any) {
    console.error(`❌ 更新失败: ${error.message}`);
  }
}

/**
 * 生成示例JSON文件
 */
function generateExampleFile() {
  const exampleData: AttractionUpdateData[] = [
    {
      name: '故宫',
      phone: '4009501925',
      openingHours: '08:30-17:00；停止入场时间:16:00 (04月01日-10月31日 周二-周日)不对外开放 (04月01日-10月31日 周一) 08:30-16:30；停止入场时间:15:30 (11月01日-次年03月31日 周二-周日)不对外开放 (11月01日-次年03月31日 周一)',
      ticketPrice: '淡季:大门票40人民币/珍宝馆10人民币/钟表馆10人民币 (11月01日-次年03月31日 周二-周日) 旺季:大门票60人民币/珍宝馆10人民币/钟表馆10人民币 (04月01日-10月31日 周二-周日)',
      visitDuration: '3小时以上',
      transportation: '公交：乘坐1路、2路、52路、120路、观光1线、观光2线在"天安门东"站下车，然后步行约900米到达午门。地铁：乘坐地铁1号线在"天安门东"站下车，步行约900米，即可从午门进入故宫。（故宫博物院的南门）',
      detailedDescription: '北京故宫，旧称紫禁城，是中国乃至世界上保存最完整，规模最大的木质结构古建筑群，被誉为"世界五大宫之首"。内廷以乾清宫、交泰殿、坤宁宫后三宫为中心，以及东西两侧的东六宫和西六宫，是封建帝王与后妃居住之所，也就是俗称的"三宫六院"。故宫内珍藏有大量珍贵文物，据统计有上百万件，占全国文物总数的六分之一。故宫需要从南到北参观，午门是唯一的入口，出口是东华门和神武门。',
      nearbyAttractions: ['景山公园', '北海公园', '天安门广场', '南锣鼓巷', '恭王府'],
      nearbyTransport: ['天安门东(地铁站)', '天安门西(地铁站)', '王府井(地铁站)'],
    },
  ];
  
  const examplePath = path.join(__dirname, 'attractions-data-example.json');
  fs.writeFileSync(examplePath, JSON.stringify(exampleData, null, 2), 'utf-8');
  console.log(`✅ 示例文件已生成: ${examplePath}`);
  console.log('   请编辑此文件，添加更多景点数据，然后运行更新脚本');
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log('📝 手动更新景点详细信息工具\n');
    console.log('使用方法:');
    console.log('  生成示例文件: npm run update:attractions -- --example');
    console.log('  更新数据: npm run update:attractions -- <JSON文件路径>');
    console.log('\n示例:');
    console.log('  npm run update:attractions -- --example');
    console.log('  npm run update:attractions -- scripts/attractions-data.json');
    return;
  }
  
  if (args[0] === '--example') {
    generateExampleFile();
    return;
  }
  
  const filePath = args[0];
  if (!fs.existsSync(filePath)) {
    console.error(`❌ 文件不存在: ${filePath}`);
    return;
  }
  
  await updateAttractionsFromFile(filePath);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('❌ 脚本执行失败:', error);
  process.exit(1);
});
