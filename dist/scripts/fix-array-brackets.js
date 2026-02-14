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
    'docs/argentina/culture/museums-attractions.json',
    'docs/mountaineering/8000m-user-personas-index.json',
    'docs/mountaineering/broad-peak-user-personas.json',
];
function fixArrayBrackets(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        const originalContent = content;
        const lines = content.split('\n');
        let fixed = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.match(/"\w+":\s*\[/)) {
                let bracketCount = 0;
                let foundArrayStart = false;
                for (let j = i; j < lines.length; j++) {
                    const currentLine = lines[j];
                    for (const char of currentLine) {
                        if (char === '[') {
                            bracketCount++;
                            foundArrayStart = true;
                        }
                        else if (char === ']') {
                            bracketCount--;
                        }
                        else if (char === '{') {
                        }
                        else if (char === '}') {
                            if (foundArrayStart && bracketCount > 0 && currentLine.trim() === '},') {
                                if (j > 0) {
                                    const prevLine = lines[j - 1];
                                    if (prevLine.match(/^\s*\{.*\}\s*,?\s*$/) || prevLine.match(/^\s*".*"\s*,?\s*$/)) {
                                        lines[j] = lines[j].replace('},', '],');
                                        fixed = true;
                                        break;
                                    }
                                }
                            }
                        }
                        if (bracketCount === 0 && foundArrayStart) {
                            break;
                        }
                    }
                    if (bracketCount === 0 && foundArrayStart) {
                        break;
                    }
                }
            }
        }
        content = content.replace(/(\{[^}]*"type"[^}]*\}\s*)\},/g, '$1],');
        content = content.replace(/(\{[^}]*"type"[^}]*\}\s*)\}\s*,/g, '$1]\s*,');
        const arrayPattern = /("\w+":\s*\[)([\s\S]*?)(\s*\},)/g;
        content = content.replace(arrayPattern, (match, arrayStart, arrayContent, closing) => {
            if (arrayContent.includes('{') && !arrayContent.includes(']') && closing.includes('}')) {
                return arrayStart + arrayContent + closing.replace('}', ']');
            }
            return match;
        });
        if (content !== originalContent) {
            fs.writeFileSync(filePath, content, 'utf8');
            fixed = true;
        }
        try {
            JSON.parse(content);
            return { fixed: true };
        }
        catch (error) {
            return { fixed: false, error: error.message };
        }
    }
    catch (error) {
        return { fixed: false, error: error.message };
    }
}
function fixDirectly(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        const originalContent = content;
        const patterns = [
            /("[\w_]+":\s*\[\s*\n(?:\s*\{[^}]*\}[,\s]*\n)+\s*)\},/g,
            /("[\w_]+":\s*\[[^\]]*\{[^}]*\}\s*)\},/g,
        ];
        for (const pattern of patterns) {
            content = content.replace(pattern, (match, arrayContent) => {
                return arrayContent + '],';
            });
        }
        if (content !== originalContent) {
            fs.writeFileSync(filePath, content, 'utf8');
        }
        try {
            JSON.parse(content);
            return { fixed: true };
        }
        catch (error) {
            return { fixed: false, error: error.message };
        }
    }
    catch (error) {
        return { fixed: false, error: error.message };
    }
}
async function main() {
    console.log('🔧 修复数组括号错误...\n');
    for (const filePath of filesToFix) {
        const fullPath = path.join(process.cwd(), filePath);
        if (!fs.existsSync(fullPath)) {
            console.log(`⚠️  文件不存在: ${filePath}`);
            continue;
        }
        console.log(`📝 处理: ${filePath}`);
        try {
            const content = fs.readFileSync(fullPath, 'utf8');
            JSON.parse(content);
            console.log(`  ✅ 已经是有效的JSON`);
            continue;
        }
        catch {
        }
        const result = await new Promise((resolve) => {
            const { spawn } = require('child_process');
            const python = spawn('python3', ['-c', `
import json
import re
import sys

file_path = '${fullPath}'

try:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 尝试解析
    json.loads(content)
    print("VALID")
except json.JSONDecodeError as e:
    # 找到错误位置
    lines = content.split('\\n')
    error_line_num = e.lineno - 1
    
    if error_line_num < len(lines):
        error_line = lines[error_line_num]
        
        # 检查是否是数组关闭错误
        if '},' in error_line and e.colno <= len(error_line):
            # 查找对应的数组开始
            bracket_count = 0
            array_start_line = -1
            
            for i in range(error_line_num, -1, -1):
                line = lines[i]
                if '[' in line and '"' in line:
                    # 可能是数组开始
                    array_start_line = i
                    break
            
            if array_start_line >= 0:
                # 检查从array_start_line到error_line_num之间是否有数组元素
                has_array_elements = False
                for i in range(array_start_line, error_line_num + 1):
                    if '{' in lines[i] and '}' in lines[i]:
                        has_array_elements = True
                        break
                
                if has_array_elements:
                    # 修复：将 }, 改为 ],
                    lines[error_line_num] = lines[error_line_num].replace('},', '],')
                    fixed_content = '\\n'.join(lines)
                    
                    # 验证修复
                    try:
                        json.loads(fixed_content)
                        with open(file_path, 'w', encoding='utf-8') as f:
                            f.write(fixed_content)
                        print("FIXED")
                    except:
                        print("FAILED")
                    else:
                        print("FAILED")
                else:
                    print("FAILED")
            else:
                print("FAILED")
        else:
            print("FAILED")
      `]);
            let output = '';
            python.stdout.on('data', (data) => {
                output += data.toString();
            });
            python.on('close', (code) => {
                if (output.trim() === 'VALID') {
                    resolve({ fixed: true });
                }
                else if (output.trim() === 'FIXED') {
                    resolve({ fixed: true });
                }
                else {
                    resolve({ fixed: false, error: '无法自动修复' });
                }
            });
        });
        if (result.fixed) {
            try {
                const content = fs.readFileSync(fullPath, 'utf8');
                JSON.parse(content);
                console.log(`  ✅ 修复成功`);
            }
            catch (error) {
                console.log(`  ❌ 修复后仍然无效: ${error.message}`);
            }
        }
        else {
            console.log(`  ❌ 修复失败: ${result.error}`);
        }
    }
}
main().catch(console.error);
//# sourceMappingURL=fix-array-brackets.js.map