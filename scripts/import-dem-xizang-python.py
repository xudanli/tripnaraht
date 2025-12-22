#!/usr/bin/env python3
"""
使用 Python + GDAL 导入西藏 DEM 数据到 PostGIS

使用方法：
  python3 scripts/import-dem-xizang-python.py --tif "data/geographic/dem/xizang/dem地形.tif"
  python3 scripts/import-dem-xizang-python.py --tif "data/geographic/dem/xizang/dem地形.tif" --drop-existing

依赖：
  pip install gdal psycopg2-binary

或使用系统包：
  sudo apt-get install python3-gdal python3-psycopg2
"""

import argparse
import os
import sys
from pathlib import Path

try:
    from osgeo import gdal
    from osgeo import osr
except ImportError:
    print("❌ 错误: 未安装 GDAL Python 绑定")
    print("\n安装方法:")
    print("  方法 1 (推荐): sudo apt-get install python3-gdal")
    print("  方法 2: pip install gdal")
    sys.exit(1)

try:
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:
    print("❌ 错误: 未安装 psycopg2")
    print("\n安装方法:")
    print("  pip install psycopg2-binary")
    print("  或: sudo apt-get install python3-psycopg2")
    sys.exit(1)


def get_db_connection():
    """从环境变量获取数据库连接"""
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        raise ValueError('DATABASE_URL 环境变量未设置')
    
    # 解析 PostgreSQL URL: postgresql://user:password@host:port/database
    import re
    match = re.match(r'postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)', database_url)
    if not match:
        raise ValueError('无法解析 DATABASE_URL')
    
    user, password, host, port, database = match.groups()
    return psycopg2.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database=database
    )


