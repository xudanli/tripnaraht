#!/usr/bin/env python3
"""
修复JSON格式错误
主要修复数组关闭括号错误：将 }, 改为 ],
"""

import json
import sys
import os

files_to_fix = [
    'docs/iceland/pois/accommodations.json',
    'docs/iceland/pois/attractions.json',
    'docs/iceland/decision-support/rhythm-patterns.json',
    'docs/iceland/risks/terrain-risks.json',
    'docs/iceland/practical/packing-checklist-template.json',
    'docs/argentina/culture/museums-attractions.json',
    'docs/mountaineering/8000m-user-personas-index.json',
    'docs/mountaineering/broad-peak-user-personas.json',
]

def fix_json_file(file_path):
    """修复单个JSON文件"""
    if not os.path.exists(file_path):
        print(f"⚠️  文件不存在: {file_path}")
        return False
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 先尝试解析
        try:
            json.loads(content)
            return True  # 已经是有效的JSON
        except json.JSONDecodeError as e:
            # 需要修复
            lines = content.split('\n')
            error_line_num = e.lineno - 1
            
            if error_line_num < len(lines):
                error_line = lines[error_line_num]
                
                # 检查是否是数组关闭错误
                if '},' in error_line and e.colno <= len(error_line):
                    # 查找对应的数组开始
                    array_start_line = -1
                    for i in range(error_line_num, -1, -1):
                        if i < len(lines) and '[' in lines[i] and ':' in lines[i]:
                            array_start_line = i
                            break
                    
                    if array_start_line >= 0:
                        # 检查从array_start_line到error_line_num之间是否有数组元素
                        has_array_elements = False
                        for i in range(array_start_line, min(error_line_num + 1, len(lines))):
                            if '{' in lines[i] and '}' in lines[i]:
                                has_array_elements = True
                                break
                        
                        if has_array_elements:
                            # 修复：将 }, 改为 ],
                            original_line = lines[error_line_num]
                            lines[error_line_num] = lines[error_line_num].replace('},', '],')
                            fixed_content = '\n'.join(lines)
                            
                            # 验证修复
                            try:
                                json.loads(fixed_content)
                                with open(file_path, 'w', encoding='utf-8') as f:
                                    f.write(fixed_content)
                                return True
                            except json.JSONDecodeError as new_error:
                                # 如果还有错误，继续修复
                                return fix_json_file(file_path)  # 递归修复
                            except Exception as fix_error:
                                print(f"  ❌ 修复失败: {fix_error}")
                                return False
                
                # 检查是否是控制字符错误
                if 'Bad control character' in str(e.msg):
                    # 移除控制字符
                    import re
                    fixed_content = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', content)
                    try:
                        json.loads(fixed_content)
                        with open(file_path, 'w', encoding='utf-8') as f:
                            f.write(fixed_content)
                        return True
                    except:
                        return False
            
            return False
            
    except Exception as error:
        print(f"  ❌ 处理失败: {error}")
        return False

def main():
    print('🔧 开始修复JSON格式错误...\n')
    
    fixed_count = 0
    failed_count = 0
    
    for file_path in files_to_fix:
        print(f'📝 处理: {file_path}')
        
        if fix_json_file(file_path):
            # 验证最终结果
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    json.loads(f.read())
                print(f'  ✅ 修复成功')
                fixed_count += 1
            except json.JSONDecodeError as e:
                print(f'  ❌ 修复后仍然无效: {e.msg} at line {e.lineno}')
                failed_count += 1
        else:
            failed_count += 1
    
    print(f'\n{"="*60}')
    print(f'✅ 修复完成！')
    print(f'   成功: {fixed_count} 个文件')
    print(f'   失败: {failed_count} 个文件')
    print(f'{"="*60}')

if __name__ == '__main__':
    main()
