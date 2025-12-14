#!/usr/bin/env python3
"""
城市数据导入脚本
直接读取数据文件（CSV/Excel/JSON）并导入到 PostgreSQL 数据库

使用方法:
    python import_cities.py <数据文件路径>

示例:
    python import_cities.py cities.csv
    python import_cities.py cities.xlsx
    python import_cities.py cities.json
"""

import sys
import pandas as pd
import json
import psycopg2
from psycopg2.extras import execute_values
from psycopg2.extensions import register_adapter, AsIs
from pathlib import Path
from typing import Dict, Any, Optional, List
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

# 字段映射：原始字段名 -> 数据库字段名
FIELD_MAPPING = {
    # 必需字段
    'NAME': 'name',
    'name': 'name',
    'city': 'name',
    'cityName': 'name',
    '城市名称': 'name',
    
    'ISO_A2': 'countryCode',
    'countryCode': 'countryCode',
    'country_code': 'countryCode',
    'iso_code': 'countryCode',
    '国家代码': 'countryCode',
    
    # 可选字段
    'NAME_ZH': 'nameCN',
    'NAME_ZHT': 'nameCN',
    'nameCN': 'nameCN',
    'name_zh': 'nameCN',
    '中文名称': 'nameCN',
    
    'NAME_EN': 'nameEN',
    'nameEN': 'nameEN',
    'name_en': 'nameEN',
    '英文名称': 'nameEN',
    
    '纬度': 'latitude',
    'LAT': 'latitude',
    'latitude': 'latitude',
    'lat': 'latitude',
    'y': 'latitude',
    
    '经度': 'longitude',
    'LNG': 'longitude',
    'LON': 'longitude',
    'longitude': 'longitude',
    'lng': 'longitude',
    'lon': 'longitude',
    'x': 'longitude',
    
    'TIMEZONE': 'timezone',
    'TIMEZO': 'timezone',
    'timezone': 'timezone',
    'timeZone': 'timezone',
    '时区': 'timezone',
    
    'adcode': 'adcode',
    'ad_code': 'adcode',
    'admin_code': 'adcode',
    '行政区划代码': 'adcode',
}


def read_data_file(file_path: str) -> pd.DataFrame:
    """读取数据文件"""
    file_path = Path(file_path)
    
    if not file_path.exists():
        raise FileNotFoundError(f"文件不存在: {file_path}")
    
    print(f"📂 读取文件: {file_path}")
    
    suffix = file_path.suffix.lower()
    
    if suffix == '.csv':
        df = pd.read_csv(file_path, encoding='utf-8')
    elif suffix in ['.xlsx', '.xls']:
        df = pd.read_excel(file_path)
    elif suffix == '.json':
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if isinstance(data, list):
            df = pd.DataFrame(data)
        elif isinstance(data, dict) and 'cities' in data:
            df = pd.DataFrame(data['cities'])
        else:
            raise ValueError("JSON 格式错误：应为数组或包含 'cities' 数组的对象")
    else:
        raise ValueError(f"不支持的文件格式: {suffix}")
    
    print(f"✅ 读取成功，共 {len(df)} 行，{len(df.columns)} 列\n")
    return df


def extract_field_value(row: pd.Series, field_names: List[str]) -> Optional[Any]:
    """从行数据中提取字段值（按优先级）"""
    for field in field_names:
        if field in row and pd.notna(row[field]):
            value = row[field]
            # 处理字符串类型，去除首尾空格
            if isinstance(value, str):
                return value.strip()
            return value
    return None


