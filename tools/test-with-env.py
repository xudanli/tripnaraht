#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从.env文件加载配置并测试
"""

import os
import sys
import subprocess

def load_env():
    """从.env文件加载环境变量"""
    env_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
    if os.path.exists(env_file):
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key.strip()] = value.strip()
        print(f"✓ 已加载.env文件: {env_file}")
    else:
        print(f"✗ 未找到.env文件: {env_file}")

def main():
    load_env()
    
    # 检查可用的API密钥
    mapbox_token = os.environ.get('MAPBOX_ACCESS_TOKEN') or os.environ.get('VITE_MAPBOX_ACCESS_TOKEN')
    google_key = os.environ.get('GOOGLE_MAPS_API_KEY') or os.environ.get('GOOGLE_ROUTES_API_KEY')
    
    if mapbox_token:
        print(f"✓ 找到Mapbox Token (长度: {len(mapbox_token)})")
        provider = 'mapbox'
        origin = '7.9904,46.5763'
        dest = '7.985,46.577'
    elif google_key:
        print(f"✓ 找到Google API Key (长度: {len(google_key)})")
        provider = 'google'
        origin = '39.9042,116.4074'
        dest = '39.914,116.403'
        os.environ['GOOGLE_MAPS_API_KEY'] = google_key
    else:
        print("✗ 未找到API密钥")
        return 1
    
    print(f"\n使用提供商: {provider}")
    print(f"测试路线: {origin} -> {dest}\n")
    
    # 检查依赖
    try:
        import requests
        print("✓ requests已安装")
    except ImportError:
        print("✗ requests未安装")
        print("  请运行: pip install requests pillow")
        return 1
    
    try:
        from PIL import Image
        print("✓ pillow已安装")
    except ImportError:
        print("⚠️  pillow未安装（Mapbox Terrain-RGB需要）")
    
    # 运行测试
    script_path = os.path.join(os.path.dirname(__file__), 'end2end_difficulty_with_geojson.py')
    
    print(f"\n运行测试...\n")
    
    cmd = [
        sys.executable,
        script_path,
        '--provider', provider,
        '--origin', origin,
        '--destination', dest,
        '--profile', 'walking',
        '--sample-m', '30',
        '--category', 'ATTRACTION',
        '--accessType', 'HIKING',
    ]
    
    try:
        result = subprocess.run(cmd, check=True, capture_output=False, text=True)
        print("\n✓ 测试成功完成！")
        return 0
    except subprocess.CalledProcessError as e:
        print(f"\n✗ 测试失败 (退出码: {e.returncode})")
        return e.returncode
    except Exception as e:
        print(f"\n✗ 错误: {e}")
        return 1

if __name__ == '__main__':
    sys.exit(main())

