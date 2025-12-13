#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
简单的难度评估测试脚本（不需要API调用）

测试难度分级器的基本功能
"""

import sys
import os

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.trail_difficulty import DifficultyEstimator, DifficultyLabel

def test_basic():
    """测试基础难度评估"""
    print("=" * 60)
    print("测试1: 基础难度评估（基于距离和爬升）")
    print("=" * 60)
    
    input_data = {
        'category': 'ATTRACTION',
        'accessType': 'HIKING',
    }
    
    label, S_km, notes = DifficultyEstimator.estimate_difficulty(
        input_data,
        distance_km=10.8,
        gain_m=720,
        slope_avg=0.067,
    )
    
    print(f"输入: distance=10.8km, gain=720m, slope=6.7%")
    print(f"结果: label={label.value}, S_km={S_km}, notes={notes}")
    print()

def test_altitude():
    """测试高海拔修正"""
    print("=" * 60)
    print("测试2: 高海拔修正（≥2000m）")
    print("=" * 60)
    
    input_data = {
        'category': 'ATTRACTION',
        'accessType': 'HIKING',
        'elevationMeters': 2300,
    }
    
    label, S_km, notes = DifficultyEstimator.estimate_difficulty(
        input_data,
        distance_km=10.0,
        gain_m=500,
    )
    
    print(f"输入: distance=10km, gain=500m, elevation=2300m")
    print(f"结果: label={label.value}, S_km={S_km}, notes={notes}")
    print()

def test_trail_difficulty():
    """测试官方评级（最高优先级）"""
    print("=" * 60)
    print("测试3: 官方评级（trailDifficulty，最高优先级）")
    print("=" * 60)
    
    input_data = {
        'trailDifficulty': 'HARD',
        'category': 'ATTRACTION',
    }
    
    label, S_km, notes = DifficultyEstimator.estimate_difficulty(
        input_data,
        distance_km=5.0,  # 即使距离很短，也应该返回HARD
        gain_m=100,
    )
    
    print(f"输入: trailDifficulty=HARD, distance=5km")
    print(f"结果: label={label.value}, S_km={S_km}, notes={notes}")
    print()

def test_visit_duration():
    """测试访问时长推断距离"""
    print("=" * 60)
    print("测试4: 从visitDuration推断距离")
    print("=" * 60)
    
    input_data = {
        'category': 'ATTRACTION',
        'accessType': 'HIKING',
        'visitDuration': '半天',
    }
    
    label, S_km, notes = DifficultyEstimator.estimate_difficulty(
        input_data,
        distance_km=None,  # 不提供距离，从visitDuration推断
        gain_m=0,
    )
    
    print(f"输入: visitDuration='半天', accessType=HIKING")
    print(f"结果: label={label.value}, S_km={S_km}, notes={notes}")
    print()

def test_steep_slope():
    """测试陡坡修正"""
    print("=" * 60)
    print("测试5: 陡坡修正（≥15%上调一档）")
    print("=" * 60)
    
    input_data = {
        'category': 'ATTRACTION',
        'accessType': 'HIKING',
    }
    
    # 先测试没有陡坡的情况
    label1, S_km1, _ = DifficultyEstimator.estimate_difficulty(
        input_data,
        distance_km=5.0,
        gain_m=500,  # 10%坡度
        slope_avg=0.10,
    )
    
    # 再测试有陡坡的情况
    label2, S_km2, notes2 = DifficultyEstimator.estimate_difficulty(
        input_data,
        distance_km=5.0,
        gain_m=750,  # 15%坡度
        slope_avg=0.15,
    )
    
    print(f"输入1: distance=5km, gain=500m (10%坡度)")
    print(f"结果1: label={label1.value}, S_km={S_km1}")
    print()
    print(f"输入2: distance=5km, gain=750m (15%坡度)")
    print(f"结果2: label={label2.value}, S_km={S_km2}, notes={notes2}")
    print()

if __name__ == '__main__':
    print("\n开始测试难度评估模型...\n")
    
    try:
        test_basic()
        test_altitude()
        test_trail_difficulty()
        test_visit_duration()
        test_steep_slope()
        
        print("=" * 60)
        print("所有测试完成！")
        print("=" * 60)
    except Exception as e:
        print(f"测试失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

