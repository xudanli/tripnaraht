// 恢复景点地址字段
// 从 encodedAddress 中重新提取正确的地址

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 从 encodedAddress 中提取地址（改进版）
 */
function extractAddress(encodedAddress: string | null, province: string | null, name: string | null): string | null {
  if (!encodedAddress) return null;

  let address = encodedAddress;

  // 移除省份重复（如果存在）
  if (province) {
    // 格式可能是：北京市北京市... 或 河北省河北省...
    if (address.startsWith(province + province)) {
      address = address.substring(province.length);
    } else if (address.startsWith(province)) {
      // 保留省份，继续处理
      // address = address; // 保持不变
    }
  }

  // 移除景点名称（通常在最后）
  // 注意：要保留区县信息（如"商水县"），不要移除
  if (name) {
    // 检查名称是否包含区县信息（格式：区县+景点名，如"商水县叶氏庄园"）
    const countyMatch = name.match(/^([^市区县]+[市区县])(.+)$/);
    
    if (countyMatch) {
      // 名称格式：区县+景点名（如"商水县叶氏庄园"）
      const county = countyMatch[1]; // "商水县"
      const attractionName = countyMatch[2]; // "叶氏庄园"
      
      // 如果地址以"区县+景点名"结尾，只移除景点名部分，保留区县
      if (address.endsWith(county + attractionName)) {
        address = address.substring(0, address.length - attractionName.length);
      } else if (address.endsWith(attractionName)) {
        // 如果地址只以景点名结尾，移除景点名
        address = address.substring(0, address.length - attractionName.length);
      } else if (address.endsWith(name)) {
        // 如果地址以完整名称结尾，移除完整名称
        address = address.substring(0, address.length - name.length);
      }
    } else {
      // 名称不包含区县信息，直接移除
      if (address.endsWith(name)) {
        address = address.substring(0, address.length - name.length);
      } else {
        // 尝试移除名称变体
        const nameVariants = [
          name.replace(/景区$/, ''),
          name.replace(/公园$/, ''),
          name.replace(/博物馆$/, ''),
          name.replace(/旅游区$/, ''),
          name.replace(/文化旅游区$/, ''),
          name.replace(/开发有限公司$/, ''),
          name.replace(/世界$/, ''),
        ];

        for (const variant of nameVariants) {
          if (variant && variant.length > 0 && address.endsWith(variant)) {
            address = address.substring(0, address.length - variant.length);
            break;
          }
        }
      }
    }
  }

  // 移除常见的景点名称后缀（如果还有残留）
  address = address.replace(/(景区|公园|博物馆|景点|遗址|度假村|温泉|山庄|古镇|古城|纪念馆|故居|陵园|塔|寺|庙|观|庵|旅游区|文化旅游区|开发有限公司|世界|庄园|故居|纪念馆).*$/, '');

  // 清理重复的城市名和区县名
  // 例如：河南省周口市周口市 -> 河南省周口市
  address = address.replace(/([^省]+省)([^市]+市)\2/, '$1$2');
  
  // 清理重复的区县名（在市级之后）
  // 例如：河北省唐山市迁安市迁安市 -> 河北省唐山市迁安市
  // 匹配模式：城市+区县+重复的区县
  address = address.replace(/([^市]+市)([^市区县]+[市区县])\2([^市区县]*)$/, (match, city, county, rest) => {
    // 如果 rest 为空或只包含景点名称的一部分，移除重复的区县
    return city + county + (rest || '');
  });
  
  // 再次清理：如果还有重复的区县名（更通用的模式）
  address = address.replace(/([^市区县]+[市区县])\1/g, '$1');
  
  // 清理末尾的重复（如果地址以重复的区县结尾）
  address = address.replace(/(.+)([^市区县]+[市区县])\2$/, '$1$2');

  return address.trim() || null;
}

/**
 * 恢复地址字段
 */
async function restoreAddresses() {
  console.log('🔄 开始恢复景点地址字段...\n');

  // 查找需要恢复的记录
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
    LIMIT 5000
  `;

  console.log(`📊 发现 ${problematicRecords.length} 条需要恢复的记录\n`);

  let restored = 0;
  let skipped = 0;
  let errors = 0;

  for (const record of problematicRecords) {
    try {
      const newAddress = extractAddress(record.encodedAddress, record.province, record.name);

      if (newAddress && newAddress.length > 5 && newAddress !== record.address) {
        // 验证新地址是否包含详细信息
        const hasDetail = /(区|县|镇|路|街|号|村|乡|道|巷|弄)/.test(newAddress);
        const isBetter = 
          !record.address || 
          record.address.length < 10 || 
          (newAddress.length > record.address.length && hasDetail);

        if (isBetter) {
          await prisma.rawAttractionData.update({
            where: { id: record.id },
            data: { address: newAddress },
          });

          restored++;
          if (restored <= 10) {
            console.log(`✅ 恢复 ID ${record.id}:`);
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
      if (errors <= 5) {
        console.error(`❌ 恢复失败 ID ${record.id}:`, error.message);
      }
    }
  }

  console.log('\n✅ 恢复完成！\n');
  console.log('📊 统计信息:');
  console.log(`  - 成功恢复: ${restored}`);
  console.log(`  - 跳过: ${skipped}`);
  console.log(`  - 错误: ${errors}`);
}

/**
 * 主函数
 */
async function main() {
  try {
    await restoreAddresses();
  } catch (error: any) {
    console.error('❌ 恢复失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
