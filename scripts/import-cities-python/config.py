"""
配置文件：数据库连接和导入参数
"""
import os
from dotenv import load_dotenv

load_dotenv()

# 数据库连接配置
DATABASE_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': int(os.getenv('DB_PORT', 5432)),
    'database': os.getenv('DB_NAME', 'postgres'),
    'user': os.getenv('DB_USER', 'postgres'),
    'password': os.getenv('DB_PASSWORD', ''),
}

# 导入配置
IMPORT_CONFIG = {
    'batch_size': 100,  # 每批导入的记录数
    'skip_existing': True,  # 是否跳过已存在的记录
    'verbose': True,  # 是否显示详细信息
}

