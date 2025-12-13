#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
徒步难度评估模型

根据距离、爬升、海拔等数据评估路线难度等级。
注意：这是基于体力消耗的"强度等级"，不是技术难度。
"""

from typing import Optional, List, Tuple
from enum import Enum


class DifficultyLabel(str, Enum):
    """难度等级标签"""
    EASY = "EASY"
    MODERATE = "MODERATE"
    HARD = "HARD"
    EXTREME = "EXTREME"


class DifficultyEstimator:
    """难度评估器"""
    
    # 强度阈值（等效距离 S_km）
    THRESHOLD_EASY = 8.0      # ≤8 km
    THRESHOLD_MODERATE = 16.0  # ≤16 km
    THRESHOLD_HARD = 30.0      # ≤30 km
    # >30 km → EXTREME
    
    # 高海拔阈值（米）
    HIGH_ELEVATION_THRESHOLD = 2000
    
    # 陡坡阈值（坡度百分比）
    STEEP_SLOPE_THRESHOLD = 0.15  # 15%
    
    @staticmethod
    def estimate_difficulty(
        input_data: dict,
        distance_km: Optional[float] = None,
        gain_m: Optional[float] = None,
        max_elev_m: Optional[float] = None,
        slope_avg: Optional[float] = None,
    ) -> Tuple[DifficultyLabel, float, List[str]]:
        """
        评估路线难度
        
        Args:
            input_data: 输入数据字典，包含以下字段：
                - trailDifficulty: 官方评级（最高优先级，直接使用）
                - category: 类别
                - accessType: 访问方式（HIKING, VEHICLE, CABLE_CAR等）
                - visitDuration: 访问时长（文本，如"半天"、"2小时"）
                - typicalStay: 典型停留时间
                - elevationMeters: 海拔（米）
                - subCategory: 子类别
            distance_km: 实际路线距离（公里）
            gain_m: 累计爬升（米）
            max_elev_m: 最高海拔（米）
            slope_avg: 平均坡度（0-1之间的小数）
        
        Returns:
            (label, S_km, notes)
            - label: 难度等级
            - S_km: 等效强度距离（公里）
            - notes: 解释说明列表
        """
        notes: List[str] = []
        
        # 优先级1：trailDifficulty 直用
        trail_difficulty = input_data.get('trailDifficulty')
        if trail_difficulty and trail_difficulty.upper() in ['EASY', 'MODERATE', 'HARD', 'EXTREME']:
            label = DifficultyLabel[trail_difficulty.upper()]
            return label, 0.0, ["use: trailDifficulty"]
        
        # 推断距离（如果未提供）
        D = distance_km
        if D is None:
            D = DifficultyEstimator._infer_distance_km(input_data)
            if D is None:
                # 使用类别默认值
                label = DifficultyEstimator._default_label_by_category(input_data.get('category'))
                return label, 0.0, ["fallback: category default"]
        
        # 累计爬升（默认0）
        E = gain_m if gain_m is not None else 0
        
        # 基础强度：S_km = D + E/100
        S_km = D + (E / 100.0)
        
        # 高海拔修正
        elevation_m = max_elev_m or input_data.get('elevationMeters')
        if elevation_m and elevation_m >= DifficultyEstimator.HIGH_ELEVATION_THRESHOLD:
            S_km *= 1.3
            notes.append("altitude: ×1.3")
        
        # 基础难度映射
        if S_km <= DifficultyEstimator.THRESHOLD_EASY:
            label = DifficultyLabel.EASY
        elif S_km <= DifficultyEstimator.THRESHOLD_MODERATE:
            label = DifficultyLabel.MODERATE
        elif S_km <= DifficultyEstimator.THRESHOLD_HARD:
            label = DifficultyLabel.HARD
        else:
            label = DifficultyLabel.EXTREME
        
        # 坡度修正（如果平均坡度 >= 15%，上调一档）
        if slope_avg is None and D > 0 and E > 0:
            slope_avg = E / (D * 1000.0)
        
        if slope_avg and slope_avg >= DifficultyEstimator.STEEP_SLOPE_THRESHOLD:
            label = DifficultyEstimator._bump_one_level(label)
            notes.append(f"slope: bump one level (≥{DifficultyEstimator.STEEP_SLOPE_THRESHOLD*100}%)")
        
        # accessType 修正：车辆/缆车至少 EASY
        access_type = input_data.get('accessType', '').upper()
        if access_type in ['VEHICLE', 'CABLE_CAR']:
            if label.value == DifficultyLabel.EASY:
                pass  # 已经是EASY
            else:
                label = DifficultyLabel.EASY
                notes.append("accessType: vehicle/cable_car → at least EASY")
        
        # subCategory 修正：冰川/火山至少 MODERATE
        sub_category = (input_data.get('subCategory') or '').lower()
        if sub_category in ['glacier', 'volcano']:
            if label.value in [DifficultyLabel.EASY]:
                label = DifficultyLabel.MODERATE
                notes.append(f"subCategory: {sub_category} → at least MODERATE")
        
        return label, round(S_km, 2), notes
    
    @staticmethod
    def _parse_duration(text: str) -> Optional[float]:
        """解析时长文本为小时数"""
        if not text:
            return None
        
        text = text.strip()
        
        # 半天 = 4小时
        if '半天' in text:
            return 4.0
        # 全天/全日 = 8小时
        if '全天' in text or '全日' in text:
            return 8.0
        
        # 匹配数字 + 小时/天/分钟
        import re
        # 小时
        hour_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:小时|h|hr|hrs)', text, re.IGNORECASE)
        if hour_match:
            return float(hour_match.group(1))
        
        # 天
        day_match = re.search(r'(\d+(?:\.\d+)?)\s*天', text)
        if day_match:
            return float(day_match.group(1)) * 8.0
        
        # 分钟
        min_match = re.search(r'(\d+)\s*(?:分钟|min|mins)', text, re.IGNORECASE)
        if min_match:
            return float(min_match.group(1)) / 60.0
        
        return None
    
    @staticmethod
    def _infer_distance_km(input_data: dict) -> Optional[float]:
        """从访问时长推断距离"""
        # 解析时长
        visit_duration = input_data.get('visitDuration')
        hours = DifficultyEstimator._parse_duration(visit_duration) if visit_duration else None
        
        # 如果没有visitDuration，尝试typicalStay
        if hours is None:
            typical_stay = input_data.get('typicalStay')
            if typical_stay:
                # typicalStay映射表（小时）
                typical_stay_map = {
                    '30分钟': 0.5,
                    '1小时': 1.0,
                    '2小时': 2.0,
                    '半天': 4.0,
                    '全天': 8.0,
                }
                hours = typical_stay_map.get(typical_stay)
        
        if hours is None:
            return None
        
        # 根据accessType确定步速（公里/小时）
        access_type = input_data.get('accessType', '').upper()
        category = input_data.get('category', '').upper()
        
        # 步速映射
        pace_map = {
            'WALKING': 4.0,
            'HIKING': 3.5,
            'VEHICLE': 30.0,  # 车辆较快，但通常路线短
            'CABLE_CAR': 5.0,  # 缆车
        }
        
        pace = pace_map.get(access_type)
        if pace is None:
            # 根据类别默认步速
            category_pace = {
                'ATTRACTION': 3.0,
                'RESTAURANT': 0.5,  # 餐厅主要是停留
                'HOTEL': 0.0,  # 酒店不移动
            }
            pace = category_pace.get(category, 3.5)
        
        # 计算距离
        distance = hours * pace
        
        # 根据类别限制范围
        category = input_data.get('category', '').upper()
        if category in ['RESTAURANT', 'HOTEL']:
            distance = min(distance, 3.0)
        else:
            distance = min(distance, 15.0)
        
        # 最小0.2公里，最大不超过类别限制
        return max(0.2, distance)
    
    @staticmethod
    def _default_label_by_category(category: Optional[str]) -> DifficultyLabel:
        """根据类别返回默认难度"""
        if not category:
            return DifficultyLabel.MODERATE
        
        category_upper = category.upper()
        if category_upper in ['RESTAURANT', 'HOTEL', 'SHOPPING']:
            return DifficultyLabel.EASY
        elif category_upper == 'ATTRACTION':
            return DifficultyLabel.MODERATE
        else:
            return DifficultyLabel.MODERATE
    
    @staticmethod
    def _bump_one_level(label: DifficultyLabel) -> DifficultyLabel:
        """将难度等级提升一档"""
        level_map = {
            DifficultyLabel.EASY: DifficultyLabel.MODERATE,
            DifficultyLabel.MODERATE: DifficultyLabel.HARD,
            DifficultyLabel.HARD: DifficultyLabel.EXTREME,
            DifficultyLabel.EXTREME: DifficultyLabel.EXTREME,  # 已经是最高
        }
        return level_map[label]


if __name__ == '__main__':
    # 测试用例
    test_cases = [
        {
            'input': {
                'category': 'ATTRACTION',
                'accessType': 'HIKING',
                'visitDuration': '半天',
                'elevationMeters': 2300,
            },
            'distance_km': None,
            'gain_m': None,
        },
        {
            'input': {
                'category': 'ATTRACTION',
                'accessType': 'HIKING',
            },
            'distance_km': 10.8,
            'gain_m': 720,
            'slope_avg': 0.067,
        },
        {
            'input': {
                'trailDifficulty': 'HARD',
            },
            'distance_km': 5.0,
            'gain_m': 100,
        },
    ]
    
    for i, test in enumerate(test_cases, 1):
        label, S_km, notes = DifficultyEstimator.estimate_difficulty(
            test['input'],
            distance_km=test.get('distance_km'),
            gain_m=test.get('gain_m'),
            slope_avg=test.get('slope_avg'),
        )
        print(f"Test {i}: {label.value}, S_km={S_km}, notes={notes}")

