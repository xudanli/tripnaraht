#!/usr/bin/env npx tsx
/**
 * 将 CN_CLASSIC_* RouteTemplate dayPlans.pois 绑定到 Place id/uuid。
 *
 *   npx tsx scripts/bind-china-classic-template-places.ts
 *   npx tsx scripts/bind-china-classic-template-places.ts --dry-run
 */
import { PrismaClient, Prisma } from '@prisma/client';
import {
  findCityHubPlace,
  findPlaceByTemplatePoiNames,
} from '../src/route-directions/utils/template-poi-place-match.util';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

/** 经典线常用地名 → 检索别名（避开酒店误匹配） */
const ALIASES: Record<string, string[]> = {
  鸣沙山月牙泉: ['鸣沙山', '月牙泉', '鸣沙山•月牙泉'],
  莫高窟: ['莫高窟', '敦煌莫高'],
  七彩丹霞: ['七彩丹霞', '张掖七彩丹霞'],
  茶卡盐湖: ['茶卡盐湖'],
  茶卡: ['茶卡盐湖'],
  塔尔寺: ['塔尔寺'],
  嘉峪关: ['嘉峪关文物景区', '嘉峪关'],
  嘉峪关关城: ['嘉峪关文物景区', '嘉峪关'],
  '门源油菜花（季节）': ['门源油菜花海', '门源百里油菜花', '油菜花海'],
  门源: ['门源油菜花海', '门源百里油菜花', '门源'],
  祁连: ['祁连风光', '祁连'],
  祁连草原: ['祁连风光', '祁连'],
  扁都口: ['扁都口', '祁连'],
  布达拉宫: ['布达拉宫'],
  大昭寺: ['大昭寺'],
  '大昭寺/八廓': ['大昭寺', '八廓'],
  八廓街: ['八廓街', '八廓', '大昭寺'],
  普达措: ['普达措'],
  香格里拉: ['普达措', '香格里拉'],
  飞来寺观景台: ['飞来寺观景台', '飞来寺', '梅里雪山'],
  九曲十八弯: ['九曲十八弯', '巴音布鲁克'],
  库车王府: ['库车王府', '库车'],
  道孚: ['道孚'],
  聂荣: ['聂荣'],
  念青唐古拉方向: ['纳木错', '当雄'],
  康定: ['康定情歌', '木格措', '康定'],
  雅鲁藏布: ['雅鲁藏布'],
  通麦段: ['通麦', '林芝'],
  '通麦/峡谷段': ['林芝'],
  然乌湖: ['然乌湖', '然乌', '波密'],
  巴松措: ['巴松措', '巴松错'],
  米拉山口: ['米拉山口', '米拉山'],
  '工布江达/中转': ['工布江达', '工布江达县'],
  工布江达: ['工布江达'],
  卡子拉山垭口: ['卡子拉山垭口', '卡子拉山'],
  业拉山垭口: ['业拉山垭口', '业拉山'],
  波密: ['波密'],
  林芝: ['林芝'],
  拉萨: ['布达拉宫', '大昭寺', '八廓街', '拉萨'],
  黔东南: ['榕江', '镇远古镇', '台江'],
  巴山: ['开州', '安康'],
  秦巴: ['安康', '商洛'],
  传统村落: ['镇远古镇', '榕江'],
  成都: ['成都'],
  扎什伦布寺: ['扎什伦布寺景区', '扎什伦布寺'],
  西宁: ['西宁'],
  敦煌: ['敦煌'],
  张掖: ['张掖'],
  '张掖（丹霞周边）': ['七彩丹霞', '张掖'],
  银川: ['银川'],
  西安: ['西安'],
  镇北堡: ['镇北堡'],
  华清宫: ['华清宫'],
  巴音布鲁克: ['巴音布鲁克'],
  独山子: ['独山子大峡谷', '独山子'],
  库车: ['库车王府', '库车'],
  叶城: ['叶城'],
  U型公路: ['雅丹国家地质公园', '敦煌世界地质公园-雅丹', '雅丹景区'],
  水上雅丹: ['雅丹国家地质公园', '敦煌世界地质公园-雅丹', '雅丹景区'],
  雅丹: ['雅丹国家地质公园', '雅丹景区'],
  '敦煌世界地质公园-雅丹': ['雅丹国家地质公园', '敦煌世界地质公园-雅丹'],
  梅里附近: ['飞来寺观景台', '梅里雪山', '德钦'],
  翡翠湖: ['大柴旦翡翠湖', '翡翠湖'],
  大柴旦: ['大柴旦'],
  茶卡镇: ['茶卡镇', '茶卡', '茶卡盐湖'],
  青海湖: ['青海湖景区', '青海湖'],
  理塘: ['理塘'],
  高原县城: ['理塘'],
  芒康: ['芒康'],
  入藏检查站: ['芒康'],
  左贡: ['左贡'],
  东达山: ['东达山垭口', '东达山'],
  新都桥: ['新都桥'],
  狮泉河: ['狮泉河'],
  阿里首府: ['狮泉河'],
  改则: ['改则'],
  措勤: ['措勤'],
  萨嘎: ['萨嘎'],
  仲巴: ['仲巴'],
  札达: ['札达'],
  '古格/土林（可选）': ['古格王国遗址', '古格'],
  德格印经院: ['德格印经院'],
  江达: ['江达'],
  马尔康: ['马尔康'],
  乔尔玛: ['乔尔玛'],
  德钦: ['德钦'],
  盐井: ['盐井古盐田', '盐井'],
  '芒康或盐井': ['芒康', '盐井古盐田'],
  '盐井/芒康方向': ['芒康', '盐井古盐田'],
  终点: ['榕江'],
  '镇远/台江': ['镇远古镇', '台江'],
  '思南/石阡': ['思南', '石阡'],
  '旬邑/淳化方向': ['旬邑', '淳化'],
  '炉霍/道孚方向': ['炉霍', '道孚'],
  '比如/聂荣方向': ['比如', '聂荣'],
  那曲东部: ['比如', '聂荣'],
  那曲镇: ['那曲'],
  昌都补给: ['昌都'],
  高原宿点: ['界山达坂', '甜水海', '改则'],
  日喀则: ['日喀则'],
  昌都: ['昌都'],
  丁青: ['丁青'],
  那曲: ['那曲'],
  当雄: ['当雄'],
  渐进升高: ['香格里拉'],
  适应日: [],
  缓冲: [],
  返程缓冲: [],
  整备: [],
  '整备/返程': [],
  '整备/补给': [],
  '缓冲/轻游': [],
  '缓冲/返程': [],
  起步整备: ['银川'],
  起步: ['大理', '丽江'],
};

