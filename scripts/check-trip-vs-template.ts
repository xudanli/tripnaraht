import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkTripVsTemplate(tripId: string) {
  try {
    console.log(`\n🔍 检查 Trip: ${tripId}\n`);

    // 1. 查询 Trip 信息
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: {
              include: {
                Place: {
                  select: {
                    id: true,
                    uuid: true,
                    nameCN: true,
                    nameEN: true,
                    category: true,
                  },
                },
              },
              orderBy: {
                startTime: 'asc',
              },
            },
          },
          orderBy: {
            date: 'asc',
          },
        },
      },
    });

    if (!trip) {
      console.error(`❌ Trip ${tripId} 不存在`);
      return;
    }

    console.log(`✅ Trip 信息:`);
    console.log(`  - 名称: ${(trip as any).name || '(无)'}`);
    console.log(`  - 状态: ${trip.status}`);
    console.log(`  - 创建时间: ${trip.createdAt}`);
    console.log(`  - 天数: ${trip.TripDay?.length || 0} 天`);

    // 检查是否从模板创建
    const tripMetadata = trip.metadata as any;
    const createdFromTemplate = tripMetadata?.createdFromTemplate;
    const templateId = tripMetadata?.templateId || tripMetadata?.createdFromTemplate; // 兼容两种格式

    if (createdFromTemplate && templateId) {
      console.log(`\n📋 从模板创建: Template ID = ${templateId}`);
    } else {
      console.log(`\n⚠️  未找到模板信息`);
      console.log(`  metadata:`, JSON.stringify(tripMetadata, null, 2));
    }

    // 2. 查询模板信息
    let template = null;
    if (templateId) {
      template = await prisma.routeTemplate.findUnique({
        where: { id: templateId },
        include: {
          routeDirection: true,
        },
      });

      if (template) {
        console.log(`\n✅ 模板信息:`);
        console.log(`  - 名称: ${template.name}`);
        console.log(`  - 天数: ${template.durationDays} 天`);
        console.log(`  - 是否激活: ${template.isActive}`);

        // 解析模板的 dayPlans
        const templateDayPlans = template.dayPlans as any;
        if (Array.isArray(templateDayPlans)) {
          console.log(`\n📋 模板 dayPlans (${templateDayPlans.length} 天):`);
          templateDayPlans.forEach((plan: any, index: number) => {
        console.log(`\n  第 ${plan.day || index + 1} 天:`);
        console.log(`    - 主题: ${plan.theme || '(无)'}`);
        console.log(`    - requiredNodes: ${plan.requiredNodes?.length || 0} 个`);
        if (plan.requiredNodes?.length > 0) {
          console.log(`      ${plan.requiredNodes.join(', ')}`);
        }
        console.log(`    - pois: ${plan.pois?.length || 0} 个`);
        if (plan.pois?.length > 0) {
          plan.pois.forEach((poi: any, poiIndex: number) => {
            console.log(`      ${poiIndex + 1}. ID=${poi.id || '(无)'}, UUID=${poi.uuid || '(无)'}, required=${poi.required || false}, order=${poi.order || '(无)'}`);
          });
        } else {
          console.log(`    ⚠️  该天没有 pois 数据`);
        }
          });
        } else {
          console.log(`\n⚠️  模板 dayPlans 格式异常:`, typeof templateDayPlans);
        }
      } else {
        console.log(`\n❌ 模板 ${templateId} 不存在`);
      }
    }

    // 3. 查询 Trip 的 Itinerary Items
    // 从 metadata 中提取主题（模拟 enrichTripData 的逻辑）
    const dayThemes = tripMetadata?.dayThemes || {};
    
    console.log(`\n📅 Trip 的行程安排 (${trip.TripDay?.length || 0} 天):`);
    
    if (trip.TripDay && trip.TripDay.length > 0) {
      trip.TripDay.forEach((day: any, index: number) => {
        const dayNumber = index + 1;
        // 从 metadata.dayThemes 中获取主题
        const theme = dayThemes[dayNumber] || day.theme || '(无)';
        
        console.log(`\n  第 ${dayNumber} 天 (${day.date || '无日期'}):`);
        console.log(`    - 主题: ${theme}`);
        console.log(`    - POI数量: ${day.ItineraryItem?.length || 0} 个`);

        if (day.ItineraryItem && day.ItineraryItem.length > 0) {
          day.ItineraryItem.forEach((item: any, itemIndex: number) => {
            const place = item.Place;
            // 从 note 字段解析 isRequired（检查是否包含 [必游] 标记）
            const isRequired = item.note?.includes('[必游]') || false;
            
            console.log(`      ${itemIndex + 1}. ${place?.nameCN || place?.nameEN || '(无名称)'}`);
            console.log(`         - Place ID: ${place?.id || '(无)'}`);
            console.log(`         - Place UUID: ${place?.uuid || '(无)'}`);
            console.log(`         - 类别: ${place?.category || '(无)'}`);
            console.log(`         - 是否必需: ${isRequired}`);
            if (item.note) {
              console.log(`         - 备注: ${item.note}`);
            }
          });
        } else {
          console.log(`    ⚠️  该天没有 POI`);
        }
      });
    } else {
      console.log(`\n⚠️  Trip 没有行程安排`);
    }
    
    // 显示 metadata 中的 dayThemes（用于调试）
    if (Object.keys(dayThemes).length > 0) {
      console.log(`\n📋 Trip Metadata 中的主题:`);
      Object.entries(dayThemes).forEach(([day, theme]) => {
        console.log(`  第 ${day} 天: ${theme}`);
      });
    } else {
      console.log(`\n⚠️  Trip Metadata 中没有 dayThemes`);
    }

    // 4. 对比分析
    if (template && trip.TripDay) {
      console.log(`\n🔍 对比分析:\n`);
      
      const templateDayPlans = template.dayPlans as any;
      if (Array.isArray(templateDayPlans)) {
        for (let i = 0; i < Math.max(templateDayPlans.length, trip.TripDay.length); i++) {
          const templateDay = templateDayPlans[i];
          const tripDay = trip.TripDay[i];
          
          console.log(`\n第 ${i + 1} 天对比:`);
          
          if (!templateDay) {
            console.log(`  ❌ 模板中没有第 ${i + 1} 天`);
            continue;
          }
          
          if (!tripDay) {
            console.log(`  ❌ Trip 中没有第 ${i + 1} 天`);
            continue;
          }

          // 对比主题
          const templateTheme = templateDay.theme || '(无)';
          // 从metadata.dayThemes中获取主题（模拟enrichTripData的逻辑）
          const dayNumber = i + 1;
          const tripTheme = dayThemes[dayNumber] || '(无)';
          if (templateTheme !== tripTheme) {
            console.log(`  ⚠️  主题不一致:`);
            console.log(`    模板: ${templateTheme}`);
            console.log(`    Trip: ${tripTheme}`);
          } else {
            console.log(`  ✅ 主题一致: ${templateTheme}`);
          }

          // 对比 POI
          const templatePois = templateDay.pois || [];
          const tripPois = tripDay.ItineraryItem || [];
          
          console.log(`  📊 POI 数量:`);
          console.log(`    模板: ${templatePois.length} 个`);
          console.log(`    Trip: ${tripPois.length} 个`);

          // 检查模板中的 POI 是否都在 Trip 中
          const tripPlaceIds = new Set(tripPois.map((item: any) => item.Place?.id).filter(Boolean));
          const tripPlaceUuids = new Set(tripPois.map((item: any) => item.Place?.uuid).filter(Boolean));

          const missingPois: any[] = [];
          templatePois.forEach((templatePoi: any) => {
            const found = 
              (templatePoi.id && tripPlaceIds.has(templatePoi.id)) ||
              (templatePoi.uuid && tripPlaceUuids.has(templatePoi.uuid));
            
            if (!found) {
              missingPois.push(templatePoi);
            }
          });

          if (missingPois.length > 0) {
            console.log(`  ❌ 模板中的 ${missingPois.length} 个 POI 未在 Trip 中找到:`);
            missingPois.forEach((poi: any) => {
              console.log(`     - ID=${poi.id || '(无)'}, UUID=${poi.uuid || '(无)'}, required=${poi.required || false}`);
            });
          } else if (templatePois.length > 0) {
            console.log(`  ✅ 模板中的所有 POI 都在 Trip 中`);
          }

          // 检查 Trip 中是否有额外的 POI
          const extraPois = tripPois.filter((item: any) => {
            const placeId = item.Place?.id;
            const placeUuid = item.Place?.uuid;
            
            return !templatePois.some((tp: any) => 
              (tp.id && tp.id === placeId) || 
              (tp.uuid && tp.uuid === placeUuid)
            );
          });

          if (extraPois.length > 0) {
            console.log(`  ℹ️  Trip 中有 ${extraPois.length} 个额外的 POI (可能是LLM添加的):`);
            extraPois.forEach((item: any) => {
              const place = item.Place;
              console.log(`     - ${place?.nameCN || place?.nameEN || '(无名称)'} (ID: ${place?.id}, UUID: ${place?.uuid})`);
            });
          }
        }
      }
    }

    // 5. 检查 metadata
    console.log(`\n📋 Trip Metadata:`);
    console.log(JSON.stringify(tripMetadata, null, 2));

  } catch (error: any) {
    console.error(`\n❌ 错误:`, error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

// 从命令行参数获取 tripId
const tripId = process.argv[2];

if (!tripId) {
  console.error('请提供 Trip ID');
  console.error('用法: npx tsx scripts/check-trip-vs-template.ts <tripId>');
  process.exit(1);
}

checkTripVsTemplate(tripId);
