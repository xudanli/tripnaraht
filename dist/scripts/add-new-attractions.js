"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
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
    attractionsData.metadata.total_attractions = attractionsData.attractions.length;
    attractionsData.metadata.last_updated = new Date().toISOString().split('T')[0];
    console.log('\n🔍 更新筛选索引...');
    const mustSeeIds = attractionsData.attractions
        .filter((a) => { var _a; return (_a = a.decision_relevance) === null || _a === void 0 ? void 0 : _a.must_see; })
        .map((a) => a.attraction_id);
    attractionsData.search_filters.by_must_see = mustSeeIds;
    const photoWorthyIds = attractionsData.attractions
        .filter((a) => { var _a; return (_a = a.decision_relevance) === null || _a === void 0 ? void 0 : _a.photo_worthy; })
        .map((a) => a.attraction_id);
    attractionsData.search_filters.by_photo_worthy = photoWorthyIds;
    const lowDanger = attractionsData.attractions
        .filter((a) => {
        var _a;
        const safety = (_a = a.visit_info) === null || _a === void 0 ? void 0 : _a.safety_level;
        return !safety || safety === 'low' || safety === 'safe';
    })
        .map((a) => a.attraction_id);
    const mediumDanger = attractionsData.attractions
        .filter((a) => { var _a, _b; return ((_a = a.visit_info) === null || _a === void 0 ? void 0 : _a.safety_level) === 'medium' || ((_b = a.visit_info) === null || _b === void 0 ? void 0 : _b.safety_level) === 'moderate'; })
        .map((a) => a.attraction_id);
    const highDanger = attractionsData.attractions
        .filter((a) => { var _a, _b; return ((_a = a.visit_info) === null || _a === void 0 ? void 0 : _a.safety_level) === 'high' || ((_b = a.visit_info) === null || _b === void 0 ? void 0 : _b.safety_level) === 'dangerous'; })
        .map((a) => a.attraction_id);
    attractionsData.search_filters.by_danger_level = {
        low: lowDanger,
        medium: mediumDanger,
        high: highDanger
    };
    console.log(`   Must-See景点: ${mustSeeIds.length} 个`);
    console.log(`   Photo-Worthy景点: ${photoWorthyIds.length} 个`);
    const backupPath = attractionsPath + '.backup.' + Date.now();
    fs.copyFileSync(attractionsPath, backupPath);
    console.log(`\n💾 已备份原文件: ${path.basename(backupPath)}`);
    fs.writeFileSync(attractionsPath, JSON.stringify(attractionsData, null, 2), 'utf-8');
    console.log(`\n✅ 已更新 attractions.json`);
    console.log('\n📊 最终统计:');
    console.log('='.repeat(80));
    console.log(`   总景点数: ${attractionsData.attractions.length}`);
    console.log(`   Must-See: ${mustSeeIds.length} 个`);
    console.log(`   Photo-Worthy: ${photoWorthyIds.length} 个`);
    console.log(`   最后更新: ${attractionsData.metadata.last_updated}`);
    const regionStats = {};
    attractionsData.attractions.forEach((a) => {
        const region = a.region || 'Unknown';
        regionStats[region] = (regionStats[region] || 0) + 1;
    });
    console.log('\n   区域分布:');
    Object.entries(regionStats).sort((a, b) => b[1] - a[1]).forEach(([region, count]) => {
        console.log(`     ${region}: ${count} 个`);
    });
    const categoryStats = {};
    attractionsData.attractions.forEach((a) => {
        const category = a.category || 'Unknown';
        categoryStats[category] = (categoryStats[category] || 0) + 1;
    });
    console.log('\n   分类分布:');
    Object.entries(categoryStats).sort((a, b) => b[1] - a[1]).forEach(([category, count]) => {
        console.log(`     ${category}: ${count} 个`);
    });
}
addNewAttractions();
//# sourceMappingURL=add-new-attractions.js.map