#!/usr/bin/env tsx
/**
 * 修复JSON文件中数组括号错误
 * 将错误的 } 替换为 ]
 */

import * as fs from 'fs';
import * as path from 'path';

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

function fixArrayBrackets(filePath: string): { fixed: boolean; error?: string } {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    
    // 使用正则表达式查找并修复数组关闭错误
    // 模式：查找 "key": [ ... } 应该改为 "key": [ ... ]
    // 需要匹配数组开始后的内容，直到找到错误的 }
    
    // 更精确的方法：逐行检查
    const lines = content.split('\n');
    let fixed = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // 检查是否是数组定义行
      if (line.match(/"\w+":\s*\[/)) {
        // 找到数组开始，查找对应的关闭
        let bracketCount = 0;
        let foundArrayStart = false;
        
        for (let j = i; j < lines.length; j++) {
          const currentLine = lines[j];
          
          // 计算括号
          for (const char of currentLine) {
            if (char === '[') {
              bracketCount++;
              foundArrayStart = true;
            } else if (char === ']') {
              bracketCount--;
            } else if (char === '{') {
              // 对象开始，不影响数组括号计数
            } else if (char === '}') {
              // 如果数组括号未关闭，但遇到了 }，可能是错误
              if (foundArrayStart && bracketCount > 0 && currentLine.trim() === '},') {
                // 这可能是数组关闭错误
                // 检查前一行是否是数组元素
                if (j > 0) {
                  const prevLine = lines[j - 1];
                  if (prevLine.match(/^\s*\{.*\}\s*,?\s*$/) || prevLine.match(/^\s*".*"\s*,?\s*$/)) {
                    // 前一行是数组元素，当前行应该是 ]
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
    
    // 更简单的方法：直接替换常见的错误模式
    // 模式1: 数组元素后跟 },
    content = content.replace(/(\{[^}]*"type"[^}]*\}\s*)\},/g, '$1],');
    
    // 模式2: 数组元素后跟单独的 }
    content = content.replace(/(\{[^}]*"type"[^}]*\}\s*)\}\s*,/g, '$1]\s*,');
    
    // 模式3: 更通用的模式 - 在数组定义后，如果遇到 }, 且前面是数组元素格式
    const arrayPattern = /("\w+":\s*\[)([\s\S]*?)(\s*\},)/g;
    content = content.replace(arrayPattern, (match, arrayStart, arrayContent, closing) => {
      // 检查arrayContent是否包含数组元素但没有 ]
      if (arrayContent.includes('{') && !arrayContent.includes(']') && closing.includes('}')) {
        return arrayStart + arrayContent + closing.replace('}', ']');
      }
      return match;
    });
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      fixed = true;
    }
    
    // 验证修复后的JSON
    try {
      JSON.parse(content);
      return { fixed: true };
    } catch (error: any) {
      return { fixed: false, error: error.message };
    }
    
  } catch (error: any) {
    return { fixed: false, error: error.message };
  }
}

// 使用更直接的方法：查找所有 "key": [ ... }, 模式并修复
function fixDirectly(filePath: string): { fixed: boolean; error?: string } {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    
    // 使用更精确的正则表达式
    // 匹配: "room_types": [ ... }, 应该改为 "room_types": [ ... ],
    const patterns = [
      // 模式: "key": [\n ... { ... }\n      },
      /("[\w_]+":\s*\[\s*\n(?:\s*\{[^}]*\}[,\s]*\n)+\s*)\},/g,
      // 模式: "key": [ ... { ... } },
      /("[\w_]+":\s*\[[^\]]*\{[^}]*\}\s*)\},/g,
    ];
    
    for (const pattern of patterns) {
      content = content.replace(pattern, (match, arrayContent) => {
        return arrayContent + '],';
      });
    }
    
    // 手动修复已知的错误位置
    // 基于错误信息，我们知道某些位置需要修复
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
    }
    
    // 验证
    try {
      JSON.parse(content);
      return { fixed: true };
    } catch (error: any) {
      return { fixed: false, error: error.message };
    }
    
  } catch (error: any) {
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
    
    // 先检查是否是有效JSON
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      JSON.parse(content);
      console.log(`  ✅ 已经是有效的JSON`);
      continue;
    } catch {
      // 需要修复
    }
    
    // 使用Python来精确修复
    const result = await new Promise<{ fixed: boolean; error?: string }>((resolve) => {
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
      python.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      python.on('close', (code: number) => {
        if (output.trim() === 'VALID') {
          resolve({ fixed: true });
        } else if (output.trim() === 'FIXED') {
          resolve({ fixed: true });
        } else {
          resolve({ fixed: false, error: '无法自动修复' });
        }
      });
    });
    
    if (result.fixed) {
      // 验证修复结果
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        JSON.parse(content);
        console.log(`  ✅ 修复成功`);
      } catch (error: any) {
        console.log(`  ❌ 修复后仍然无效: ${error.message}`);
      }
    } else {
      console.log(`  ❌ 修复失败: ${result.error}`);
    }
  }
}

main().catch(console.error);
