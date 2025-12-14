#!/usr/bin/env python3
"""
城市数据导入脚本（简化版 - 仅使用 Python 标准库）
直接读取 CSV 文件并导入到 PostgreSQL 数据库
"""

import sys
import csv
import json
import psycopg2
from pathlib import Path
import os
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# 数据库连接配置
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': int(os.getenv('DB_PORT', 5432)),
    'database': os.getenv('DB_NAME', 'postgres'),
    'user': os.getenv('DB_USER', 'postgres'),
    'password': os.getenv('DB_PASSWORD', ''),
}

# 如果 DATABASE_URL 存在，解析它
DATABASE_URL = os.getenv('DATABASE_URL')
if DATABASE_URL:
    # 解析 postgresql://user:password@host:port/database
    import re
    match = re.match(r'postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/([^?]+)', DATABASE_URL)
    if match:
        DB_CONFIG['user'] = match.group(1)
        DB_CONFIG['password'] = match.group(2)
        DB_CONFIG['host'] = match.group(3)
        DB_CONFIG['port'] = int(match.group(4))
        DB_CONFIG['database'] = match.group(5)


def extract_field_value(row: dict, field_names: list) -> str:
    """从行数据中提取字段值（按优先级）"""
    for field in field_names:
        if field in row and row[field] and row[field].strip():
            return row[field].strip()
    return None


def convert_row_to_city_data(row: dict) -> dict:
    """将 CSV 行转换为 City 表数据格式"""
    # 必需字段
    name = extract_field_value(row, ['NAME', 'name', 'city', 'cityName'])
    country_code = extract_field_value(row, ['ISO_A2', 'countryCode', 'country_code', 'iso_code'])
    
    if not name or not country_code:
        return None
    
    # 验证国家代码格式
    country_code = country_code.upper().strip()
    if len(country_code) != 2 or not country_code.isalpha():
        return None
    
    city_data = {
        'name': name,
        'countryCode': country_code,
    }
    
    # 可选字段
    name_cn = extract_field_value(row, ['NAME_ZH', 'NAME_ZHT', 'nameCN', 'name_zh'])
    if name_cn:
        city_data['nameCN'] = name_cn
    
    name_en = extract_field_value(row, ['NAME_EN', 'nameEN', 'name_en'])
    if name_en:
        city_data['nameEN'] = name_en
    
    # 坐标
    lat_str = extract_field_value(row, ['纬度', 'LAT', 'latitude', 'lat', 'y'])
    lng_str = extract_field_value(row, ['经度', 'LNG', 'LON', 'longitude', 'lng', 'lon', 'x'])
    
    if lat_str and lng_str:
        try:
            city_data['latitude'] = float(lat_str)
            city_data['longitude'] = float(lng_str)
        except (ValueError, TypeError):
            pass
    
    # 时区
    timezone = extract_field_value(row, ['TIMEZONE', 'TIMEZO', 'timezone', 'timeZone'])
    if timezone and len(timezone) > 3:
        city_data['timezone'] = timezone
    
    # Metadata（扩展信息）
    metadata = {}
    
    # 行政区划
    adm0 = extract_field_value(row, ['ADM0NAME', 'country', '国家'])
    if adm0:
        metadata['adminLevel0'] = adm0
    
    adm1 = extract_field_value(row, ['ADM1NAME', 'province', 'state', '省', '州'])
    if adm1:
        metadata['adminLevel1'] = adm1
    
    # 外部ID
    wikidata_id = extract_field_value(row, ['WIKIDATAID', 'WIKID/A', 'wikidataId'])
    if wikidata_id:
        metadata['wikidataId'] = wikidata_id
    
    geonames_id = extract_field_value(row, ['GEONAMESID', 'geonamesId'])
    if geonames_id:
        try:
            metadata['geonamesId'] = int(geonames_id)
        except (ValueError, TypeError):
            metadata['geonamesId'] = geonames_id
    
    wof_id = extract_field_value(row, ['WOF_ID', 'wofId'])
    if wof_id:
        try:
            metadata['wofId'] = int(wof_id)
        except (ValueError, TypeError):
            metadata['wofId'] = wof_id
    
    # 其他语言名称
    lang_fields = {
        'NAME_DE': 'nameDE',
        'NAME_ES': 'nameES',
        'NAME_FR': 'nameFR',
        'NAME_JA': 'nameJA',
        'NAME_KO': 'nameKO',
    }
    
    for source_field, target_key in lang_fields.items():
        value = extract_field_value(row, [source_field])
        if value:
            metadata[target_key] = value
    
    # 要素分类
    feature_class = extract_field_value(row, ['FEATURECLA', 'featureClass'])
    if feature_class:
        metadata['featureClass'] = feature_class
    
    if metadata:
        city_data['metadata'] = json.dumps(metadata, ensure_ascii=False)
    
    return city_data