def convert_row_to_city_data(row: pd.Series) -> Optional[Dict[str, Any]]:
    """将数据行转换为 City 表数据格式"""
    # 必需字段
    name = extract_field_value(row, ['NAME', 'name', 'city', 'cityName', '城市名称'])
    country_code = extract_field_value(row, ['ISO_A2', 'countryCode', 'country_code', 'iso_code', '国家代码'])
    
    if not name or not country_code:
        return None
    
    # 验证国家代码格式
    country_code = str(country_code).strip().upper()
    if len(country_code) != 2 or not country_code.isalpha():
        return None
    
    city_data = {
        'name': str(name).strip(),
        'countryCode': country_code,
    }
    
    # 可选字段
    name_cn = extract_field_value(row, ['NAME_ZH', 'NAME_ZHT', 'nameCN', 'name_zh', '中文名称'])
    if name_cn:
        city_data['nameCN'] = str(name_cn).strip()
    
    name_en = extract_field_value(row, ['NAME_EN', 'nameEN', 'name_en', '英文名称'])
    if name_en:
        city_data['nameEN'] = str(name_en).strip()
    
    # 坐标
    lat = extract_field_value(row, ['纬度', 'LAT', 'latitude', 'lat', 'y'])
    lng = extract_field_value(row, ['经度', 'LNG', 'LON', 'longitude', 'lng', 'lon', 'x'])
    
    if lat is not None and lng is not None:
        try:
            city_data['latitude'] = float(lat)
            city_data['longitude'] = float(lng)
        except (ValueError, TypeError):
            pass
    
    # 时区
    timezone = extract_field_value(row, ['TIMEZONE', 'TIMEZO', 'timezone', 'timeZone', '时区'])
    if timezone and len(str(timezone)) > 3:
        city_data['timezone'] = str(timezone).strip()
    
    # 行政区划代码
    adcode = extract_field_value(row, ['adcode', 'ad_code', 'admin_code', '行政区划代码'])
    if adcode:
        adcode_str = str(adcode).strip()
        if adcode_str.isdigit() and len(adcode_str) == 6:
            city_data['adcode'] = adcode_str
    
    # Metadata（扩展信息）
    metadata = {}
    
    # 行政区划
    adm0 = extract_field_value(row, ['ADM0NAME', 'country', '国家'])
    if adm0:
        metadata['adminLevel0'] = str(adm0).strip()
    
    adm1 = extract_field_value(row, ['ADM1NAME', 'province', 'state', '省', '州'])
    if adm1:
        metadata['adminLevel1'] = str(adm1).strip()
    
    # 外部ID
    wikidata_id = extract_field_value(row, ['WIKIDATAID', 'WIKID/A', 'wikidataId'])
    if wikidata_id:
        metadata['wikidataId'] = str(wikidata_id).strip()
    
    geonames_id = extract_field_value(row, ['GEONAMESID', 'geonamesId'])
    if geonames_id:
        try:
            metadata['geonamesId'] = int(geonames_id)
        except (ValueError, TypeError):
            metadata['geonamesId'] = str(geonames_id).strip()
    
    wof_id = extract_field_value(row, ['WOF_ID', 'wofId'])
    if wof_id:
        try:
            metadata['wofId'] = int(wof_id)
        except (ValueError, TypeError):
            metadata['wofId'] = str(wof_id).strip()
    
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
            metadata[target_key] = str(value).strip()
    
    # 要素分类
    feature_class = extract_field_value(row, ['FEATURECLA', 'featureClass'])
    if feature_class:
        metadata['featureClass'] = str(feature_class).strip()
    
    if metadata:
        city_data['metadata'] = json.dumps(metadata, ensure_ascii=False)
    
    return city_data


def import_cities_to_db(cities_data: List[Dict[str, Any]], batch_size: int = 500):
    """导入城市数据到数据库"""
    print(f"🔌 连接数据库: {DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']}")
    
    conn = psycopg2.connect(**DB_CONFIG)
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
                        print(f"进度: {i}/{len(cities_data)} (已存在: {skipped_count}, 成功: {success_count}, 错误: {error_count})")
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
                
                if 'adcode' in city:
                    fields.append('adcode')
                    values.append(city['adcode'])
                    placeholders.append('%s')
                
                if 'metadata' in city:
                    fields.append('metadata')
                    values.append(city['metadata'])
                    placeholders.append('%s::jsonb')
                
                # 构建 SQL 和参数
                if 'latitude' in city and 'longitude' in city:
                    # 有坐标，使用 PostGIS 函数
                    fields.append('location')
                    placeholders.append('ST_SetSRID(ST_MakePoint(%s, %s), 4326)')
                    # 坐标值需要单独添加
                    sql = f"""
                        INSERT INTO "City" ({', '.join(fields)})
                        VALUES ({', '.join(placeholders)})
                        RETURNING id
                    """
                    # 构建最终参数列表，坐标放在最后
                    final_values = values.copy()
                    final_values.extend([city['longitude'], city['latitude']])
                    cur.execute(sql, final_values)
                else:
                    # 没有坐标，普通插入
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
                    # 每 100 条显示一次进度（但不提交）
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
        print("使用方法: python import_cities.py <数据文件路径>")
        print("\n支持的文件格式:")
        print("  - CSV (.csv)")
        print("  - Excel (.xlsx, .xls)")
        print("  - JSON (.json)")
        sys.exit(1)
    
    file_path = sys.argv[1]
    
    try:
        # 读取数据
        df = read_data_file(file_path)
        
        # 转换数据
        print("🔄 转换数据...")
        cities_data = []
        skipped = []
        
        for idx, row in df.iterrows():
            city_data = convert_row_to_city_data(row)
            if city_data:
                cities_data.append(city_data)
            else:
                skipped.append(idx + 1)
        
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

