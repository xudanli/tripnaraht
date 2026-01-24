import * as fs from 'fs';
import * as path from 'path';

async function addNewAttractions() {
  const attractionsPath = path.join(process.cwd(), 'docs/iceland/pois/attractions.json');
  const newAttractionsPath = path.join(process.cwd(), 'scripts/new-attractions-data.json');

  console.log('📝 读取现有景点数据...');
  const attractionsData = JSON.parse(fs.readFileSync(attractionsPath, 'utf-8'));

  console.log(`   当前景点数: ${attractionsData.attractions.length}`);

  console.log('\n📝 读取新景点数据...');
  const newAttractions = JSON.parse(fs.readFileSync(newAttractionsPath, 'utf-8'));

  console.log(`   新增景点数: ${newAttractions.length}`);

  console.log('\n➕ 添加新景点...');
  attractionsData.attractions.push(...newAttractions);

  console.log(`   更新后景点数: ${attractionsData.attractions.length}`);

  // 更新metadata
  attractionsData.metadata.total_attractions = attractionsData.attractions.length;
  attractionsData.metadata.last_updated = new Date().toISOString().split('T')[0];

  // 更新search_filters
  console.log('\n🔍 更新筛选索引...');

  // 更新must_see列表
  const mustSeeIds = attractionsData.attractions
    .filter((a: any) => a.decision_relevance?.must_see)
    .map((a: any) => a.attraction_id);

  attractionsData.search_filters.by_must_see = mustSeeIds;

  // 更新photo_worthy列表
  const photoWorthyIds = attractionsData.attractions
    .filter((a: any) => a.decision_relevance?.photo_worthy)
    .map((a: any) => a.attraction_id);

  attractionsData.search_filters.by_photo_worthy = photoWorthyIds;

  // 更新danger_level
  const lowDanger = attractionsData.attractions
    .filter((a: any) => {
      const safety = a.visit_info?.safety_level;
      return !safety || safety === 'low' || safety === 'safe';
    })
    .map((a: any) => a.attraction_id);

  const mediumDanger = attractionsData.attractions
    .filter((a: any) => a.visit_info?.safety_level === 'medium' || a.visit_info?.safety_level === 'moderate')
    .map((a: any) => a.attraction_id);

  const highDanger = attractionsData.attractions
    .filter((a: any) => a.visit_info?.safety_level === 'high' || a.visit_info?.safety_level === 'dangerous')
    .map((a: any) => a.attraction_id);

  attractionsData.search_filters.by_danger_level = {
    low: lowDanger,
    medium: mediumDanger,
    high: highDanger
  };

  console.log(`   Must-See景点: ${mustSeeIds.length} 个`);
  console.log(`   Photo-Worthy景点: ${photoWorthyIds.length} 个`);

  // 备份原文件
  const backupPath = attractionsPath + '.backup.' + Date.now();
  fs.copyFileSync(attractionsPath, backupPath);
  console.log(`\n💾 已备份原文件: ${path.basename(backupPath)}`);

  // 写入更新后的数据
  fs.writeFileSync(attractionsPath, JSON.stringify(attractionsData, null, 2), 'utf-8');
  console.log(`\n✅ 已更新 attractions.json`);

  console.log('\n📊 最终统计:');
  console.log('='.repeat(80));
  console.log(`   总景点数: ${attractionsData.attractions.length}`);
  console.log(`   Must-See: ${mustSeeIds.length} 个`);
  console.log(`   Photo-Worthy: ${photoWorthyIds.length} 个`);
  console.log(`   最后更新: ${attractionsData.metadata.last_updated}`);

  // 按区域统计
  const regionStats: Record<string, number> = {};
  attractionsData.attractions.forEach((a: any) => {
    const region = a.region || 'Unknown';
    regionStats[region] = (regionStats[region] || 0) + 1;
  });

  console.log('\n   区域分布:');
  Object.entries(regionStats).sort((a, b) => b[1] - a[1]).forEach(([region, count]) => {
    console.log(`     ${region}: ${count} 个`);
  });

  // 按分类统计
  const categoryStats: Record<string, number> = {};
  attractionsData.attractions.forEach((a: any) => {
    const category = a.category || 'Unknown';
    categoryStats[category] = (categoryStats[category] || 0) + 1;
  });

  console.log('\n   分类分布:');
  Object.entries(categoryStats).sort((a, b) => b[1] - a[1]).forEach(([category, count]) => {
    console.log(`     ${category}: ${count} 个`);
  });
}

addNewAttractions();