const SKIP_TOKENS = new Set([
  '适应日',
  '缓冲',
  '返程缓冲',
  '整备',
  '整备/返程',
  '整备/补给',
  '缓冲/轻游',
  '缓冲/返程',
  '轻游',
  '市区轻游',
  '休整',
  '缓冲休整',
  '深度补给',
  '过渡',
  '东行',
  '南段下山',
  '进山',
  '入山',
  '高海拔适应',
  '无人区',
  '补给点',
  '阿里高原',
  '渐入后藏',
  '抵拉',
  '出盆地',
  '渐升高原',
  '入藏北线',
  '北线廊道',
  '高海拔草原',
  '念青唐古拉沿线',
  '滇藏交接',
  '汇入318廊道',
  '检查站预留',
  '证件与通行许可',
  '天气窗口',
  '双备胎',
]);

function stripDecorators(name: string): string {
  return name
    .replace(/（.*?）/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/方向$/g, '')
    .replace(/一带$/g, '')
    .replace(/周边$/g, '')
    .replace(/段$/g, '')
    .trim();
}

async function resolveName(raw: string): Promise<{
  place: Awaited<ReturnType<typeof findPlaceByTemplatePoiNames>>;
  strategy: string;
}> {
  const name = stripDecorators(raw);
  if (!name || SKIP_TOKENS.has(name) || SKIP_TOKENS.has(raw)) {
    return { place: null, strategy: 'skip' };
  }

  const aliases = ALIASES[raw] ?? ALIASES[name] ?? [];
  // 仅无别名的抽象标签仍可 skip；已配置别名的必须尝试解析
  if (
    aliases.length === 0 &&
    (/适应|缓冲|整备|检修|窗口|许可|补给$/.test(name) || /宿点$/.test(name))
  ) {
    return { place: null, strategy: 'skip' };
  }

  const hit = await findPlaceByTemplatePoiNames(
    prisma,
    { nameCN: name },
    'CN',
    {
      excludeCategories: ['HOTEL', 'RESTAURANT'],
      aliasNames: aliases.length ? aliases : undefined,
      cityFallback: true,
    },
  );
  if (hit) return { place: hit, strategy: 'name_or_alias' };

  const hub = await findCityHubPlace(
    prisma,
    [name, ...aliases],
    'CN',
    ['HOTEL', 'RESTAURANT'],
  );
  if (hub) return { place: hub, strategy: 'city_hub' };

  return { place: null, strategy: 'unresolved' };
}

