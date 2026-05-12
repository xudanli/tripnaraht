#!/usr/bin/env npx tsx
/**
 * 禁用路线方向（isActive=false），并级联禁用其下所有路线模板（与 API / 服务层行为一致）
 *
 * 用法:
 *   npx tsx scripts/disable-route-directions.ts 35 36 37
 *   DISABLE_IDS=35,36,37 npx tsx scripts/disable-route-directions.ts
 *
 * 可选环境变量:
 *   DRY_RUN=1 仅打印将要禁用的记录，不写库
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseIdsFromArgv(): number[] {
  const raw = process.argv.slice(2).filter((a) => /^\d+$/.test(a));
  const fromEnv = process.env.DISABLE_IDS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  const merged = [...raw, ...fromEnv];
  const nums = merged.map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n));
  return [...new Set(nums)].sort((a, b) => a - b);
}

async function disableOne(id: number, dryRun: boolean): Promise<void> {
  const rd = await prisma.routeDirection.findUnique({
    where: { id },
    select: { id: true, name: true, nameCN: true, isActive: true, countryCode: true },
  });
  if (!rd) {
    console.warn(`[skip] 路线方向 id=${id} 不存在`);
    return;
  }

  const templates = await prisma.routeTemplate.findMany({
    where: { routeDirectionId: id },
    select: { id: true, durationDays: true, isActive: true, name: true, nameCN: true },
  });
  const templateActive = templates.filter((t) => t.isActive);

  console.log(
    `[${rd.countryCode}] id=${rd.id} name=${rd.name} nameCN=${rd.nameCN} isActive=${rd.isActive} → 将禁用; 关联模板 ${templates.length} 条（其中当前启用 ${templateActive.length} 条）`,
  );
  if (templateActive.length > 0) {
    templateActive.forEach((t) => {
      console.log(`    模板 id=${t.id} ${t.durationDays}D ${t.nameCN || t.name || ''} isActive=${t.isActive}`);
    });
  }

  if (dryRun) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.routeDirection.update({
      where: { id },
      data: { isActive: false, updatedAt: new Date() },
    });
    await tx.routeTemplate.updateMany({
      where: { routeDirectionId: id },
      data: { isActive: false },
    });
  });
  console.log(`  ✓ 已禁用 id=${id} 及其模板`);
}

async function main() {
  const dryRun = process.env.DRY_RUN === '1';
  const ids = parseIdsFromArgv();

  if (ids.length === 0) {
    console.error('请提供路线方向 ID，例如: npx tsx scripts/disable-route-directions.ts 35 36');
    console.error('或: DISABLE_IDS=35,36 npx tsx scripts/disable-route-directions.ts');
    process.exit(1);
  }

  if (dryRun) {
    console.log('=== DRY_RUN=1 仅预览，不会写入数据库 ===\n');
  }

  for (const id of ids) {
    await disableOne(id, dryRun);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect().finally(() => process.exit(1));
});
