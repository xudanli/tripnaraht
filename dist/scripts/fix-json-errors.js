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
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const filesToFix = [
    'docs/iceland/pois/accommodations.json',
    'docs/iceland/pois/attractions.json',
    'docs/iceland/decision-support/rhythm-patterns.json',
    'docs/iceland/risks/terrain-risks.json',
    'docs/iceland/practical/packing-checklist-template.json',
    'docs/alps/pois/attractions.json',
    'docs/alps/risks/terrain-risks.json',
    'docs/alps/decision-support/rhythm-patterns.json',
    'docs/alps/practical/packing-checklist-template.json',
    'docs/svalbard/pois/attractions.json',
    'docs/svalbard/risks/terrain-risks.json',
    'docs/svalbard/decision-support/rhythm-patterns.json',
    'docs/svalbard/practical/packing-checklist-template.json',
    'docs/faroe-islands/decision-support/rhythm-patterns.json',
    'docs/faroe-islands/practical/packing-checklist-template.json',
    'docs/argentina/culture/museums-attractions.json',
    'docs/argentina/logistics/transportation.json',
    'docs/mountaineering/8000m-user-personas-index.json',
    'docs/mountaineering/broad-peak-user-personas.json',
    'docs/mountaineering/shishapangma-user-personas.json',
];
function fixJsonErrors(filePath) {
    var _a;
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        const originalContent = content;
        if (content.charCodeAt(0) === 0xFEFF) {
            content = content.slice(1);
        }
        content = content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        content = content.replace(/,(\s*[}\]])/g, '$1');
        content = content.replace(/,(\s*})/g, '$1');
        content = content.replace(/([^\\])"([^",:}\]]*)"([^,:\s}])/g, (match, p1, p2, p3) => {
            if (p2 && !p2.includes('"')) {
                return match;
            }
            return match;
        });
        try {
            JSON.parse(content);
        }
        catch (parseError) {
            const errorPos = parseInt(((_a = parseError.message.match(/position (\d+)/)) === null || _a === void 0 ? void 0 : _a[1]) || '0');
            if (errorPos > 0) {
                const start = Math.max(0, errorPos - 50);
                const end = Math.min(content.length, errorPos + 50);
                const context = content.substring(start, end);
                const beforeError = content.substring(0, errorPos);
                const afterError = content.substring(errorPos);
                if (afterError.match(/^\s*["\w]/) && beforeError.match(/["\w]\s*$/)) {
                    content = beforeError + ',' + afterError;
                }
            }
            try {
                JSON.parse(content);
            }
            catch (finalError) {
                const errorMessage = finalError instanceof Error ? finalError.message : String(finalError);
                return { fixed: false, error: errorMessage };
            }
        }
        if (content !== originalContent) {
            fs.writeFileSync(filePath, content, 'utf8');
            return { fixed: true };
        }
        try {
            JSON.parse(content);
            return { fixed: true };
        }
        catch {
            return { fixed: false, error: '无法修复' };
        }
    }
    catch (error) {
        return { fixed: false, error: error.message };
    }
}
async function main() {
    console.log('🔧 开始修复JSON格式错误...\n');
    let fixedCount = 0;
    let failedCount = 0;
    const failedFiles = [];
    for (const filePath of filesToFix) {
        const fullPath = path.join(process.cwd(), filePath);
        if (!fs.existsSync(fullPath)) {
            console.log(`⚠️  文件不存在: ${filePath}`);
            continue;
        }
        console.log(`📝 处理: ${filePath}`);
        try {
            const originalContent = fs.readFileSync(fullPath, 'utf8');
            JSON.parse(originalContent);
            console.log(`  ✅ 已经是有效的JSON，跳过`);
            continue;
        }
        catch {
        }
        const result = fixJsonErrors(fullPath);
        if (result.fixed) {
            try {
                const fixedContent = fs.readFileSync(fullPath, 'utf8');
                JSON.parse(fixedContent);
                console.log(`  ✅ 修复成功`);
                fixedCount++;
            }
            catch (error) {
                console.log(`  ❌ 修复后仍然无效: ${error.message}`);
                failedCount++;
                failedFiles.push({ file: filePath, error: error.message });
            }
        }
        else {
            console.log(`  ❌ 修复失败: ${result.error || '未知错误'}`);
            failedCount++;
            failedFiles.push({ file: filePath, error: result.error || '未知错误' });
        }
    }
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ 修复完成！`);
    console.log(`   成功: ${fixedCount} 个文件`);
    console.log(`   失败: ${failedCount} 个文件`);
    console.log('='.repeat(60));
    if (failedFiles.length > 0) {
        console.log(`\n⚠️  无法修复的文件:`);
        failedFiles.forEach(({ file, error }) => {
            console.log(`  - ${file}: ${error}`);
        });
    }
}
main().catch(console.error);
//# sourceMappingURL=fix-json-errors.js.map