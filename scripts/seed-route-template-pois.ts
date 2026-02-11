/**
 * 为 RouteTemplate 生成 POI 数据
 * 
 * 基于 RouteDirection 的 signaturePois 和 metadata 为每个 dayPlan 分配 POI
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// POI 数据库：每个路线方向的具体 POI 信息
const ROUTE_POI_DATA: Record<string, Array<{
  day: number;
  pois: Array<{
    nameCN: string;
    nameEN?: string;
    category: string;
    description?: string;
    durationMinutes: number;
    priority: 'MUST_SEE' | 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
  theme: string;
}>> = {
  // ============ 冰岛 ============
  'IS_GOLDEN_CIRCLE': [
    {
      day: 1,
      theme: '地质奇观一日游',
      pois: [
        { nameCN: '辛格维利尔国家公园', nameEN: 'Thingvellir National Park', category: 'NATIONAL_PARK', description: '欧亚/北美板块交界，UNESCO世界遗产', durationMinutes: 90, priority: 'MUST_SEE' },
        { nameCN: '盖歇尔间歇泉', nameEN: 'Geysir Geothermal Area', category: 'NATURAL_WONDER', description: 'Strokkur每5-10分钟喷发', durationMinutes: 60, priority: 'MUST_SEE' },
        { nameCN: '黄金瀑布', nameEN: 'Gullfoss', category: 'WATERFALL', description: '32米双层瀑布', durationMinutes: 45, priority: 'MUST_SEE' },
        { nameCN: '凯瑞斯火山口', nameEN: 'Kerid Crater', category: 'VOLCANIC', description: '火山口湖', durationMinutes: 30, priority: 'MEDIUM' },
      ],
    },
  ],
  
  'IS_RING_ROAD_SOUTH': [
    {
      day: 1,
      theme: '南岸瀑布与冰川',
      pois: [
        { nameCN: '塞里雅兰瀑布', nameEN: 'Seljalandsfoss', category: 'WATERFALL', description: '可从瀑布后方穿行', durationMinutes: 45, priority: 'MUST_SEE' },
        { nameCN: '斯科加瀑布', nameEN: 'Skogafoss', category: 'WATERFALL', description: '60米高瀑布', durationMinutes: 45, priority: 'MUST_SEE' },
        { nameCN: '维克小镇', nameEN: 'Vik', category: 'TOWN', description: '冰岛最南端小镇', durationMinutes: 60, priority: 'HIGH' },
      ],
    },
    {
      day: 2,
      theme: '黑沙滩与冰河湖',
      pois: [
        { nameCN: '雷尼斯黑沙滩', nameEN: 'Reynisfjara Black Sand Beach', category: 'BEACH', description: '玄武岩柱和黑沙滩', durationMinutes: 60, priority: 'MUST_SEE' },
        { nameCN: '杰古沙龙冰河湖', nameEN: 'Jokulsarlon Glacier Lagoon', category: 'GLACIER', description: '漂浮冰山', durationMinutes: 90, priority: 'MUST_SEE' },
        { nameCN: '钻石沙滩', nameEN: 'Diamond Beach', category: 'BEACH', description: '冰块散落黑沙滩', durationMinutes: 45, priority: 'HIGH' },
      ],
    },
  ],
  
  'IS_SNAEFELLSNES': [
    {
      day: 1,
      theme: '冰岛缩影',
      pois: [
        { nameCN: '教堂山', nameEN: 'Kirkjufell', category: 'MOUNTAIN', description: '冰岛最具标志性的山峰', durationMinutes: 45, priority: 'MUST_SEE' },
        { nameCN: '斯奈菲尔冰川', nameEN: 'Snaefellsjokull', category: 'GLACIER', description: '《地心游记》入口', durationMinutes: 60, priority: 'HIGH' },
        { nameCN: '阿尔纳斯塔皮', nameEN: 'Arnarstapi', category: 'COASTAL', description: '玄武岩海蚀洞', durationMinutes: 45, priority: 'HIGH' },
        { nameCN: '黑教堂', nameEN: 'Budir Black Church', category: 'CHURCH', description: '孤独的黑色教堂', durationMinutes: 20, priority: 'MEDIUM' },
      ],
    },
  ],
  
  'IS_RING_ROAD_FULL': [
    { day: 1, theme: '雷克雅未克出发', pois: [
      { nameCN: '雷克雅未克', nameEN: 'Reykjavik', category: 'CITY', durationMinutes: 120, priority: 'HIGH' },
    ]},
    { day: 2, theme: '黄金圈', pois: [
      { nameCN: '辛格维利尔', nameEN: 'Thingvellir', category: 'NATIONAL_PARK', durationMinutes: 90, priority: 'MUST_SEE' },
      { nameCN: '盖歇尔', nameEN: 'Geysir', category: 'NATURAL_WONDER', durationMinutes: 60, priority: 'MUST_SEE' },
      { nameCN: '黄金瀑布', nameEN: 'Gullfoss', category: 'WATERFALL', durationMinutes: 45, priority: 'MUST_SEE' },
    ]},
    { day: 3, theme: '南岸瀑布', pois: [
      { nameCN: '塞里雅兰瀑布', nameEN: 'Seljalandsfoss', category: 'WATERFALL', durationMinutes: 45, priority: 'MUST_SEE' },
      { nameCN: '斯科加瀑布', nameEN: 'Skogafoss', category: 'WATERFALL', durationMinutes: 45, priority: 'MUST_SEE' },
    ]},
    { day: 4, theme: '冰河湖', pois: [
      { nameCN: '杰古沙龙冰河湖', nameEN: 'Jokulsarlon', category: 'GLACIER', durationMinutes: 90, priority: 'MUST_SEE' },
      { nameCN: '钻石沙滩', nameEN: 'Diamond Beach', category: 'BEACH', durationMinutes: 45, priority: 'HIGH' },
    ]},
    { day: 5, theme: '东部峡湾', pois: [
      { nameCN: '塞济斯菲厄泽', nameEN: 'Seydisfjordur', category: 'TOWN', durationMinutes: 120, priority: 'HIGH' },
    ]},
    { day: 6, theme: '北部', pois: [
      { nameCN: '黛提瀑布', nameEN: 'Dettifoss', category: 'WATERFALL', description: '欧洲最强瀑布', durationMinutes: 60, priority: 'MUST_SEE' },
    ]},
    { day: 7, theme: '米湖地区', pois: [
      { nameCN: '米湖', nameEN: 'Myvatn', category: 'LAKE', durationMinutes: 120, priority: 'MUST_SEE' },
      { nameCN: '地热区', nameEN: 'Hverir', category: 'GEOTHERMAL', durationMinutes: 45, priority: 'HIGH' },
    ]},
    { day: 8, theme: '阿克雷里', pois: [
      { nameCN: '阿克雷里', nameEN: 'Akureyri', category: 'CITY', description: '北部首府', durationMinutes: 180, priority: 'HIGH' },
      { nameCN: '众神瀑布', nameEN: 'Godafoss', category: 'WATERFALL', durationMinutes: 45, priority: 'MUST_SEE' },
    ]},
    { day: 9, theme: '西部半岛', pois: [
      { nameCN: '布雷扎峡湾', nameEN: 'Borgarfjordur', category: 'FJORD', durationMinutes: 90, priority: 'MEDIUM' },
    ]},
    { day: 10, theme: '返回雷克雅未克', pois: [
      { nameCN: '蓝湖温泉', nameEN: 'Blue Lagoon', category: 'HOT_SPRING', durationMinutes: 180, priority: 'HIGH' },
    ]},
  ],
  
  'IS_WESTFJORDS': [
    { day: 1, theme: '进入西峡湾', pois: [
      { nameCN: '伊萨菲厄泽', nameEN: 'Isafjordur', category: 'TOWN', durationMinutes: 120, priority: 'HIGH' },
    ]},
    { day: 2, theme: '丁坚地瀑布', pois: [
      { nameCN: '丁坚地瀑布', nameEN: 'Dynjandi', category: 'WATERFALL', description: '西峡湾最壮观瀑布', durationMinutes: 90, priority: 'MUST_SEE' },
    ]},
    { day: 3, theme: '拉特拉尔角', pois: [
      { nameCN: '拉特拉尔角', nameEN: 'Latrabjarg', category: 'CLIFF', description: '欧洲最西端，海鹦栖息地', durationMinutes: 120, priority: 'MUST_SEE' },
    ]},
    { day: 4, theme: '红沙滩', pois: [
      { nameCN: '红沙滩', nameEN: 'Raudasandur', category: 'BEACH', description: '罕见的红色沙滩', durationMinutes: 60, priority: 'HIGH' },
    ]},
    { day: 5, theme: '返程', pois: [
      { nameCN: '霍尔马维克', nameEN: 'Holmavik', category: 'TOWN', durationMinutes: 60, priority: 'MEDIUM' },
    ]},
  ],
  
  'IS_HIGHLANDS': [
    { day: 1, theme: '进入高地', pois: [
      { nameCN: '兰德曼纳劳卡', nameEN: 'Landmannalaugar', category: 'GEOTHERMAL', description: '彩虹山和天然温泉', durationMinutes: 240, priority: 'MUST_SEE' },
    ]},
    { day: 2, theme: '火山徒步', pois: [
      { nameCN: '劳卡吉加火山', nameEN: 'Laugavegur Trail', category: 'HIKING', durationMinutes: 360, priority: 'MUST_SEE' },
    ]},
    { day: 3, theme: '阿斯卡火山', pois: [
      { nameCN: '阿斯卡火山', nameEN: 'Askja', category: 'VOLCANIC', description: '火山口湖', durationMinutes: 180, priority: 'MUST_SEE' },
    ]},
    { day: 4, theme: '凯尔灵加尔', pois: [
      { nameCN: '凯尔灵加尔', nameEN: 'Kerlingarfjoll', category: 'MOUNTAIN', description: '冰川与地热', durationMinutes: 240, priority: 'HIGH' },
    ]},
    { day: 5, theme: '返回', pois: [
      { nameCN: '斯普伦吉桑杜尔', nameEN: 'Sprengisandur', category: 'DESERT', description: 'F26内陆沙漠', durationMinutes: 300, priority: 'HIGH' },
    ]},
  ],
  
  // ============ 格陵兰 ============
  'GL_ILULISSAT_ICE_FJORD': [
    { day: 1, theme: '冰峡湾探索', pois: [
      { nameCN: '伊卢利萨特冰峡湾', nameEN: 'Ilulissat Icefjord', category: 'GLACIER', description: 'UNESCO世界遗产', durationMinutes: 240, priority: 'MUST_SEE' },
      { nameCN: '塞尔梅库亚勒克冰川', nameEN: 'Sermeq Kujalleq', category: 'GLACIER', description: '世界最活跃冰川之一', durationMinutes: 120, priority: 'MUST_SEE' },
    ]},
    { day: 2, theme: '午夜太阳游船', pois: [
      { nameCN: '冰山游船', nameEN: 'Iceberg Boat Tour', category: 'ACTIVITY', durationMinutes: 180, priority: 'MUST_SEE' },
      { nameCN: '伊卢利萨特镇', nameEN: 'Ilulissat Town', category: 'TOWN', durationMinutes: 120, priority: 'HIGH' },
    ]},
  ],
  
  'GL_DISKO_BAY': [
    { day: 1, theme: '迪斯科岛', pois: [
      { nameCN: '克库塔克', nameEN: 'Qeqertarsuaq', category: 'TOWN', durationMinutes: 180, priority: 'HIGH' },
    ]},
    { day: 2, theme: '浮冰探险', pois: [
      { nameCN: '迪斯科湾浮冰', nameEN: 'Disko Bay Icebergs', category: 'GLACIER', durationMinutes: 300, priority: 'MUST_SEE' },
    ]},
    { day: 3, theme: '返回', pois: [
      { nameCN: '鲸鱼观赏', nameEN: 'Whale Watching', category: 'ACTIVITY', durationMinutes: 180, priority: 'HIGH' },
    ]},
  ],
  
  // ============ 阿根廷 ============
  'AR_MARTIAL_GLACIER': [
    { day: 1, theme: 'Martial冰川徒步', pois: [
      { nameCN: 'Martial冰川', nameEN: 'Martial Glacier', category: 'GLACIER', description: '乌斯怀亚最近的冰川', durationMinutes: 240, priority: 'MUST_SEE' },
      { nameCN: '缆车站观景台', nameEN: 'Aerosilla Viewpoint', category: 'VIEWPOINT', durationMinutes: 30, priority: 'HIGH' },
    ]},
  ],
  
  'AR_LAGUNA_ESMERALDA': [
    { day: 1, theme: '翡翠湖徒步', pois: [
      { nameCN: '翡翠湖', nameEN: 'Laguna Esmeralda', category: 'LAKE', description: '火地岛最美湖泊', durationMinutes: 300, priority: 'MUST_SEE' },
      { nameCN: '泥炭沼泽', nameEN: 'Turberas', category: 'WETLAND', durationMinutes: 60, priority: 'MEDIUM' },
    ]},
  ],
  
  'AR_TIERRA_DEL_FUEGO_COASTAL': [
    { day: 1, theme: '火地岛国家公园', pois: [
      { nameCN: '世界尽头火车', nameEN: 'End of the World Train', category: 'ACTIVITY', durationMinutes: 90, priority: 'HIGH' },
      { nameCN: '拉帕塔亚湾', nameEN: 'Lapataia Bay', category: 'COASTAL', description: '泛美公路终点', durationMinutes: 60, priority: 'MUST_SEE' },
      { nameCN: 'Roca湖', nameEN: 'Lago Roca', category: 'LAKE', durationMinutes: 45, priority: 'MEDIUM' },
    ]},
  ],
  
  'AR_BEAGLE_CHANNEL_CRUISE': [
    { day: 1, theme: '比格尔海峡游船', pois: [
      { nameCN: '海狮岛', nameEN: 'Isla de los Lobos', category: 'WILDLIFE', durationMinutes: 30, priority: 'HIGH' },
      { nameCN: '鸟岛', nameEN: 'Isla de los Pajaros', category: 'WILDLIFE', durationMinutes: 30, priority: 'HIGH' },
      { nameCN: '灯塔岛', nameEN: 'Les Eclaireurs Lighthouse', category: 'LANDMARK', description: '世界尽头灯塔', durationMinutes: 20, priority: 'MUST_SEE' },
    ]},
  ],
  
  // ============ 阿尔卑斯 ============
  'TMB_TOUR_DU_MONT_BLANC': [
    { day: 1, theme: '莱苏什出发', pois: [{ nameCN: '莱苏什', nameEN: 'Les Houches', category: 'TOWN', durationMinutes: 60, priority: 'HIGH' }]},
    { day: 2, theme: 'Les Contamines', pois: [{ nameCN: '圣母礼拜堂', nameEN: 'Notre-Dame de la Gorge', category: 'CHURCH', durationMinutes: 30, priority: 'MEDIUM' }]},
    { day: 3, theme: 'Col du Bonhomme', pois: [{ nameCN: '博纳姆山口', nameEN: 'Col du Bonhomme', category: 'MOUNTAIN_PASS', durationMinutes: 60, priority: 'MUST_SEE' }]},
    { day: 4, theme: '进入意大利', pois: [{ nameCN: '塞涅山口', nameEN: 'Col de la Seigne', category: 'MOUNTAIN_PASS', durationMinutes: 60, priority: 'MUST_SEE' }]},
    { day: 5, theme: 'Courmayeur', pois: [{ nameCN: '库尔马耶尔', nameEN: 'Courmayeur', category: 'TOWN', durationMinutes: 180, priority: 'HIGH' }]},
    { day: 6, theme: 'Val Ferret', pois: [{ nameCN: '费雷谷', nameEN: 'Val Ferret', category: 'VALLEY', durationMinutes: 300, priority: 'HIGH' }]},
    { day: 7, theme: '进入瑞士', pois: [{ nameCN: '大费雷山口', nameEN: 'Grand Col Ferret', category: 'MOUNTAIN_PASS', durationMinutes: 60, priority: 'MUST_SEE' }]},
    { day: 8, theme: 'Champex', pois: [{ nameCN: '尚佩湖', nameEN: 'Lac de Champex', category: 'LAKE', durationMinutes: 90, priority: 'HIGH' }]},
    { day: 9, theme: 'Trient', pois: [{ nameCN: '特里昂冰川', nameEN: 'Trient Glacier', category: 'GLACIER', durationMinutes: 60, priority: 'HIGH' }]},
    { day: 10, theme: '返回法国', pois: [{ nameCN: '白湖', nameEN: 'Lac Blanc', category: 'LAKE', description: '勃朗峰倒影', durationMinutes: 90, priority: 'MUST_SEE' }]},
  ],
  
  'CH_JUNGFRAU_REGION': [
    { day: 1, theme: '因特拉肯', pois: [{ nameCN: '因特拉肯', nameEN: 'Interlaken', category: 'CITY', durationMinutes: 180, priority: 'HIGH' }]},
    { day: 2, theme: '少女峰', pois: [{ nameCN: '少女峰', nameEN: 'Jungfraujoch', category: 'MOUNTAIN', description: '欧洲之巅', durationMinutes: 300, priority: 'MUST_SEE' }]},
    { day: 3, theme: '格林德尔瓦尔德', pois: [{ nameCN: 'First悬崖步道', nameEN: 'First Cliff Walk', category: 'VIEWPOINT', durationMinutes: 180, priority: 'HIGH' }]},
    { day: 4, theme: '劳特布龙嫩', pois: [{ nameCN: '施陶河瀑布', nameEN: 'Staubbach Falls', category: 'WATERFALL', durationMinutes: 60, priority: 'HIGH' }]},
    { day: 5, theme: '雪朗峰', pois: [{ nameCN: '雪朗峰', nameEN: 'Schilthorn', category: 'MOUNTAIN', description: '007电影取景地', durationMinutes: 240, priority: 'MUST_SEE' }]},
  ],
  
  'CH_MATTERHORN_REGION': [
    { day: 1, theme: '采尔马特', pois: [{ nameCN: '采尔马特', nameEN: 'Zermatt', category: 'TOWN', durationMinutes: 180, priority: 'HIGH' }]},
    { day: 2, theme: '戈尔内格拉特', pois: [{ nameCN: '戈尔内格拉特', nameEN: 'Gornergrat', category: 'VIEWPOINT', description: '马特洪峰最佳观景点', durationMinutes: 240, priority: 'MUST_SEE' }]},
    { day: 3, theme: '冰川天堂', pois: [{ nameCN: '马特洪冰川天堂', nameEN: 'Matterhorn Glacier Paradise', category: 'GLACIER', durationMinutes: 240, priority: 'MUST_SEE' }]},
    { day: 4, theme: '五湖徒步', pois: [{ nameCN: '五湖徒步', nameEN: '5-Seenweg', category: 'HIKING', durationMinutes: 300, priority: 'HIGH' }]},
    { day: 5, theme: '返程', pois: [{ nameCN: '里弗尔湖', nameEN: 'Riffelsee', category: 'LAKE', description: '马特洪峰倒影', durationMinutes: 90, priority: 'MUST_SEE' }]},
  ],
  
  // ============ 尼泊尔 EBC ============
  'NEPAL_EBC_TREK': [
    { day: 1, theme: '卢卡拉-Phakding', pois: [{ nameCN: '卢卡拉机场', nameEN: 'Lukla Airport', category: 'AIRPORT', durationMinutes: 60, priority: 'HIGH' }]},
    { day: 2, theme: 'Phakding-Namche', pois: [{ nameCN: '杜德科西河', nameEN: 'Dudh Koshi River', category: 'RIVER', durationMinutes: 60, priority: 'MEDIUM' }]},
    { day: 3, theme: 'Namche适应日', pois: [{ nameCN: '南池巴扎', nameEN: 'Namche Bazaar', category: 'TOWN', description: '夏尔巴首都', durationMinutes: 180, priority: 'MUST_SEE' }]},
    { day: 4, theme: 'Namche-Tengboche', pois: [{ nameCN: '腾波切寺', nameEN: 'Tengboche Monastery', category: 'MONASTERY', durationMinutes: 90, priority: 'MUST_SEE' }]},
    { day: 5, theme: 'Tengboche-Dingboche', pois: [{ nameCN: '阿玛达布拉姆峰', nameEN: 'Ama Dablam View', category: 'VIEWPOINT', durationMinutes: 30, priority: 'HIGH' }]},
    { day: 6, theme: 'Dingboche适应日', pois: [{ nameCN: '丁波切村', nameEN: 'Dingboche', category: 'VILLAGE', durationMinutes: 120, priority: 'MEDIUM' }]},
    { day: 7, theme: 'Dingboche-Lobuche', pois: [{ nameCN: '图格拉', nameEN: 'Thukla Pass', category: 'MEMORIAL', durationMinutes: 60, priority: 'HIGH' }]},
    { day: 8, theme: 'Lobuche-Gorak Shep', pois: [{ nameCN: '戈拉克谢普', nameEN: 'Gorak Shep', category: 'BASECAMP', durationMinutes: 60, priority: 'HIGH' }]},
    { day: 9, theme: 'EBC + Kala Patthar', pois: [
      { nameCN: '珠峰大本营', nameEN: 'Everest Base Camp', category: 'BASECAMP', description: '海拔5364米', durationMinutes: 120, priority: 'MUST_SEE' },
      { nameCN: '卡拉帕塔', nameEN: 'Kala Patthar', category: 'VIEWPOINT', description: '海拔5545米，最佳珠峰观景点', durationMinutes: 180, priority: 'MUST_SEE' },
    ]},
    { day: 10, theme: '下撤Pheriche', pois: [{ nameCN: '佩里切', nameEN: 'Pheriche', category: 'VILLAGE', durationMinutes: 60, priority: 'MEDIUM' }]},
    { day: 11, theme: 'Pheriche-Namche', pois: [{ nameCN: '昆琼', nameEN: 'Khumjung', category: 'VILLAGE', durationMinutes: 60, priority: 'MEDIUM' }]},
    { day: 12, theme: 'Namche-Lukla', pois: [{ nameCN: '吊桥', nameEN: 'Hillary Suspension Bridge', category: 'LANDMARK', durationMinutes: 30, priority: 'HIGH' }]},
    { day: 13, theme: '卢卡拉缓冲日', pois: [{ nameCN: '卢卡拉', nameEN: 'Lukla', category: 'TOWN', durationMinutes: 180, priority: 'MEDIUM' }]},
    { day: 14, theme: '返回加德满都', pois: [{ nameCN: '加德满都', nameEN: 'Kathmandu', category: 'CITY', durationMinutes: 180, priority: 'HIGH' }]},
  ],
};

async function updateRouteTemplate(routeDirectionName: string, poiData: typeof ROUTE_POI_DATA[string]) {
  // 查找对应的 RouteTemplate
  const template = await prisma.routeTemplate.findFirst({
    where: {
      routeDirection: { name: routeDirectionName }
    },
    include: { routeDirection: true }
  });
  
  if (!template) {
    console.log(`  ⏭️  Skip: ${routeDirectionName} (no template found)`);
    return false;
  }
  
  // 构建新的 dayPlans
  const dayPlans = poiData.map(dayData => ({
    day: dayData.day,
    theme: dayData.theme,
    pois: dayData.pois.map(poi => ({
      nameCN: poi.nameCN,
      nameEN: poi.nameEN,
      category: poi.category,
      description: poi.description,
      durationMinutes: poi.durationMinutes,
      priority: poi.priority,
    })),
  }));
  
  // 更新模板
  await prisma.routeTemplate.update({
    where: { id: template.id },
    data: {
      dayPlans: dayPlans as unknown as Prisma.InputJsonValue,
      durationDays: poiData.length,
    },
  });
  
  const totalPois = poiData.reduce((sum, d) => sum + d.pois.length, 0);
  console.log(`  ✅ Updated: ${template.nameCN} (${poiData.length}天, ${totalPois}个POI)`);
  return true;
}

async function main() {
  console.log('\n🚀 Updating RouteTemplates with POI data...\n');
  
  let updated = 0;
  let skipped = 0;
  
  for (const [routeName, poiData] of Object.entries(ROUTE_POI_DATA)) {
    const success = await updateRouteTemplate(routeName, poiData);
    if (success) updated++;
    else skipped++;
  }
  
  console.log('\n================================');
  console.log(`📊 Result: Updated ${updated}, Skipped ${skipped}`);
  console.log('================================\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
