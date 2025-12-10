// 修复景点数据中 address 字段的问题
// 如果 address 字段只包含城市名或省份，尝试从 encodedAddress 中提取详细地址

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 从编码地址中提取详细地址
 */
function extractAddressFromEncoded(encodedAddress: string | null, province: string | null, currentAddress: string | null): string | null {
  if (!encodedAddress) return null;

  let address = encodedAddress;

  // 移除省份重复部分（如果存在）
  // 格式可能是：北京市北京市... 或 河北省河北省...
  if (province) {
    const doubleProvince = province + province;
    if (address.startsWith(doubleProvince)) {
      address = address.substring(province.length);
    } else if (address.startsWith(province)) {
      // 检查是否是单个省份开头，后面跟着城市
      const afterProvince = address.substring(province.length);
      // 如果后面直接是城市名（以"市"结尾），保留省份
      if (!afterProvince.startsWith(province) && afterProvince.match(/^[^市]+市/)) {
        // 保留省份，继续处理
      } else {
        address = afterProvince;
      }
    }
  }

  // 尝试移除景点名称（通常在最后）
  // 景点名称通常包含：景区、公园、博物馆、景点、遗址、度假村等关键词
  const attractionPatterns = [
    /^(.+?)(景区|公园|博物馆|景点|遗址|度假村|温泉|山庄|古镇|古城|纪念馆|故居|陵园|塔|寺|庙|观|庵)(.*)$/,
  ];

  for (const pattern of attractionPatterns) {
    const match = address.match(pattern);
    if (match && match[1]) {
      address = match[1].trim();
      break;
    }
  }

  // 如果提取的地址比当前地址更详细，使用新地址
  // 判断标准：新地址应该包含区/县/镇/路/街/号等详细信息
  if (currentAddress) {
    const currentHasDetail = /(区|县|镇|路|街|号|村|乡)/.test(currentAddress);
    const newHasDetail = /(区|县|镇|路|街|号|村|乡)/.test(address);
    
    // 如果当前地址没有详细信息，而新地址有，使用新地址
    if (!currentHasDetail && newHasDetail) {
      return address;
    }
    
    // 如果新地址比当前地址长很多，且包含详细信息，使用新地址
    if (address.length > currentAddress.length + 5 && newHasDetail) {
      return address;
    }
    
    // 如果当前地址太短（少于15个字符），且新地址更长，使用新地址
    if (currentAddress.length < 15 && address.length > currentAddress.length) {
      return address;
    }
  } else {
    // 如果当前地址为空，使用新地址
    return address;
  }

  return null;
}

/**
 * 判断地址是否只是城市名或省份名
 */
function isAddressTooShort(address: string | null, province: string | null): boolean {
  if (!address) return true;
  
  // 如果地址等于省份，说明有问题
  if (address === province) return true;
  
  // 如果地址只包含城市名（以"市"结尾，但不包含区、县、镇、路、街、号等）
  if (address.match(/^[^市区县镇路街号]+市$/)) {
    return true;
  }
  
  // 如果地址太短（少于10个字符），可能不完整
  if (address.length < 10) {
    return true;
  }
  
  return false;
}

/**
 * 修复地址字段
 */
async function fixAddresses() {
  console.log('🔧 开始修复景点地址字段...\n');

  // 查找需要修复的记录
  const problematicRecords = await prisma.$queryRaw<Array<{
    id: number;
    name: string;
    address: string | null;
    province: string | null;
    encodedAddress: string | null;
  }>>`
    SELECT id, name, address, province, "encodedAddress"
    FROM "RawAttractionData"
    WHERE 
      address = province
      OR (address LIKE '%市' AND address NOT LIKE '%区%' AND address NOT LIKE '%县%' AND address NOT LIKE '%镇%' AND address NOT LIKE '%路%' AND address NOT LIKE '%街%' AND address NOT LIKE '%号%')
      OR address IS NULL
      OR LENGTH(address) < 10
    LIMIT 1000
  `;

  console.log(`📊 发现 ${problematicRecords.length} 条需要修复的记录\n`);

  let fixed = 0;
  let skipped = 0;
  let errors = 0;

  for (const record of problematicRecords) {
    try {
      // 尝试从 encodedAddress 提取详细地址
      const newAddress = extractAddressFromEncoded(record.encodedAddress, record.province, record.address);

      if (newAddress && newAddress !== record.address) {
        // 验证新地址是否真的更详细
        const isBetter = 
          (!record.address || record.address.length < 10) || // 原地址太短
          (newAddress.length > (record.address?.length || 0) + 3 && /(区|县|镇|路|街|号|村|乡)/.test(newAddress)); // 新地址更长且包含详细信息

        if (isBetter) {
          await prisma.rawAttractionData.update({
            where: { id: record.id },
            data: { address: newAddress },
          });

          fixed++;
          if (fixed <= 10) {
            console.log(`✅ 修复 ID ${record.id}:`);
            console.log(`   名称: ${record.name}`);
            console.log(`   原地址: ${record.address || '(空)'}`);
            console.log(`   新地址: ${newAddress}`);
          }
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }
    } catch (error: any) {
      errors++;
      console.error(`❌ 修复失败 ID ${record.id}:`, error.message);
    }
  }

  console.log('\n✅ 修复完成！\n');
  console.log('📊 统计信息:');
  console.log(`  - 成功修复: ${fixed}`);
  console.log(`  - 跳过: ${skipped}`);
  console.log(`  - 错误: ${errors}`);
}

/**
 * 主函数
 */
async function main() {
  try {
    await fixAddresses();
  } catch (error: any) {
    console.error('❌ 修复失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
