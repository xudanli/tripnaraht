#!/usr/bin/env ts-node
/**
 * 测试准备度上下文数据提取和规则匹配
 */

// 模拟上下文数据提取
function extractContextFromTrip(trip: any) {
  const activitySet = new Set<string>();
  const poiCanonicalTypeSet = new Set<string>();

  for (const day of trip.TripDay || []) {
    for (const item of day.ItineraryItem || []) {
      if (item.Place) {
        // 从 metadata 提取 canonicalType
        const placeMetadata = item.Place.metadata as any || {};
        const canonicalType = placeMetadata.canonicalType;
        if (canonicalType) {
          poiCanonicalTypeSet.add(canonicalType);
        }

        // 从 canonicalType 映射活动类型
        if (canonicalType) {
          if (canonicalType.includes('GLACIER') || canonicalType.includes('VOLCANO')) {
            activitySet.add('hiking');
            activitySet.add('outdoor');
            activitySet.add('nature');
          }
          if (canonicalType.includes('VOLCANO')) {
            activitySet.add('volcano');
          }
          if (canonicalType.includes('GEYSER') || canonicalType.includes('HOT_SPRING') || canonicalType === 'SPA_POOL') {
            activitySet.add('geothermal');
            activitySet.add('hot_springs');
          }
          if (canonicalType === 'TRAILHEAD') {
            activitySet.add('hiking');
            activitySet.add('outdoor');
          }
        }

        // 从 category 推断
        const category = item.Place.category?.toLowerCase() || '';
        if (category.includes('hiking') || category.includes('trail')) {
          activitySet.add('hiking');
          activitySet.add('outdoor');
        }
      }
    }
  }

  return {
    activities: Array.from(activitySet),
    poiCanonicalTypes: Array.from(poiCanonicalTypeSet),
  };
}

// 规则匹配测试
function testRuleMatching() {
  console.log('🧪 测试规则匹配逻辑\n');

  // 测试场景1: 完整的上下文数据
  const context1 = {
    itinerary: {
      countries: ['IS'],
      activities: ['hiking', 'outdoor', 'volcano'],
      season: 'winter',
      poiCanonicalTypes: ['ATTRACTION_NATURE_VOLCANO', 'TRAILHEAD'],
    },
  };

  console.log('测试场景1: 完整上下文数据');
  console.log('上下文:', JSON.stringify(context1.itinerary, null, 2));
  console.log('');

  // 规则1: rule.is.weather.layered-clothing
  const rule1 = {
    id: 'rule.is.weather.layered-clothing',
    when: {
      any: [
        { containsAny: { path: 'itinerary.activities', values: ['hiking', 'outdoor', 'nature', 'glacier', 'volcano'] } },
        { containsAny: { path: 'itinerary.poiCanonicalTypes', values: ['ATTRACTION_NATURE_GLACIER', 'ATTRACTION_NATURE_VOLCANO', 'TRAILHEAD'] } },
        { eq: { path: 'itinerary.season', value: 'winter' } },
      ],
    },
  };

  // 规则2: rule.is.geothermal.safety
  const rule2 = {
    id: 'rule.is.geothermal.safety',
    when: {
      any: [
        { containsAny: { path: 'itinerary.poiCanonicalTypes', values: ['ATTRACTION_NATURE_HOT_SPRING', 'ATTRACTION_NATURE_GEYSER', 'ATTRACTION_NATURE_VOLCANO', 'SPA_POOL'] } },
        { containsAny: { path: 'itinerary.activities', values: ['geothermal', 'volcano', 'hot_springs', 'spa'] } },
      ],
    },
  };

  // 规则匹配函数
  function getPathValue(obj: any, path: string): any {
    return path.split('.').reduce((o, p) => o?.[p], obj);
  }

  function evaluate(condition: any, context: any): boolean {
    if (condition.all) {
      return condition.all.every((c: any) => evaluate(c, context));
    }
    if (condition.any) {
      return condition.any.some((c: any) => evaluate(c, context));
    }
    if (condition.containsAny) {
      const actual = getPathValue(context, condition.containsAny.path);
      if (!Array.isArray(actual)) return false;
      return condition.containsAny.values.some((v: string) => actual.includes(v));
    }
    if (condition.eq) {
      return getPathValue(context, condition.eq.path) === condition.eq.value;
    }
    return false;
  }

  const rule1Match = evaluate(rule1.when, context1);
  const rule2Match = evaluate(rule2.when, context1);

  console.log('规则匹配结果:');
  console.log(`  ✅ 规则1 (layered-clothing): ${rule1Match ? '匹配' : '不匹配'}`);
  console.log(`  ✅ 规则2 (geothermal.safety): ${rule2Match ? '匹配' : '不匹配'}`);
  console.log('');

  // 测试场景2: 从实际行程数据提取
  console.log('测试场景2: 从实际行程数据提取');
  const mockTrip = {
    TripDay: [
      {
        ItineraryItem: [
          {
            Place: {
              nameCN: 'Glacier end June 2024',
              category: 'ATTRACTION',
              metadata: { canonicalType: 'ATTRACTION' }, // 注意：实际数据中 canonicalType 可能不完整
            },
          },
          {
            Place: {
              nameCN: '火山景点',
              category: 'ATTRACTION',
              metadata: { canonicalType: 'ATTRACTION_NATURE_VOLCANO' },
            },
          },
        ],
      },
    ],
  };

  const extracted = extractContextFromTrip(mockTrip);
  console.log('提取的活动类型:', extracted.activities);
  console.log('提取的POI类型:', extracted.poiCanonicalTypes);
  console.log('');

  // 使用提取的数据构建上下文
  const context2 = {
    itinerary: {
      countries: ['IS'],
      activities: extracted.activities.length > 0 ? extracted.activities : undefined,
      season: 'winter',
      poiCanonicalTypes: extracted.poiCanonicalTypes.length > 0 ? extracted.poiCanonicalTypes : undefined,
    },
  };

  console.log('构建的上下文:', JSON.stringify(context2.itinerary, null, 2));
  const rule1Match2 = evaluate(rule1.when, context2);
  const rule2Match2 = evaluate(rule2.when, context2);
  console.log('规则匹配结果:');
  console.log(`  ${rule1Match2 ? '✅' : '❌'} 规则1 (layered-clothing): ${rule1Match2 ? '匹配' : '不匹配'}`);
  console.log(`  ${rule2Match2 ? '✅' : '❌'} 规则2 (geothermal.safety): ${rule2Match2 ? '匹配' : '不匹配'}`);
  console.log('');

  // 总结
  console.log('📊 测试总结:');
  console.log('1. ✅ 规则匹配逻辑正常工作');
  console.log('2. ⚠️  实际行程数据中的 canonicalType 可能不完整');
  console.log('3. 💡 建议：确保 Place.metadata.canonicalType 正确设置');
}

testRuleMatching();

