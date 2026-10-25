/**
 * 将现有路线级 ReadinessPack（pack.{cc}.tpl-{templateId}）迁移到 RoutePackingChecklist。
 *
 * 使用方法：
 *   npx ts-node -r tsconfig-paths/register scripts/migrate-route-packing-checklists-from-readiness-packs.ts
 *   npx ts-node -r tsconfig-paths/register scripts/migrate-route-packing-checklists-from-readiness-packs.ts --dry-run
 *
 * 默认迁移目标（可被 DB 中实际匹配到的 pack.*.tpl-* 扩展）：
 *   66 → pack.is.tpl-66
 *   85 → pack.cn.tpl-85
 *   87 → pack.cn.tpl-87
 *   89 → pack.cn.tpl-89
 *   91 → pack.cn.tpl-91
 *   94 → pack.is.tpl-94
 *   95 → pack.is.tpl-95
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

const KNOWN_PACK_IDS = [
  'pack.is.tpl-66',
  'pack.cn.tpl-85',
  'pack.cn.tpl-87',
  'pack.cn.tpl-89',
  'pack.cn.tpl-91',
  'pack.is.tpl-94',
  'pack.is.tpl-95',
] as const;

const PACK_ID_RE = /^pack\.([a-z]{2})\.tpl-(\d+)$/i;

function parsePackId(packId: string): { countryCode: string; routeTemplateId: number } | null {
  const match = packId.match(PACK_ID_RE);
  if (!match) return null;
  return {
    countryCode: match[1].toUpperCase(),
    routeTemplateId: Number(match[2]),
  };
}

function extractTemplateData(packData: any): Record<string, any> | null {
  const data = packData?.packing?.packingTemplate?.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data;
  }
  // 兼容少数把 packingTemplate 本身当作 data 的写法
  const tpl = packData?.packing?.packingTemplate;
  if (
    tpl &&
    typeof tpl === 'object' &&
    (tpl.quick_checklist_summer || tpl.metadata)
  ) {
    return tpl;
  }
  return null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(
    dryRun
      ? '[dry-run] 不会写入数据库'
      : '开始迁移 RoutePackingChecklist …',
  );

  const knownPacks = await prisma.readinessPack.findMany({
    where: { packId: { in: [...KNOWN_PACK_IDS] } },
  });

  const scanned = await prisma.readinessPack.findMany({
    where: { packId: { contains: '.tpl-' } },
  });

  const byPackId = new Map<string, (typeof scanned)[number]>();
  for (const pack of [...scanned, ...knownPacks]) {
    byPackId.set(pack.packId, pack);
  }

  const candidates = [...byPackId.values()].filter((p) => parsePackId(p.packId));
  console.log(`发现候选 Pack ${candidates.length} 条`);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const failures: Array<{ packId: string; reason: string }> = [];

  for (const pack of candidates) {
    const parsed = parsePackId(pack.packId)!;
    const template = await prisma.routeTemplate.findUnique({
      where: { id: parsed.routeTemplateId },
      include: { routeDirection: true },
    });

    if (!template) {
      failures.push({
        packId: pack.packId,
        reason: `RouteTemplate #${parsed.routeTemplateId} 不存在`,
      });
      continue;
    }

    const templateDataRaw = extractTemplateData(pack.packData);
    if (!templateDataRaw) {
      failures.push({
        packId: pack.packId,
        reason: '缺少 packing.packingTemplate.data',
      });
      continue;
    }

    const countryCode =
      parsed.countryCode ||
      pack.countryCode ||
      template.routeDirection.countryCode;
    const routeName = template.nameCN || template.name || template.nameEN;
    const version =
      String(
        templateDataRaw.metadata?.version ||
          pack.version ||
          pack.packData?.packing?.packingTemplate?.version ||
          '1.0.0',
      );

    const templateData = {
      ...templateDataRaw,
      metadata: {
        ...(templateDataRaw.metadata && typeof templateDataRaw.metadata === 'object'
          ? templateDataRaw.metadata
          : {}),
        source_route_template_id: parsed.routeTemplateId,
        country_code: countryCode,
        ...(routeName ? { route_name: routeName } : {}),
        migrated_from_pack_id: pack.packId,
      },
    };

    const existing = await prisma.routePackingChecklist.findUnique({
      where: { routeTemplateId: parsed.routeTemplateId },
    });

    if (dryRun) {
      console.log(
        `[dry-run] ${existing ? 'UPDATE' : 'CREATE'} template=#${parsed.routeTemplateId} ← ${pack.packId}`,
      );
      if (existing) updated += 1;
      else created += 1;
      continue;
    }

    if (existing) {
      await prisma.routePackingChecklist.update({
        where: { id: existing.id },
        data: {
          countryCode,
          nameCN: pack.displayNameCN || routeName || existing.nameCN,
          nameEN: pack.displayNameEN || template.nameEN || existing.nameEN,
          version,
          isActive: true,
          templateData,
          lastReviewedAt: pack.lastReviewedAt || new Date(),
        },
      });
      updated += 1;
      console.log(`UPDATED template=#${parsed.routeTemplateId} ← ${pack.packId}`);
    } else {
      await prisma.routePackingChecklist.create({
        data: {
          id: randomUUID(),
          routeTemplateId: parsed.routeTemplateId,
          countryCode,
          nameCN: pack.displayNameCN || routeName || null,
          nameEN: pack.displayNameEN || template.nameEN || null,
          version,
          isActive: true,
          templateData,
          lastReviewedAt: pack.lastReviewedAt || new Date(),
        },
      });
      created += 1;
      console.log(`CREATED template=#${parsed.routeTemplateId} ← ${pack.packId}`);
    }
  }

  // 对已知目标做验收扫描
  const targetIds = [66, 85, 87, 89, 91, 94, 95];
  const bound = await prisma.routePackingChecklist.findMany({
    where: { routeTemplateId: { in: targetIds } },
    select: { routeTemplateId: true, id: true, isActive: true },
  });
  const boundSet = new Set(bound.map((b) => b.routeTemplateId));
  const missingTargets = targetIds.filter((id) => !boundSet.has(id));

  console.log('\n=== 迁移结果 ===');
  console.log(`created=${created} updated=${updated} skipped=${skipped}`);
  if (failures.length) {
    console.log('failures:');
    for (const f of failures) {
      console.log(`  - ${f.packId}: ${f.reason}`);
    }
  }
  console.log(
    `目标模板绑定: ${bound.length}/${targetIds.length}` +
      (missingTargets.length
        ? `（缺失: ${missingTargets.join(', ')}）`
        : '（全部就绪）'),
  );

  if (!dryRun && missingTargets.length && candidates.length === 0) {
    console.warn(
      '未在 ReadinessPack 中找到任何 pack.*.tpl-*；请确认库中已有旧数据。',
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
