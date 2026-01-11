// 直接测试城市API，检查不同国家返回的数据
import fetch from 'node-fetch';

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

async function testCitiesAPI() {
  console.log('=== 测试城市API（不同国家）===\n');
  console.log(`API 地址: ${BASE_URL}/api/cities\n`);

  const testCases = [
    { code: 'CN', name: '中国' },
    { code: 'JP', name: '日本' },
    { code: 'IS', name: '冰岛' },
    { code: 'US', name: '美国' },
    { code: 'AE', name: '阿联酋' },
    { code: 'AD', name: '安道尔' },
  ];

  const results: Array<{
    countryCode: string;
    countryName: string;
    cityCount: number;
    cities: Array<{ id: number; name: string; countryCode: string }>;
    allSameCountry: boolean;
    error?: string;
  }> = [];

  for (const testCase of testCases) {
    console.log(`--- 测试: ${testCase.name} (${testCase.code}) ---`);
    
    try {
      const url = `${BASE_URL}/api/cities?countryCode=${testCase.code}&limit=10`;
      console.log(`请求 URL: ${url}`);
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (!data.success) {
        console.log(`❌ API 返回失败: ${data.message || '未知错误'}`);
        results.push({
          countryCode: testCase.code,
          countryName: testCase.name,
          cityCount: 0,
          cities: [],
          allSameCountry: false,
          error: data.message || '未知错误',
        });
        console.log('');
        continue;
      }

      const cities = data.data?.cities || [];
      console.log(`✅ 成功: 返回 ${cities.length} 个城市`);
      
      // 显示前5个城市
      if (cities.length > 0) {
        console.log('前5个城市:');
        cities.slice(0, 5).forEach((city: any) => {
          const name = city.nameCN || city.nameEN || city.name;
          console.log(`  - ${name} [${city.countryCode}] (ID: ${city.id})`);
        });
      }

      // 检查所有城市的国家代码
      const wrongCountry = cities.filter((c: any) => c.countryCode !== testCase.code);
      const allSameCountry = wrongCountry.length === 0;
      
      if (!allSameCountry) {
        console.log(`❌ 错误！返回了 ${wrongCountry.length} 个其他国家的城市:`);
        wrongCountry.forEach((c: any) => {
          const name = c.nameCN || c.nameEN || c.name;
          console.log(`    ${name} [${c.countryCode}] (应该是 ${testCase.code})`);
        });
      } else {
        console.log(`✅ 所有城市的国家代码都正确`);
      }

      results.push({
        countryCode: testCase.code,
        countryName: testCase.name,
        cityCount: cities.length,
        cities: cities.slice(0, 5).map((c: any) => ({
          id: c.id,
          name: c.nameCN || c.nameEN || c.name,
          countryCode: c.countryCode,
        })),
        allSameCountry,
      });

    } catch (error: any) {
      console.log(`❌ 请求失败: ${error.message}`);
      results.push({
        countryCode: testCase.code,
        countryName: testCase.name,
        cityCount: 0,
        cities: [],
        allSameCountry: false,
        error: error.message,
      });
    }
    
    console.log('');
  }

  // 总结
  console.log('=== 测试总结 ===\n');
  
  const successCount = results.filter(r => r.allSameCountry && r.cityCount > 0).length;
  const failCount = results.filter(r => !r.allSameCountry || r.cityCount === 0).length;
  
  console.log(`成功: ${successCount}/${results.length}`);
  console.log(`失败: ${failCount}/${results.length}\n`);

  // 检查是否有重复的城市
  console.log('检查是否有重复的城市ID:');
  const allCityIds = new Set<number>();
  const duplicateIds: number[] = [];
  
  results.forEach(r => {
    r.cities.forEach(c => {
      if (allCityIds.has(c.id)) {
        duplicateIds.push(c.id);
      } else {
        allCityIds.add(c.id);
      }
    });
  });

  if (duplicateIds.length > 0) {
    console.log(`❌ 发现 ${duplicateIds.length} 个重复的城市ID: ${duplicateIds.join(', ')}`);
    console.log('   这说明不同国家返回了相同的城市！');
  } else {
    console.log('✅ 没有发现重复的城市ID');
  }

  // 检查是否有相同的城市列表
  console.log('\n检查是否有相同的城市列表:');
  const cityLists = results.map(r => r.cities.map(c => c.id).sort().join(','));
  const uniqueLists = new Set(cityLists);
  
  if (uniqueLists.size < results.length) {
    console.log(`❌ 发现 ${results.length - uniqueLists.size} 个国家返回了相同的城市列表！`);
    console.log('   这说明API可能没有正确过滤国家代码。');
    
    // 找出哪些国家返回了相同的列表
    const listMap = new Map<string, string[]>();
    cityLists.forEach((list, index) => {
      if (!listMap.has(list)) {
        listMap.set(list, []);
      }
      listMap.get(list)!.push(results[index].countryCode);
    });
    
    listMap.forEach((countries, list) => {
      if (countries.length > 1) {
        console.log(`   国家 ${countries.join(', ')} 返回了相同的城市列表`);
      }
    });
  } else {
    console.log('✅ 每个国家返回的城市列表都不同');
  }

  // 详细结果
  console.log('\n=== 详细结果 ===\n');
  results.forEach(r => {
    console.log(`${r.countryName} (${r.countryCode}):`);
    console.log(`  城市数量: ${r.cityCount}`);
    console.log(`  国家代码正确: ${r.allSameCountry ? '✅' : '❌'}`);
    if (r.error) {
      console.log(`  错误: ${r.error}`);
    }
    if (r.cities.length > 0) {
      console.log(`  示例城市: ${r.cities.map(c => c.name).join(', ')}`);
    }
    console.log('');
  });
}

testCitiesAPI().catch(console.error);
