#!/usr/bin/env python3
"""
格式化世界模型输出
"""

import json
import sys

def format_world_model(data):
    """格式化世界模型输出"""
    if not data.get('success'):
        print("❌ 错误:", data.get('error', {}).get('message', 'Unknown error'))
        return
    
    world = data['data']['world']
    missing = data['data'].get('missingPieces', {})
    
    # 标题
    print("\n" + "=" * 70)
    print("✅ 世界模型构建成功")
    print("=" * 70 + "\n")
    
    # PhysicalRealityModel
    print("━" * 70)
    print("📊 PhysicalRealityModel（物理现实模型）")
    print("━" * 70)
    physical = world['physical']
    print(f"  国家代码: {physical['countryCode']}")
    print(f"  月份: {physical['month']} ({'F路开放季节' if physical['month'] >= 6 and physical['month'] <= 9 else '可能关闭'})")
    print(f"  DEM 证据数量: {len(physical['demEvidence'])}")
    print(f"  道路状态数量: {len(physical['roadStates'])}")
    print(f"  危险区域数量: {len(physical['hazardZones'])}")
    print(f"  渡轮状态数量: {len(physical['ferryStates'])}")
    
    if physical['demEvidence']:
        dem = physical['demEvidence'][0]
        print(f"\n  DEM 证据:")
        print(f"    Segment ID: {dem['segmentId']}")
        print(f"    违规级别: {dem['violation']}")
        print(f"    说明: {dem['explanation']}")
    
    print()
    
    # HumanCapabilityModel
    print("━" * 70)
    print("👤 HumanCapabilityModel（人体能力模型）")
    print("━" * 70)
    human = world['human']
    print(f"  用户画像 ID: {human['profileId']}")
    print(f"  单日最大爬升: {human['maxDailyAscentM']}m")
    print(f"  连续3天滚动爬升阈值: {human['rollingAscent3DaysM']}m")
    print(f"  最大可接受坡度: {human['maxSlopePct']}%")
    print(f"  节奏偏好: {human['preferredPace']}")
    print(f"  风险承受度: {human['riskTolerance']}")
    print(f"  高海拔经验: {human['highAltitudeExperience']}")
    print(f"  最大海拔: {human.get('maxElevationM', 'N/A')}m")
    print()
    
    # RouteDirection
    print("━" * 70)
    print("🗺️  RouteDirection（路线方向）")
    print("━" * 70)
    route = world['routeDirection']
    print(f"  路线名称: {route['nameCN']} ({route['nameEN']})")
    print(f"  国家代码: {route['countryCode']}")
    print(f"  描述: {route['description']}")
    print(f"  标签: {', '.join(route['tags'])}")
    
    if route.get('seasonality', {}).get('seasonal_considerations'):
        season = route['seasonality']['seasonal_considerations']
        print(f"\n  季节性信息:")
        print(f"    最佳季节: {season.get('best_season', 'N/A')}")
        print(f"    可能季节: {season.get('possible_season', 'N/A')}")
        print(f"    冬季状态: {season.get('winter_status', 'N/A')}")
    
    if route.get('constraints'):
        constraints = route['constraints']
        print(f"\n  约束条件:")
        print(f"    难度级别: {constraints.get('difficulty_level', 'N/A')}")
        print(f"    推荐车辆: {constraints.get('suitable_vehicle', 'N/A')}")
        print(f"    总距离: {constraints.get('total_distance_km', 'N/A')}km")
        print(f"    建议天数: {constraints.get('duration_days', 'N/A')}天")
    
    print()
    
    # Missing Pieces
    print("━" * 70)
    print("⚠️  缺失数据")
    print("━" * 70)
    if missing:
        for key, value in missing.items():
            if value:
                print(f"  - {key}: {value}")
    else:
        print("  ✅ 所有数据完整")
    
    print("\n" + "=" * 70 + "\n")

if __name__ == '__main__':
    try:
        data = json.load(sys.stdin)
        format_world_model(data)
    except json.JSONDecodeError as e:
        print(f"❌ JSON 解析错误: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"❌ 错误: {e}", file=sys.stderr)
        sys.exit(1)