def import_cities_to_db(cities_data: list, batch_size: int = 500):
    """导入城市数据到数据库"""
    print(f"🔌 连接数据库: {DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']}")
    
    try:
        conn = psycopg2.connect(**DB_CONFIG)
    except Exception as e:
        print(f"❌ 数据库连接失败: {e}")
        print(f"   请检查 .env 文件中的 DATABASE_URL 或数据库配置")
        sys.exit(1)
    
    cur = conn.cursor()
    
    try:
        success_count = 0
        skipped_count = 0
        error_count = 0
        
        print(f"\n📊 开始导入 {len(cities_data)} 条数据...\n")
        
        for i, city in enumerate(cities_data, 1):
            try:
                # 检查是否已存在
                cur.execute("""
                    SELECT id FROM "City" 
                    WHERE name = %s AND "countryCode" = %s
                """, (city['name'], city['countryCode']))
                
                existing = cur.fetchone()
                if existing:
                    skipped_count += 1
                    if i % 100 == 0:
                        progress = (i / len(cities_data) * 100)
                        print(f"进度: {i}/{len(cities_data)} ({progress:.1f}%) - 已存在: {skipped_count}, 成功: {success_count}, 错误: {error_count}")
                    continue
                
                # 构建 SQL
                fields = ['name', '"countryCode"']
                values = [city['name'], city['countryCode']]
                placeholders = ['%s', '%s']
                
                if 'nameCN' in city:
                    fields.append('"nameCN"')
                    values.append(city['nameCN'])
                    placeholders.append('%s')
                
                if 'nameEN' in city:
                    fields.append('"nameEN"')
                    values.append(city['nameEN'])
                    placeholders.append('%s')
                
                if 'timezone' in city:
                    fields.append('timezone')
                    values.append(city['timezone'])
                    placeholders.append('%s')
                
                if 'metadata' in city:
                    fields.append('metadata')
                    values.append(city['metadata'])
                    placeholders.append('%s::jsonb')
                
                # 如果有坐标，使用 PostGIS
                if 'latitude' in city and 'longitude' in city:
                    fields.append('location')
                    placeholders.append('ST_SetSRID(ST_MakePoint(%s, %s), 4326)')
                    sql = f"""
                        INSERT INTO "City" ({', '.join(fields)})
                        VALUES ({', '.join(placeholders)})
                        RETURNING id
                    """
                    final_values = values.copy()
                    final_values.extend([city['longitude'], city['latitude']])
                    cur.execute(sql, final_values)
                else:
                    sql = f"""
                        INSERT INTO "City" ({', '.join(fields)})
                        VALUES ({', '.join(placeholders)})
                        RETURNING id
                    """
                    cur.execute(sql, values)
                
                city_id = cur.fetchone()[0]
                success_count += 1
                
                # 每 batch_size 条提交一次，并显示进度
                if i % batch_size == 0:
                    conn.commit()
                    progress = (i / len(cities_data) * 100)
                    print(f"进度: {i}/{len(cities_data)} ({progress:.1f}%) - 已存在: {skipped_count}, 成功: {success_count}, 错误: {error_count}")
                elif i % 100 == 0:
                    progress = (i / len(cities_data) * 100)
                    print(f"进度: {i}/{len(cities_data)} ({progress:.1f}%) - 已存在: {skipped_count}, 成功: {success_count}, 错误: {error_count}")
                
            except Exception as e:
                error_count += 1
                print(f"❌ 导入失败: {city.get('name', 'Unknown')} - {str(e)}")
                conn.rollback()
        
        # 最终提交
        conn.commit()
        
        print(f"\n{'='*50}")
        print(f"📊 导入完成:")
        print(f"  ✅ 成功创建: {success_count}")
        print(f"  ⏭️  已存在（跳过）: {skipped_count}")
        print(f"  ❌ 失败: {error_count}")
        print(f"{'='*50}\n")
        
    finally:
        cur.close()
        conn.close()


def main():
    if len(sys.argv) < 2:
        print("使用方法: python import_cities_simple.py <CSV文件路径>")
        sys.exit(1)
    
    file_path = sys.argv[1]
    file_path = Path(file_path)
    
    if not file_path.exists():
        print(f"❌ 文件不存在: {file_path}")
        sys.exit(1)
    
    try:
        # 读取 CSV 文件
        print(f"📂 读取文件: {file_path}\n")
        
        cities_data = []
        skipped = []
        
        with open(file_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            total_rows = 0
            
            for idx, row in enumerate(reader, 1):
                total_rows = idx
                city_data = convert_row_to_city_data(row)
                if city_data:
                    cities_data.append(city_data)
                else:
                    skipped.append(idx)
        
        print(f"✅ 读取完成: {total_rows} 行")
        print(f"✅ 转换完成: {len(cities_data)} 条有效数据")
        if skipped:
            print(f"⏭️  跳过: {len(skipped)} 条（缺少必需字段）")
        
        if not cities_data:
            print("❌ 没有有效数据可导入")
            sys.exit(1)
        
        # 导入数据库
        import_cities_to_db(cities_data)
        
    except Exception as e:
        print(f"❌ 错误: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()

