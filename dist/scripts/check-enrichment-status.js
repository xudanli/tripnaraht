#!/usr/bin/env tsx
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function parseArgs() {
    const args = process.argv.slice(2);
    let file = 'data/iceland_poi_enriched.json.geojson';
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--file=')) {
            file = arg.split('=')[1];
        }
        else if (arg === '--file' && args[i + 1]) {
            file = args[i + 1];
            i++;
        }
    }
    return { file };
}
function checkEnrichmentStatus(geojson) {
    var _a, _b, _c;
    const stats = {
        total: geojson.features.length,
        withNameIS: 0,
        withNameCN: 0,
        withNameEN: 0,
        withDescription: 0,
        withCategory: 0,
        withTags: 0,
        withAddress: 0,
        withEnrichedMetadata: 0,
        complete: 0,
        incomplete: 0,
        placeholderNames: 0,
    };
    for (const feature of geojson.features) {
        const props = feature.properties;
        if (props.nafnFitju && props.nafnFitju.trim() !== '') {
            stats.withNameIS++;
            if (props.nafnFitju.startsWith('未命名地点')) {
                stats.placeholderNames++;
            }
        }
        if (props.nameCN && props.nameCN.trim() !== '') {
            stats.withNameCN++;
            if (props.nameCN.startsWith('未命名地点')) {
                stats.placeholderNames++;
            }
        }
        if (props.nameEN && props.nameEN.trim() !== '') {
            stats.withNameEN++;
            if (props.nameEN.startsWith('未命名地点')) {
                stats.placeholderNames++;
            }
        }
        if (props.description && props.description.trim() !== '') {
            stats.withDescription++;
        }
        if (props.category && props.category.trim() !== '') {
            stats.withCategory++;
        }
        if (props.tags && Array.isArray(props.tags) && props.tags.length > 0) {
            stats.withTags++;
        }
        if (props.address && props.address.trim() !== '') {
            stats.withAddress++;
        }
        if (props.enrichedMetadata && Object.keys(props.enrichedMetadata).length > 0) {
            stats.withEnrichedMetadata++;
        }
        const hasName = !!(props.nafnFitju || props.nameCN || props.nameEN);
        const hasValidName = hasName &&
            !(((_a = props.nafnFitju) === null || _a === void 0 ? void 0 : _a.startsWith('未命名地点')) ||
                ((_b = props.nameCN) === null || _b === void 0 ? void 0 : _b.startsWith('未命名地点')) ||
                ((_c = props.nameEN) === null || _c === void 0 ? void 0 : _c.startsWith('未命名地点')));
        const hasDescription = !!(props.description && props.description.trim() !== '');
        const hasCategory = !!(props.category && props.category.trim() !== '');
        if (hasValidName && hasDescription && hasCategory) {
            stats.complete++;
        }
        else {
            stats.incomplete++;
        }
    }
    return stats;
}
function formatPercentage(count, total) {
    if (total === 0)
        return '0.00%';
    return `${((count / total) * 100).toFixed(2)}%`;
}
async function main() {
    var _a, _b, _c, _d, _e, _f, _g;
    const options = parseArgs();
    const filePath = path.resolve(process.cwd(), options.file);
    console.log('='.repeat(60));
    console.log('数据填充情况检查');
    console.log('='.repeat(60));
    console.log(`文件: ${options.file}\n`);
    if (!fs.existsSync(filePath)) {
        console.error(`❌ 文件不存在: ${filePath}`);
        console.log('\n提示：如果还没有运行填充脚本，请先运行：');
        console.log('  npm run script:enrich-iceland-poi');
        process.exit(1);
    }
    try {
        console.log('📖 读取文件...');
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const geojson = JSON.parse(fileContent);
        if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
            console.error('❌ 无效的 GeoJSON 格式');
            process.exit(1);
        }
        console.log(`✓ 读取成功，共 ${geojson.features.length} 个 features\n`);
        console.log('📊 分析填充情况...');
        const stats = checkEnrichmentStatus(geojson);
        console.log('\n' + '='.repeat(60));
        console.log('填充统计结果');
        console.log('='.repeat(60));
        console.log(`总计: ${stats.total}`);
        console.log('');
        console.log('名称字段:');
        console.log(`  - 冰岛语名称 (nafnFitju): ${stats.withNameIS} (${formatPercentage(stats.withNameIS, stats.total)})`);
        console.log(`  - 中文名称 (nameCN): ${stats.withNameCN} (${formatPercentage(stats.withNameCN, stats.total)})`);
        console.log(`  - 英文名称 (nameEN): ${stats.withNameEN} (${formatPercentage(stats.withNameEN, stats.total)})`);
        console.log(`  - 占位符名称: ${stats.placeholderNames} (${formatPercentage(stats.placeholderNames, stats.total)})`);
        console.log('');
        console.log('其他字段:');
        console.log(`  - 描述 (description): ${stats.withDescription} (${formatPercentage(stats.withDescription, stats.total)})`);
        console.log(`  - 类别 (category): ${stats.withCategory} (${formatPercentage(stats.withCategory, stats.total)})`);
        console.log(`  - 标签 (tags): ${stats.withTags} (${formatPercentage(stats.withTags, stats.total)})`);
        console.log(`  - 地址 (address): ${stats.withAddress} (${formatPercentage(stats.withAddress, stats.total)})`);
        console.log(`  - 填充元数据 (enrichedMetadata): ${stats.withEnrichedMetadata} (${formatPercentage(stats.withEnrichedMetadata, stats.total)})`);
        console.log('');
        console.log('完整性评估:');
        console.log(`  ✅ 完整数据（名称+描述+类别）: ${stats.complete} (${formatPercentage(stats.complete, stats.total)})`);
        console.log(`  ⚠️  不完整数据: ${stats.incomplete} (${formatPercentage(stats.incomplete, stats.total)})`);
        console.log('');
        if (stats.complete > 0) {
            console.log('📋 完整数据示例（前3条）:');
            let count = 0;
            for (const feature of geojson.features) {
                const props = feature.properties;
                const hasName = !!(props.nafnFitju || props.nameCN || props.nameEN);
                const hasValidName = hasName &&
                    !(((_a = props.nafnFitju) === null || _a === void 0 ? void 0 : _a.startsWith('未命名地点')) ||
                        ((_b = props.nameCN) === null || _b === void 0 ? void 0 : _b.startsWith('未命名地点')) ||
                        ((_c = props.nameEN) === null || _c === void 0 ? void 0 : _c.startsWith('未命名地点')));
                const hasDescription = !!(props.description && props.description.trim() !== '');
                const hasCategory = !!(props.category && props.category.trim() !== '');
                if (hasValidName && hasDescription && hasCategory && count < 3) {
                    console.log(`  ${count + 1}. ${props.nameCN || props.nameEN || props.nafnFitju}`);
                    console.log(`     描述: ${(_d = props.description) === null || _d === void 0 ? void 0 : _d.substring(0, 50)}...`);
                    console.log(`     类别: ${props.category}`);
                    count++;
                }
            }
            console.log('');
        }
        if (stats.incomplete > 0) {
            console.log('📋 不完整数据示例（前3条）:');
            let count = 0;
            for (const feature of geojson.features) {
                const props = feature.properties;
                const hasName = !!(props.nafnFitju || props.nameCN || props.nameEN);
                const hasValidName = hasName &&
                    !(((_e = props.nafnFitju) === null || _e === void 0 ? void 0 : _e.startsWith('未命名地点')) ||
                        ((_f = props.nameCN) === null || _f === void 0 ? void 0 : _f.startsWith('未命名地点')) ||
                        ((_g = props.nameEN) === null || _g === void 0 ? void 0 : _g.startsWith('未命名地点')));
                const hasDescription = !!(props.description && props.description.trim() !== '');
                const hasCategory = !!(props.category && props.category.trim() !== '');
                if (!(hasValidName && hasDescription && hasCategory) && count < 3) {
                    console.log(`  ${count + 1}. fid=${props.fid}`);
                    console.log(`     名称: ${props.nameCN || props.nameEN || props.nafnFitju || '无'}`);
                    console.log(`     描述: ${hasDescription ? '有' : '无'}`);
                    console.log(`     类别: ${hasCategory ? props.category : '无'}`);
                    count++;
                }
            }
            console.log('');
        }
        console.log('✅ 检查完成！');
    }
    catch (error) {
        console.error('\n❌ 检查失败:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=check-enrichment-status.js.map