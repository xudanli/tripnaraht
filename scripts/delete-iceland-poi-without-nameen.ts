/**
 * 删除 nameEN 为 null 或无名地点的冰岛 POI 脚本
 * 
 * 用途：
 * - 删除 nameEN 为 null 且 nameCN 也为空的无效 POI 记录
 * - 或者删除所有 nameEN 为 null 的记录（根据参数决定）
 * - 删除 nameCN 为"无名地点"或 nameEN 为"Unnamed Place"的记录
 * 
 * 使用方法：
 *   tsx scripts/delete-iceland-poi-without-nameen.ts [--dry-run] [--only-without-namecn] [--unnamed-only]
 * 
 * 参数：
 *   --dry-run: 仅预览，不实际删除
 *   --only-without-namecn: 只删除 nameCN 也为空的记录（保留有 nameCN 的，用于后续翻译）
 *   --unnamed-only: 只删除无名地点（nameCN为"无名地点"或nameEN为"Unnamed Place"）
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载 .env 文件
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const onlyWithoutNameCN = args.includes('--only-without-namecn');
  const unnamedOnly = args.includes('--unnamed-only');

  console.log('=== 删除 nameEN 为 null 或无名地点的冰岛 POI 脚本 ===\n');
  console.log(`模式: ${isDryRun ? 'DRY-RUN（仅预览）' : '执行模式'}`);
  if (unnamedOnly) {
    console.log(`删除策略: 只删除无名地点（nameCN为"无名地点"或nameEN为"Unnamed Place"）\n`);
  } else {
    console.log(`删除策略: ${onlyWithoutNameCN ? '只删除 nameCN 也为空的记录' : '删除所有 nameEN 为 null 的记录'}\n`);
  }

  try {
    // 1. 测试数据库连接
    console.log('测试数据库连接...');
    await prisma.$connect();
    console.log('✓ 数据库连接正常\n');

    // 2. 统计要删除的记录
    console.log('统计要删除的记录...');
    
    let stats;
    if (unnamedOnly) {
      // 删除无名地点
      stats = await prisma.$queryRaw<Array<{
        total: bigint;
        with_nameCN: bigint;
        without_nameCN: bigint;
      }>>`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN p."nameCN" IS NOT NULL AND p."nameCN" != '' THEN 1 END) as "with_nameCN",
          COUNT(CASE WHEN p."nameCN" IS NULL OR p."nameCN" = '' THEN 1 END) as "without_nameCN"
        FROM "Place" p
        INNER JOIN "City" c ON p."cityId" = c.id
        WHERE c."countryCode" = 'IS'
          AND (
            (p."nameCN" = '无名地点')
            OR (p."nameEN" = 'Unnamed Place')
            OR (p."nameEN" ILIKE '%unnamed%place%')
            OR (p."nameCN" ILIKE '%无名地点%')
          )
      `;
    } else if (onlyWithoutNameCN) {
      stats = await prisma.$queryRaw<Array<{
        total: bigint;
        with_nameCN: bigint;
        without_nameCN: bigint;
      }>>`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN p."nameCN" IS NOT NULL AND p."nameCN" != '' THEN 1 END) as "with_nameCN",
          COUNT(CASE WHEN p."nameCN" IS NULL OR p."nameCN" = '' THEN 1 END) as "without_nameCN"
        FROM "Place" p
        INNER JOIN "City" c ON p."cityId" = c.id
        WHERE c."countryCode" = 'IS'
          AND (p."nameEN" IS NULL OR p."nameEN" = '')
          AND (p."nameCN" IS NULL OR p."nameCN" = '')
      `;
    } else {
      stats = await prisma.$queryRaw<Array<{
        total: bigint;
        with_nameCN: bigint;
        without_nameCN: bigint;
      }>>`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN p."nameCN" IS NOT NULL AND p."nameCN" != '' THEN 1 END) as "with_nameCN",
          COUNT(CASE WHEN p."nameCN" IS NULL OR p."nameCN" = '' THEN 1 END) as "without_nameCN"
        FROM "Place" p
        INNER JOIN "City" c ON p."cityId" = c.id
        WHERE c."countryCode" = 'IS'
          AND (p."nameEN" IS NULL OR p."nameEN" = '')
      `;
    }

    const total = Number(stats[0]?.total || 0);
    const withNameCN = Number(stats[0]?.with_nameCN || 0);
    const withoutNameCN = Number(stats[0]?.without_nameCN || 0);

    console.log(`  总计: ${total}`);
    console.log(`  有 nameCN: ${withNameCN}`);
    console.log(`  无 nameCN: ${withoutNameCN}\n`);

    if (total === 0) {
      console.log('没有需要删除的记录。');
      return;
    }

    // 3. 预览要删除的记录（前 10 条）
    console.log('预览要删除的记录（前 10 条）...');
    let preview;
    if (unnamedOnly) {
      preview = await prisma.$queryRaw<Array<{
        id: number;
        nameCN: string | null;
        nameEN: string | null;
        category: string;
      }>>`
        SELECT 
          p.id,
          p."nameCN",
          p."nameEN",
          p.category
        FROM "Place" p
        INNER JOIN "City" c ON p."cityId" = c.id
        WHERE c."countryCode" = 'IS'
          AND (
            (p."nameCN" = '无名地点')
            OR (p."nameEN" = 'Unnamed Place')
            OR (p."nameEN" ILIKE '%unnamed%place%')
            OR (p."nameCN" ILIKE '%无名地点%')
          )
        ORDER BY p.id
        LIMIT 10
      `;
    } else if (onlyWithoutNameCN) {
      preview = await prisma.$queryRaw<Array<{
        id: number;
        nameCN: string | null;
        nameEN: string | null;
        category: string;
      }>>`
        SELECT 
          p.id,
          p."nameCN",
          p."nameEN",
          p.category
        FROM "Place" p
        INNER JOIN "City" c ON p."cityId" = c.id
        WHERE c."countryCode" = 'IS'
          AND (p."nameEN" IS NULL OR p."nameEN" = '')
          AND (p."nameCN" IS NULL OR p."nameCN" = '')
        ORDER BY p.id
        LIMIT 10
      `;
    } else {
      preview = await prisma.$queryRaw<Array<{
        id: number;
        nameCN: string | null;
        nameEN: string | null;
        category: string;
      }>>`
        SELECT 
          p.id,
          p."nameCN",
          p."nameEN",
          p.category
        FROM "Place" p
        INNER JOIN "City" c ON p."cityId" = c.id
        WHERE c."countryCode" = 'IS'
          AND (p."nameEN" IS NULL OR p."nameEN" = '')
        ORDER BY p.id
        LIMIT 10
      `;
    }

    preview.forEach((p, i) => {
      console.log(`  ${i + 1}. ID: ${p.id}, nameCN: ${p.nameCN || '(空)'}, category: ${p.category}`);
    });
    if (total > 10) {
      console.log(`  ... 还有 ${total - 10} 条记录\n`);
    } else {
      console.log('');
    }

    // 4. 执行删除
    if (isDryRun) {
      console.log('[DRY-RUN] 将删除以上记录，但不会实际执行');
      if (unnamedOnly) {
        console.log(`[DRY-RUN] 删除 SQL: DELETE FROM "Place" WHERE id IN (SELECT p.id FROM "Place" p INNER JOIN "City" c ON p."cityId" = c.id WHERE c."countryCode" = 'IS' AND ((p."nameCN" = '无名地点') OR (p."nameEN" = 'Unnamed Place') OR (p."nameEN" ILIKE '%unnamed%place%') OR (p."nameCN" ILIKE '%无名地点%')))`);
      } else if (onlyWithoutNameCN) {
        console.log(`[DRY-RUN] 删除 SQL: DELETE FROM "Place" WHERE id IN (SELECT p.id FROM "Place" p INNER JOIN "City" c ON p."cityId" = c.id WHERE c."countryCode" = 'IS' AND (p."nameEN" IS NULL OR p."nameEN" = '') AND (p."nameCN" IS NULL OR p."nameCN" = ''))`);
      } else {
        console.log(`[DRY-RUN] 删除 SQL: DELETE FROM "Place" WHERE id IN (SELECT p.id FROM "Place" p INNER JOIN "City" c ON p."cityId" = c.id WHERE c."countryCode" = 'IS' AND (p."nameEN" IS NULL OR p."nameEN" = ''))`);
      }
    } else {
      console.log('⚠️  开始删除记录...');
      
      // 使用事务删除
      const deleted = await prisma.$transaction(async (tx) => {
        // 先获取要删除的 ID
        let idsToDelete;
        if (unnamedOnly) {
          idsToDelete = await tx.$queryRaw<Array<{ id: number }>>`
            SELECT p.id
            FROM "Place" p
            INNER JOIN "City" c ON p."cityId" = c.id
            WHERE c."countryCode" = 'IS'
              AND (
                (p."nameCN" = '无名地点')
                OR (p."nameEN" = 'Unnamed Place')
                OR (p."nameEN" ILIKE '%unnamed%place%')
                OR (p."nameCN" ILIKE '%无名地点%')
              )
          `;
        } else if (onlyWithoutNameCN) {
          idsToDelete = await tx.$queryRaw<Array<{ id: number }>>`
            SELECT p.id
            FROM "Place" p
            INNER JOIN "City" c ON p."cityId" = c.id
            WHERE c."countryCode" = 'IS'
              AND (p."nameEN" IS NULL OR p."nameEN" = '')
              AND (p."nameCN" IS NULL OR p."nameCN" = '')
          `;
        } else {
          idsToDelete = await tx.$queryRaw<Array<{ id: number }>>`
            SELECT p.id
            FROM "Place" p
            INNER JOIN "City" c ON p."cityId" = c.id
            WHERE c."countryCode" = 'IS'
              AND (p."nameEN" IS NULL OR p."nameEN" = '')
          `;
        }

        const idArray = idsToDelete.map(r => r.id);
        
        if (idArray.length === 0) {
          return 0;
        }

        // 删除记录
        const result = await tx.place.deleteMany({
          where: {
            id: {
              in: idArray,
            },
          },
        });

        return result.count;
      });

      console.log(`✓ 成功删除 ${deleted} 条记录`);
    }

  } catch (error: any) {
    console.error('\n❌ 脚本执行失败:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行脚本
if (require.main === module) {
  main().catch(error => {
    console.error('未处理的错误:', error);
    process.exit(1);
  });
}

export { main };