async function main() {
  const templates = await prisma.routeTemplate.findMany({
    where: {
      isActive: true,
      routeDirection: { name: { startsWith: 'CN_CLASSIC_' }, countryCode: 'CN' },
    },
    include: { routeDirection: { select: { name: true, nameCN: true } } },
  });

  console.log(
    `Binding places for ${templates.length} CN classic templates${dryRun ? ' (dry-run)' : ''}...\n`,
  );

  let totalPois = 0;
  let bound = 0;
  let skipped = 0;
  let unresolved = 0;

  for (const tpl of templates) {
    const dayPlans = Array.isArray(tpl.dayPlans) ? (tpl.dayPlans as any[]) : [];
    const nextDays = [];
    let tplBound = 0;
    let tplTotal = 0;

    for (const day of dayPlans) {
      const pois = Array.isArray(day.pois) ? day.pois : [];
      const nextPois = [];
      const dayHints = [day.overnight, day.theme, day.from, day.to]
        .map((x) => String(x || ''))
        .flatMap((s) => s.split(/[→\->/｜|]/))
        .map((s) => stripDecorators(s))
        .filter(Boolean);

      for (const poi of pois) {
        tplTotal++;
        totalPois++;
        const label = String(poi.nameCN || poi.nameEN || '').trim();
        let { place, strategy } = await resolveName(label);

        // CITY/过夜地二次兜底：用当日 overnight/起终点城市枢纽
        if (!place && strategy !== 'skip') {
          for (const hint of dayHints) {
            const hub = await findCityHubPlace(
              prisma,
              [hint],
              'CN',
              ['HOTEL', 'RESTAURANT'],
            );
            if (hub) {
              place = hub;
              strategy = 'day_context_hub';
              break;
            }
          }
        }

        if (strategy === 'skip') {
          skipped++;
          nextPois.push({ ...poi, bindStatus: 'skipped' });
          continue;
        }
        if (!place) {
          unresolved++;
          nextPois.push({ ...poi, bindStatus: 'unresolved' });
          continue;
        }
        bound++;
        tplBound++;
        nextPois.push({
          ...poi,
          id: place.id,
          uuid: place.uuid,
          nameCN: poi.nameCN || place.nameCN,
          nameEN: poi.nameEN || place.nameEN || undefined,
          category: poi.category || place.category,
          resolvedPlaceNameCN: place.nameCN,
          bindStatus: 'bound',
          bindStrategy: strategy,
        });
      }
      nextDays.push({ ...day, pois: nextPois });
    }

    const rate = tplTotal ? Math.round((tplBound / tplTotal) * 100) : 0;
    console.log(
      `  ${tpl.routeDirection.name} · ${tpl.nameCN}: ${tplBound}/${tplTotal} bound (${rate}%)`,
    );

    if (!dryRun) {
      await prisma.routeTemplate.update({
        where: { id: tpl.id },
        data: {
          dayPlans: nextDays as unknown as Prisma.InputJsonValue,
          metadata: {
            ...((tpl.metadata as object) || {}),
            placeBind: {
              bound: tplBound,
              total: tplTotal,
              rate,
              updatedAt: new Date().toISOString(),
            },
          } as Prisma.InputJsonValue,
        },
      });
    }
  }

  console.log('\n================================');
  console.log(
    `POIs: bound=${bound}, skipped=${skipped}, unresolved=${unresolved}, total=${totalPois}`,
  );
  console.log(
    `Coverage (excl. skipped): ${
      bound + unresolved > 0
        ? Math.round((bound / (bound + unresolved)) * 100)
        : 0
    }%`,
  );
  console.log('================================\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