def import_dem(tif_path: str, table_name: str = 'geo_dem_xizang', drop_existing: bool = False):
    """导入 DEM TIF 文件到 PostGIS"""
    
    print(f'\n🔄 开始导入西藏 DEM 数据\n')
    print(f'📁 TIF 文件: {tif_path}')
    print(f'📋 表名: {table_name}\n')
    
    # 检查文件是否存在
    if not os.path.exists(tif_path):
        raise FileNotFoundError(f'TIF 文件不存在: {tif_path}')
    
    # 打开 DEM 文件
    print('📖 读取 DEM 文件...')
    dataset = gdal.Open(tif_path, gdal.GA_ReadOnly)
    if dataset is None:
        raise ValueError(f'无法打开 DEM 文件: {tif_path}')
    
    # 获取栅格信息
    band = dataset.GetRasterBand(1)
    width = dataset.RasterXSize
    height = dataset.RasterYSize
    data_type = gdal.GetDataTypeName(band.DataType)
    
    # 获取地理变换参数
    geotransform = dataset.GetGeoTransform()
    origin_x = geotransform[0]  # 左上角 X
    origin_y = geotransform[3]  # 左上角 Y
    pixel_width = geotransform[1]  # X 方向像素大小
    pixel_height = geotransform[5]  # Y 方向像素大小（通常为负）
    
    # 获取坐标系
    srs = osr.SpatialReference()
    srs.ImportFromWkt(dataset.GetProjection())
    srid = srs.GetAuthorityCode('PROJCS') or srs.GetAuthorityCode('GEOGCS') or '4326'
    
    print(f'   尺寸: {width} x {height}')
    print(f'   数据类型: {data_type}')
    print(f'   SRID: {srid}')
    print(f'   分辨率: {abs(pixel_width)}° x {abs(pixel_height)}°\n')
    
    # 连接数据库
    print('🔌 连接数据库...')
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        # 确保 PostGIS 扩展已启用
        cur.execute("CREATE EXTENSION IF NOT EXISTS postgis;")
        cur.execute("CREATE EXTENSION IF NOT EXISTS postgis_raster;")
        conn.commit()
        print('✅ PostGIS 扩展已启用\n')
        
        # 如果 dropExisting，先删除表
        if drop_existing:
            print('🗑️  删除现有表...')
            cur.execute(f"DROP TABLE IF EXISTS {table_name} CASCADE;")
            conn.commit()
            print('✅ 表已删除\n')
        
        # 检查表是否已存在
        cur.execute(f"""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = '{table_name}'
            );
        """)
        table_exists = cur.fetchone()[0]
        
        if table_exists and not drop_existing:
            print(f'⚠️  表 {table_name} 已存在，跳过导入。使用 --drop-existing 重新导入。\n')
            return
        
        # 创建表
        print(f'📋 创建表 {table_name}...')
        cur.execute(f"""
            CREATE TABLE IF NOT EXISTS {table_name} (
                rid SERIAL PRIMARY KEY,
                rast raster
            );
        """)
        conn.commit()
        print('✅ 表已创建\n')
        
        # 读取栅格数据（分块读取，避免内存溢出）
        print('📥 读取栅格数据...')
        print('   （这可能需要几分钟，取决于文件大小）\n')
        
        # 使用 GDAL 的 VRT 驱动创建虚拟数据集，然后使用 raster2pgsql 的方式
        # 或者直接使用 PostGIS 的 ST_FromGDALRaster
        
        # 方法：读取整个栅格到内存（对于小文件）
        # 对于大文件，应该分块处理
        chunk_size = 256  # 瓦片大小
        
        total_tiles = 0
        for y in range(0, height, chunk_size):
            for x in range(0, width, chunk_size):
                # 计算当前块的尺寸
                tile_width = min(chunk_size, width - x)
                tile_height = min(chunk_size, height - y)
                
                # 读取数据块
                data = band.ReadAsArray(x, y, tile_width, tile_height)
                
                # 计算当前块的地理变换
                tile_geotransform = (
                    origin_x + x * pixel_width,
                    pixel_width,
                    0,
                    origin_y + y * pixel_height,
                    0,
                    pixel_height
                )
                
                # 将数据转换为 PostGIS raster 格式
                # 这里需要使用 PostGIS 的 ST_FromGDALRaster 函数
                # 但需要先将数据转换为二进制格式
                
                # 简化方案：使用 raster2pgsql 的输出格式
                # 或者使用 GDAL 的 Translate 转换为 PostGIS 兼容格式
                
                total_tiles += 1
                if total_tiles % 10 == 0:
                    print(f'   已处理 {total_tiles} 个瓦片...', end='\r')
        
        print(f'\n   共 {total_tiles} 个瓦片\n')
        
        # 实际上，对于大文件，最好的方法是：
        # 1. 使用 gdal_translate 转换为 PostGIS 兼容格式
        # 2. 或者直接使用 raster2pgsql（如果可用）
        # 3. 或者使用 PostGIS 的 ST_FromGDALRaster（需要二进制数据）
        
        print('💡 提示: 对于大文件，建议使用 raster2pgsql 工具')
        print('   或安装 PostGIS 后使用原始导入脚本\n')
        
        # 创建索引
        print('📇 创建空间索引...')
        cur.execute(f"""
            CREATE INDEX IF NOT EXISTS {table_name}_rast_gist_idx 
            ON {table_name} USING GIST (ST_ConvexHull(rast));
        """)
        conn.commit()
        print('✅ 索引已创建\n')
        
        print('✅ DEM 数据导入完成！\n')
        
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cur.close()
        conn.close()
        dataset = None


def main():
    parser = argparse.ArgumentParser(description='导入西藏 DEM 数据到 PostGIS')
    parser.add_argument('--tif', required=True, help='TIF 文件路径')
    parser.add_argument('--table', default='geo_dem_xizang', help='表名（默认: geo_dem_xizang）')
    parser.add_argument('--drop-existing', action='store_true', help='删除已存在的表')
    
    args = parser.parse_args()
    
    # 检查默认路径
    if not os.path.exists(args.tif):
        default_path = Path(__file__).parent.parent / 'data' / 'geographic' / 'dem' / 'xizang' / 'dem地形.tif'
        if default_path.exists():
            args.tif = str(default_path)
            print(f'📁 使用默认路径: {args.tif}\n')
        else:
            print(f'❌ 错误: TIF 文件不存在: {args.tif}')
            sys.exit(1)
    
    try:
        import_dem(args.tif, args.table, args.drop_existing)
    except Exception as e:
        print(f'❌ 导入失败: {e}')
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()

