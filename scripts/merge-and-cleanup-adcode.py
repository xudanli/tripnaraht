#!/usr/bin/env python3
"""
合并并清理 adcode 数据
1. 将 adcode 值更新到对应的城市记录（通过 name + countryCode 匹配）
2. 删除所有有 adcode 的重复记录
"""

import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
import re

# 加载环境变量
load_dotenv()

# 解析 DATABASE_URL
DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    print("❌ 未找到 DATABASE_URL 环境变量")
    sys.exit(1)

# 解析 postgresql://user:password@host:port/database
match = re.match(r'postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/([^?]+)', DATABASE_URL)
if not match:
    print("❌ 无法解析 DATABASE_URL")
    sys.exit(1)

DB_CONFIG = {
    'user': match.group(1),
    'password': match.group(2),
    'host': match.group(3),
    'port': int(match.group(4)),
    'database': match.group(5),
}

print("🔄 合并并清理 City 表的 adcode 数据...")
print("")
print("📊 数据库信息:")
print(f"  Host: {DB_CONFIG['host']}")
print(f"  Port: {DB_CONFIG['port']}")
print(f"  Database: {DB_CONFIG['database']}")
print(f"  User: {DB_CONFIG['user']}")
print("")

try:
    # 连接数据库
    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = False  # 使用事务
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    # 步骤1: 查看当前数据情况
    print("📋 查看当前数据情况...")
    cur.execute("""
        SELECT 
            COUNT(*) as total_cities,
            COUNT(CASE WHEN adcode IS NOT NULL THEN 1 END) as cities_with_adcode,
            COUNT(CASE WHEN adcode IS NULL THEN 1 END) as cities_without_adcode
        FROM "City"
    """)
    stats = cur.fetchone()
    print(f"  总城市数: {stats['total_cities']}")
    print(f"  有 adcode 的城市: {stats['cities_with_adcode']}")
    print(f"  无 adcode 的城市: {stats['cities_without_adcode']}")
    print("")
    
    # 查看需要合并的重复组
    print("🔍 查找需要合并的重复城市（有 adcode 和无 adcode 的重复）...")
    cur.execute("""
        SELECT 
            name,
            "countryCode",
            COUNT(*) as count,
            COUNT(CASE WHEN adcode IS NOT NULL THEN 1 END) as with_adcode,
            COUNT(CASE WHEN adcode IS NULL THEN 1 END) as without_adcode
        FROM "City"
        GROUP BY name, "countryCode"
        HAVING COUNT(*) > 1
          AND COUNT(CASE WHEN adcode IS NOT NULL THEN 1 END) > 0
          AND COUNT(CASE WHEN adcode IS NULL THEN 1 END) > 0
        ORDER BY name, "countryCode"
        LIMIT 20
    """)
    duplicates = cur.fetchall()
    if duplicates:
        print(f"  找到 {len(duplicates)} 组重复城市（显示前20组）:")
        for dup in duplicates:
            print(f"    - {dup['name']} ({dup['countryCode']}): 总数={dup['count']}, 有adcode={dup['with_adcode']}, 无adcode={dup['without_adcode']}")
    else:
        print("  未找到需要合并的重复城市")
    print("")
    
    # 询问用户确认（如果提供了 --yes 参数则跳过）
    if '--yes' not in sys.argv:
        confirm = input("⚠️  确认要继续执行合并和删除操作吗？(yes/no): ")
        if confirm != "yes":
            print("❌ 操作已取消")
            conn.rollback()
            conn.close()
            sys.exit(0)
    else:
        print("⚠️  使用 --yes 参数，跳过确认，直接执行...")
    
    # 步骤2: 将有 adcode 的记录的 adcode 值更新到对应的城市记录
    print("")
    print("🚀 执行合并和清理操作...")
    print("  步骤1: 合并 adcode 值...")
    cur.execute("""
        UPDATE "City" AS target
        SET adcode = source.adcode
        FROM (
            SELECT 
                name,
                "countryCode",
                adcode
            FROM "City"
            WHERE adcode IS NOT NULL
        ) AS source
        WHERE target.name = source.name
          AND target."countryCode" = source."countryCode"
          AND target.adcode IS NULL
          AND source.adcode IS NOT NULL
    """)
    updated_count = cur.rowcount
    print(f"  ✅ 已更新 {updated_count} 条记录的 adcode 字段")
    
    # 步骤3: 删除所有有 adcode 的记录
    print("  步骤2: 删除所有有 adcode 的记录...")
    cur.execute('DELETE FROM "City" WHERE adcode IS NOT NULL')
    deleted_count = cur.rowcount
    print(f"  ✅ 已删除 {deleted_count} 条有 adcode 的记录")
    
    # 提交事务
    conn.commit()
    print("")
    print("✅ 操作成功完成！")
    print("")
    
    # 步骤4: 显示最终统计
    print("📊 最终数据统计:")
    cur.execute("""
        SELECT 
            COUNT(*) as total_cities,
            COUNT(CASE WHEN adcode IS NOT NULL THEN 1 END) as cities_with_adcode,
            COUNT(CASE WHEN adcode IS NULL THEN 1 END) as cities_without_adcode
        FROM "City"
    """)
    final_stats = cur.fetchone()
    print(f"  总城市数: {final_stats['total_cities']}")
    print(f"  有 adcode 的城市: {final_stats['cities_with_adcode']}")
    print(f"  无 adcode 的城市: {final_stats['cities_without_adcode']}")
    
    cur.close()
    conn.close()
    
except psycopg2.Error as e:
    print(f"❌ 数据库错误: {e}")
    if 'conn' in locals():
        conn.rollback()
        conn.close()
    sys.exit(1)
except Exception as e:
    print(f"❌ 错误: {e}")
    import traceback
    traceback.print_exc()
    if 'conn' in locals():
        conn.rollback()
        conn.close()
    sys.exit(1)

