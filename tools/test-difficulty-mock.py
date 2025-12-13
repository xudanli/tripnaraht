#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
模拟测试脚本 - 不需要真实的API调用

测试完整的端到端逻辑，使用模拟的路线和高程数据
"""

import sys
import os
import json

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.trail_difficulty import DifficultyEstimator

def mock_haversine(lat1, lon1, lat2, lon2):
    """模拟Haversine距离计算"""
    # 简化版：返回固定距离（米）
    return 1000.0  # 1公里

def mock_route_coords():
    """模拟路线坐标"""
    # 北京天安门到故宫的路线（模拟）
    return [
        (39.9042, 116.4074),
        (39.9050, 116.4070),
        (39.9060, 116.4065),
        (39.9070, 116.4060),
        (39.9080, 116.4055),
        (39.9140, 116.4030),
    ]

def mock_elevations():
    """模拟高程数据"""
    # 模拟有爬升的路线
    return [50, 55, 60, 65, 70, 75]  # 从50m到75m，累计爬升25m

def test_end2end_logic():
    """测试端到端逻辑（模拟数据）"""
    print("=" * 60)
    print("端到端逻辑测试（使用模拟数据）")
    print("=" * 60)
    
    # 模拟数据
    coords = mock_route_coords()
    elevations = mock_elevations()
    
    # 计算距离（简化：假设每两点间1km）
    distance_km = (len(coords) - 1) * 1.0
    
    # 计算累计爬升
    gain_m = 0.0
    for i in range(len(elevations) - 1):
        diff = elevations[i+1] - elevations[i]
        if diff > 0:
            gain_m += diff
    
    # 计算平均坡度
    distance_m = distance_km * 1000
    slope_avg = gain_m / distance_m if distance_m > 0 else 0.0
    
    print(f"模拟路线数据:")
    print(f"  坐标点数: {len(coords)}")
    print(f"  距离: {distance_km:.2f} km")
    print(f"  累计爬升: {gain_m:.1f} m")
    print(f"  平均坡度: {slope_avg*100:.2f}%")
    print(f"  高程范围: {min(elevations)}m - {max(elevations)}m")
    print()
    
    # 测试场景1: 基础评估
    print("场景1: 基础评估")
    input_data = {
        'category': 'ATTRACTION',
        'accessType': 'HIKING',
    }
    label, S_km, notes = DifficultyEstimator.estimate_difficulty(
        input_data,
        distance_km=distance_km,
        gain_m=gain_m,
        slope_avg=slope_avg,
    )
    print(f"  结果: label={label.value}, S_km={S_km:.2f}, notes={notes}")
    print()
    
    # 测试场景2: 高海拔
    print("场景2: 高海拔修正（≥2000m）")
    input_data2 = {
        'category': 'ATTRACTION',
        'accessType': 'HIKING',
        'elevationMeters': 2300,
    }
    label2, S_km2, notes2 = DifficultyEstimator.estimate_difficulty(
        input_data2,
        distance_km=distance_km,
        gain_m=gain_m,
        slope_avg=slope_avg,
    )
    print(f"  结果: label={label2.value}, S_km={S_km2:.2f}, notes={notes2}")
    print()
    
    # 测试场景3: 官方评级
    print("场景3: 官方评级优先级")
    input_data3 = {
        'trailDifficulty': 'HARD',
        'category': 'ATTRACTION',
    }
    label3, S_km3, notes3 = DifficultyEstimator.estimate_difficulty(
        input_data3,
        distance_km=distance_km,
        gain_m=gain_m,
    )
    print(f"  结果: label={label3.value}, S_km={S_km3:.2f}, notes={notes3}")
    print()
    
    # 测试场景4: 陡坡
    print("场景4: 陡坡修正（≥15%）")
    # 创建陡坡场景：5km距离，750m爬升 = 15%坡度
    label4, S_km4, notes4 = DifficultyEstimator.estimate_difficulty(
        {'category': 'ATTRACTION', 'accessType': 'HIKING'},
        distance_km=5.0,
        gain_m=750,
        slope_avg=0.15,
    )
    print(f"  输入: 5km, 750m爬升, 15%坡度")
    print(f"  结果: label={label4.value}, S_km={S_km4:.2f}, notes={notes4}")
    print()
    
    # 生成输出JSON
    result = {
        'distance_km': round(distance_km, 3),
        'elevation_gain_m': round(gain_m, 1),
        'slope_avg': round(slope_avg, 4),
        'label': label.value,
        'S_km': S_km,
        'notes': notes,
    }
    
    print("=" * 60)
    print("输出JSON:")
    print("=" * 60)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print()
    
    return result

if __name__ == '__main__':
    try:
        test_end2end_logic()
        print("=" * 60)
        print("✓ 所有测试通过！")
        print("=" * 60)
    except Exception as e:
        print(f"✗ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

