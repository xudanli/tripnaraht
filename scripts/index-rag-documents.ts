// scripts/index-rag-documents.ts
/**
 * 索引初始 RAG 文档
 * 
 * 用途：建立知识库，索引 Rail Pass 规则、游记、攻略等文档
 * 
 * 运行方式：
 *   npm run rag:index
 *   或
 *   npx ts-node --project tsconfig.backend.json scripts/index-rag-documents.ts
 * 
 * 添加新文档：
 *   1. 在 documents 数组中添加新的 DocumentIndexItem 对象
 *   2. 参考 docs/RAG_DOCUMENT_TEMPLATE.md 使用模板
 *   3. 运行脚本索引文档
 * 
 * 文档类型：
 *   - rail_pass_rules: Rail Pass 规则文档
 *   - travel_guides: 游记和攻略
 *   - local_insights: 当地洞察
 *   - trail_access_rules: 徒步路线准入规则
 * 
 * 详细文档：
 *   - docs/RAG_DOCUMENT_LIBRARY_MANAGEMENT.md - 完整操作指南
 *   - docs/RAG_DOCUMENT_TEMPLATE.md - 文档模板
 *   - docs/RAG_QUICK_REFERENCE.md - 快速参考
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { RagService } from '../src/rag/services/rag.service';
import { DocumentIndexItem } from '../src/rag/interfaces/rag.interface';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const ragService = app.get(RagService);

  console.log('🚀 开始索引 RAG 文档...\n');

  const documents: DocumentIndexItem[] = [
    // Rail Pass 规则文档
    {
      collection: 'rail_pass_rules',
      title: 'Eurail Global Pass - Iceland Rules',
      content: `Eurail Global Pass is valid in Iceland. The pass allows unlimited travel on Iceland's public transport network.

Key Rules:
- Valid for non-European residents
- Requires seat reservation on certain trains (additional fee applies)
- Not valid on private tour buses
- Seasonal restrictions may apply during winter months (November to February)
- Must be activated before first use
- Children under 4 travel free, children 4-11 travel at 50% discount

Reservation Requirements:
- Seat reservations are mandatory on express trains
- Reservation fee: approximately 5-10 EUR per journey
- Reservations can be made at train stations or online

Validity:
- Valid for travel within Iceland
- Can be combined with ferry services to other Nordic countries
- Check specific train schedules as some routes operate seasonally`,
      source: 'https://www.eurail.com/en/eurail-passes/global-pass',
      countryCode: 'IS',
      tags: ['eurail', 'global', 'iceland', 'rail-pass'],
    },
    {
      collection: 'rail_pass_rules',
      title: 'Interrail Global Pass - Iceland Rules',
      content: `Interrail Global Pass is valid for European residents traveling in Iceland.

Key Rules:
- Valid for European residents only
- Requires seat reservation on certain trains
- Not valid on private tour buses
- Seasonal restrictions during winter (November to February)
- Must be activated before first use

Reservation Requirements:
- Seat reservations are mandatory on express trains
- Reservation fee: approximately 5-10 EUR per journey

Validity:
- Valid for travel within Iceland
- Can be combined with ferry services`,
      source: 'https://www.interrail.eu/en/interrail-passes/global-pass',
      countryCode: 'IS',
      tags: ['interrail', 'global', 'iceland', 'rail-pass'],
    },
    {
      collection: 'rail_pass_rules',
      title: 'Eurail One Country Pass - Iceland',
      content: `Eurail One Country Pass for Iceland allows unlimited travel within Iceland.

Key Rules:
- Valid for non-European residents
- More cost-effective than Global Pass if only visiting Iceland
- Same reservation requirements as Global Pass
- Seasonal restrictions apply

Best for:
- Travelers focusing only on Iceland
- Shorter trips (3-5 days)`,
      source: 'https://www.eurail.com/en/eurail-passes/one-country-pass',
      countryCode: 'IS',
      tags: ['eurail', 'one-country', 'iceland', 'rail-pass'],
    },
    // 冰岛游记和攻略
    {
      collection: 'travel_guides',
      title: 'Iceland Highlands F-Road Experience Guide',
      content: `The Iceland Highlands offer some of the most remote and stunning landscapes in Europe. F-roads (mountain roads) are unpaved tracks that require 4x4 vehicles and offer access to the interior highlands.

Key F-Roads:
- F26 (Sprengisandur): The longest F-road, crossing the highlands from north to south
- F35 (Kjölur): More accessible, connects north and south Iceland
- F208 (Fjallabak): Leads to Landmannalaugar, famous for its colorful rhyolite mountains

Driving Tips:
- F-roads are typically open from mid-June to mid-September
- Always check road conditions before departure
- 4x4 vehicles are mandatory - regular cars are not allowed
- Bring extra fuel, food, and water
- Inform someone of your travel plans
- Download offline maps as there's no cell service

Weather Considerations:
- Weather can change rapidly in the highlands
- High winds are common
- Snow can fall even in summer at higher elevations
- Check weather forecasts from the Icelandic Meteorological Office

Accommodation:
- Highland huts require advance booking (often months ahead)
- Wild camping is allowed but follow Leave No Trace principles
- Some areas have designated campsites

Safety:
- River crossings can be dangerous - assess depth and current
- Never drive through water if unsure
- Carry emergency supplies
- Be prepared for breakdowns (help may be hours away)`,
      source: 'https://www.icelandtravel.is/guides/f-roads/',
      countryCode: 'IS',
      tags: ['iceland', 'highlands', 'f-road', 'travel-guide', 'driving'],
    },
    {
      collection: 'travel_guides',
      title: 'Landmannalaugar Hiking and Hot Springs',
      content: `Landmannalaugar is one of Iceland's most popular hiking destinations, located in the Fjallabak Nature Reserve.

Getting There:
- Accessible via F208 (Fjallabak route)
- Requires 4x4 vehicle
- Road is typically open from late June to early September
- Journey from Reykjavik takes 4-5 hours

Hiking Trails:
- Laugavegur Trail: 4-day trek to Þórsmörk (55 km)
- Day hikes around Landmannalaugar area
- Brennisteinsalda: Colorful rhyolite mountain
- Bláhnjúkur: Blue peak with panoramic views

Hot Springs:
- Natural hot spring at the campsite (free)
- Bring a towel and swimsuit
- Water temperature varies - test before entering
- Popular spot, can get crowded in peak season

Accommodation:
- Mountain hut (booking essential, months in advance)
- Camping area (first-come, first-served)
- No facilities for RVs or large vehicles

What to Bring:
- Hiking boots (essential for trails)
- Warm layers (weather changes quickly)
- Rain gear
- Food and water (limited supplies available)
- Cash (no card facilities)

Best Time to Visit:
- July and August: Best weather, most accessible
- June and September: Fewer crowds, but weather more unpredictable`,
      source: 'https://www.visiticeland.com/article/landmannalaugar',
      countryCode: 'IS',
      tags: ['iceland', 'landmannalaugar', 'hiking', 'hot-springs', 'travel-guide'],
    },
    {
      collection: 'travel_guides',
      title: 'Nepal EBC Trek Guide',
      content: `The Everest Base Camp (EBC) trek is one of the world's most famous high-altitude treks.

Route Overview:
- Starting point: Lukla (2,860m)
- Base Camp: 5,364m
- Typical duration: 12-16 days round trip
- Distance: Approximately 130 km round trip

Altitude Acclimatization:
- Critical for success and safety
- Follow the rule: "Climb high, sleep low"
- Maximum daily ascent: 500m
- Acclimatization days recommended at Namche Bazaar (3,440m) and Dingboche (4,410m)

Key Stops:
- Namche Bazaar: First major stop, good for acclimatization
- Tengboche: Famous monastery
- Dingboche: Another acclimatization point
- Lobuche: Last stop before base camp
- Gorak Shep: Final village before EBC

Permits Required:
- TIMS (Trekkers' Information Management System) card
- Sagarmatha National Park entry permit
- Can be obtained in Kathmandu or Lukla

Best Seasons:
- Spring (March-May): Clear skies, moderate temperatures
- Autumn (September-November): Best weather, peak season
- Winter (December-February): Cold but fewer crowds
- Summer (June-August): Monsoon season, not recommended

What to Bring:
- Warm layers (temperatures drop significantly at altitude)
- Good hiking boots
- Sleeping bag (tea houses provide blankets but can be cold)
- Water purification tablets
- Cash (ATMs limited, most places cash-only)

Tea House Accommodation:
- Basic but comfortable
- Shared rooms common
- Meals available (Dal Bhat is staple)
- Hot showers available (extra cost)

Safety Considerations:
- Altitude sickness is real risk
- Descend if symptoms worsen
- Stay hydrated
- Don't push too hard
- Consider hiring a guide or porter`,
      source: 'https://www.nepaltrekking.com/everest-base-camp-trek',
      countryCode: 'NP',
      tags: ['nepal', 'ebc', 'everest', 'hiking', 'trekking', 'travel-guide'],
    },
    // 当地洞察
    {
      collection: 'local_insights',
      title: 'Iceland F-Road Local Insights',
      content: `Local knowledge about Iceland's F-roads from experienced travelers and locals.

Practical Tips:
- F-roads are not maintained during winter - check official road.is website for current status
- Most rental companies prohibit driving on F-roads with regular vehicles
- Insurance may not cover F-road accidents if driving wrong vehicle type
- Local gas stations in highland areas are rare - fill up before entering
- Highland huts often require booking months in advance, especially in July-August
- Wild camping is legal but must be at least 150m from any building
- Bring your own toilet paper - facilities are basic or non-existent
- Cash is essential - many highland locations don't accept cards

Cultural Notes:
- Locals are very helpful but expect self-sufficiency
- Respect the environment - Icelanders take Leave No Trace seriously
- Don't drive off-road - it's illegal and damages fragile ecosystems
- Weather forecasts are taken seriously - if locals say don't go, listen

Unwritten Rules:
- Always close gates behind you (sheep farming areas)
- Don't approach or feed wild animals
- Hot springs etiquette: remove shoes, shower before entering (if facilities available)
- Mountain huts: clean up after yourself, respect quiet hours`,
      source: 'Local knowledge compilation',
      countryCode: 'IS',
      tags: ['iceland', 'f-road', 'highlands', 'local-insights', 'tips'],
    },
    {
      collection: 'local_insights',
      title: 'Nepal EBC Trek Local Insights',
      content: `Insider tips for the Everest Base Camp trek from experienced trekkers and guides.

Practical Tips:
- Start early each day (6-7 AM) to avoid afternoon weather changes
- Tea house owners are friendly - tipping is appreciated but not mandatory
- Dal Bhat (rice and lentils) is the best value meal - unlimited refills
- Bring snacks from Kathmandu - prices increase significantly at altitude
- Water purification tablets are essential - bottled water gets expensive
- Portable solar charger recommended - electricity is limited and expensive
- Bring warm sleeping bag liner - tea house blankets may not be enough
- Cash is king - ATMs are unreliable, bring enough for entire trek

Cultural Notes:
- Remove shoes before entering tea houses and monasteries
- Always walk clockwise around stupas and prayer wheels
- Greet locals with "Namaste" - it's appreciated
- Photography: ask permission before taking photos of people
- Respect religious sites - no smoking or loud behavior

Health and Safety:
- Diamox (altitude sickness medication) is available in Namche - consider bringing from home
- Local guides know the route well - worth hiring for first-time trekkers
- Porters are strong but human - don't overload them
- Descend immediately if altitude sickness symptoms appear
- Stay hydrated - dehydration worsens altitude sickness

Unwritten Rules:
- Tea house etiquette: order meals in advance (takes time to prepare)
- Hot showers: first come, first served, limited hot water
- Charging devices: often costs extra, bring power bank
- Wi-Fi: available in most tea houses but slow and unreliable
- Early morning departures: be quiet, others are still sleeping`,
      source: 'Local knowledge compilation',
      countryCode: 'NP',
      tags: ['nepal', 'ebc', 'trekking', 'local-insights', 'tips'],
    },
  ];

  console.log(`准备索引 ${documents.length} 个文档...\n`);

  let successCount = 0;
  let failCount = 0;

  for (const doc of documents) {
    try {
      console.log(`📄 索引文档: ${doc.title} (${doc.collection})`);
      const id = await ragService.indexDocument(doc);
      console.log(`   ✅ 成功: ${id}\n`);
      successCount++;
    } catch (error: any) {
      console.error(`   ❌ 失败: ${error.message}\n`);
      failCount++;
    }
  }

  console.log('\n📊 索引完成统计:');
  console.log(`   ✅ 成功: ${successCount}`);
  console.log(`   ❌ 失败: ${failCount}`);
  console.log(`   📝 总计: ${documents.length}`);

  await app.close();
}

bootstrap().catch(console.error);

