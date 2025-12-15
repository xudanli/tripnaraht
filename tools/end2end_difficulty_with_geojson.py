#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
端到端路线难度评估脚本

功能：
1. 从 Google Maps 或 Mapbox 获取路线
2. 对路线进行等距重采样
3. 获取高程数据（Google Elevation API 或 Mapbox Terrain-RGB）
4. 计算距离、累计爬升、平均坡度
5. 评估难度等级
6. 导出 GeoJSON

使用方法：
    python tools/end2end_difficulty_with_geojson.py \
        --provider google \
        --origin "39.9042,116.4074" \
        --destination "39.914,116.403" \
        --profile walking \
        --sample-m 30 \
        --category ATTRACTION \
        --accessType HIKING \
        --elevationMeters 2300 \
        --out test_google.geojson
"""

import os
import sys
import argparse
import json
import requests
import time
import math
from typing import List, Tuple, Optional, Dict, Any
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    print("Warning: PIL not installed, Mapbox Terrain-RGB support will be limited")

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.trail_difficulty import DifficultyEstimator, DifficultyLabel


# ============================================================================
# 辅助函数：Haversine 距离计算、Polyline 编解码
# ============================================================================

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    计算两点间的距离（Haversine 公式）
    
    Args:
        lat1, lon1: 起点经纬度
        lat2, lon2: 终点经纬度
    
    Returns:
        距离（米）
    """
    R = 6371000  # 地球半径（米）
    
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    a = (
        math.sin(delta_phi / 2) ** 2 +
        math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c


def decode_polyline(polyline: str) -> List[Tuple[float, float]]:
    """
    解码 Google Polyline 编码
    
    Args:
        polyline: 编码后的 polyline 字符串
    
    Returns:
        [(lat, lon), ...] 坐标列表
    """
    coords = []
    index = 0
    lat = 0
    lon = 0
    
    while index < len(polyline):
        # 解码纬度
        shift = 0
        result = 0
        while True:
            byte = ord(polyline[index]) - 63
            index += 1
            result |= (byte & 0x1f) << shift
            shift += 5
            if byte < 0x20:
                break
        dlat = ~(result >> 1) if (result & 1) else (result >> 1)
        lat += dlat
        
        # 解码经度
        shift = 0
        result = 0
        while True:
            byte = ord(polyline[index]) - 63
            index += 1
            result |= (byte & 0x1f) << shift
            shift += 5
            if byte < 0x20:
                break
        dlon = ~(result >> 1) if (result & 1) else (result >> 1)
        lon += dlon
        
        coords.append((lat / 1e5, lon / 1e5))
    
    return coords


def encode_polyline(coords: List[Tuple[float, float]]) -> str:
    """
    编码坐标列表为 Google Polyline
    
    Args:
        coords: [(lat, lon), ...] 坐标列表
    
    Returns:
        编码后的 polyline 字符串
    """
    def encode_value(value: float) -> str:
        value = int(round(value * 1e5))
        value = ~(value << 1) if value < 0 else (value << 1)
        chunks = []
        while value >= 0x20:
            chunks.append(chr((0x20 | (value & 0x1f)) + 63))
            value >>= 5
        chunks.append(chr(value + 63))
        return ''.join(chunks)
    
    if not coords:
        return ""
    
    result = []
    prev_lat = 0
    prev_lon = 0
    
    for lat, lon in coords:
        dlat = int(round((lat - prev_lat) * 1e5))
        dlon = int(round((lon - prev_lon) * 1e5))
        result.append(encode_value(dlat))
        result.append(encode_value(dlon))
        prev_lat = lat
        prev_lon = lon
    
    return ''.join(result)


# ============================================================================
# 路线获取：Google Maps / Mapbox Directions API
# ============================================================================

def get_route_google(
    api_key: str,
    origin: str,
    destination: str,
    profile: str = "walking",
    timeout: int = 10,
    max_retries: int = 2,
) -> Tuple[List[Tuple[float, float]], float]:
    """
    从 Google Routes API (v2) 获取路线
    
    注意：此函数使用新版 Routes API，需要：
    1. 在 Google Cloud Console 启用 Routes API
    2. 项目需要启用计费
    3. 使用有效的 API Key
    
    Args:
        api_key: Google Maps API Key
        origin: 起点坐标 "lat,lon"
        destination: 终点坐标 "lat,lon"
        profile: 路线模式（walking, driving, bicycling, transit）
        timeout: 请求超时（秒）
        max_retries: 最大重试次数
    
    Returns:
        (coords, distance_m)
        - coords: [(lat, lon), ...] 坐标列表
        - distance_m: 路线距离（米）
    """
    # 解析坐标
    lat1, lng1 = map(float, origin.split(","))
    lat2, lng2 = map(float, destination.split(","))
    
    # 映射路线模式
    mode_map = {
        "walking": "WALK",
        "driving": "DRIVE",
        "bicycling": "BICYCLE",
        "transit": "TRANSIT",
    }
    travel_mode = mode_map.get(profile, "WALK")
    
    # 新版 Routes API 端点
    url = "https://routes.googleapis.com/directions/v2:computeRoutes"
    
    # 请求头
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key or os.getenv("GOOGLE_MAPS_API_KEY", ""),
        "X-Goog-FieldMask": "routes.distanceMeters,routes.polyline.encodedPolyline",
    }
    
    # 请求体
    payload = {
        "origin": {
            "location": {
                "latLng": {
                    "latitude": lat1,
                    "longitude": lng1,
                }
            }
        },
        "destination": {
            "location": {
                "latLng": {
                    "latitude": lat2,
                    "longitude": lng2,
                }
            }
        },
        "travelMode": travel_mode,
        "computeAlternativeRoutes": False,
        "units": "METRIC",
    }
    
    for attempt in range(max_retries + 1):
        try:
            response = requests.post(
                url,
                headers=headers,
                data=json.dumps(payload),
                timeout=timeout
            )
            # 检查HTTP状态码
            if response.status_code != 200:
                try:
                    data = response.json()
                    error_msg = data.get("error", {}).get("message", f"HTTP {response.status_code}")
                except:
                    error_msg = f"HTTP {response.status_code}: {response.text[:200]}"
                raise Exception(f"Google Routes API error: {response.status_code} - {error_msg}")
            
            data = response.json()
            
            # 检查是否有错误响应（新Routes API格式）
            if "error" in data:
                error_info = data["error"]
                error_code = error_info.get("code", "UNKNOWN")
                error_message = error_info.get("message", "Unknown error")
                raise Exception(f"Google Routes API error: {error_code} - {error_message}")
            
            # 检查旧版Directions API错误格式（兼容性检查）
            if "status" in data and data.get("status") != "OK":
                status = data.get("status", "UNKNOWN")
                error_message = data.get("error_message", "")
                raise Exception(f"Google Directions API error: {status} - {error_message}")
            
            if "routes" not in data or not data["routes"]:
                raise Exception(f"Google Routes API error: No routes found in response - {data}")
            
            route = data["routes"][0]
            distance_m = route.get("distanceMeters", 0)
            
            # 获取 polyline
            polyline_data = route.get("polyline", {})
            encoded_polyline = polyline_data.get("encodedPolyline", "")
            
            if not encoded_polyline:
                raise Exception(f"Google Routes API error: No polyline in response - {data}")
            
            # 解码 polyline
            coords = decode_polyline(encoded_polyline)
            
            return coords, distance_m
            
        except requests.exceptions.Timeout:
            if attempt < max_retries:
                time.sleep(2 ** attempt)  # 指数退避
                continue
            raise
        except requests.exceptions.RequestException as e:
            if attempt < max_retries:
                time.sleep(2 ** attempt)
                continue
            raise
        except Exception as e:
            raise


def get_route_mapbox(
    access_token: str,
    origin: str,
    destination: str,
    profile: str = "walking",
    timeout: int = 10,
    max_retries: int = 2,
) -> Tuple[List[Tuple[float, float]], float]:
    """
    从 Mapbox Directions API 获取路线
    
    Args:
        access_token: Mapbox Access Token
        origin: 起点坐标 "lon,lat"（注意：Mapbox 使用 lon,lat 顺序）
        destination: 终点坐标 "lon,lat"
        profile: 路线模式（walking, driving, cycling）
        timeout: 请求超时（秒）
        max_retries: 最大重试次数
    
    Returns:
        (coords, distance_m)
        - coords: [(lat, lon), ...] 坐标列表（转换为标准 lat,lon 顺序）
        - distance_m: 路线距离（米）
    """
    # Mapbox 使用 lon,lat 顺序
    origin_parts = origin.split(",")
    dest_parts = destination.split(",")
    if len(origin_parts) == 2 and len(dest_parts) == 2:
        # 如果输入是 lat,lon，转换为 lon,lat
        try:
            lat1, lon1 = float(origin_parts[0]), float(origin_parts[1])
            lat2, lon2 = float(dest_parts[0]), float(dest_parts[1])
            origin_coords = f"{lon1},{lat1}"
            dest_coords = f"{lon2},{lat2}"
        except ValueError:
            # 已经是 lon,lat 格式
            origin_coords = origin
            dest_coords = destination
    else:
        origin_coords = origin
        dest_coords = destination
    
    url = f"https://api.mapbox.com/directions/v5/mapbox/{profile}/{origin_coords};{dest_coords}"
    
    params = {
        "access_token": access_token,
        "geometries": "polyline",
        "steps": "false",
    }
    
    for attempt in range(max_retries + 1):
        try:
            response = requests.get(url, params=params, timeout=timeout)
            response.raise_for_status()
            data = response.json()
            
            if data.get("code") != "Ok":
                raise Exception(f"Mapbox Directions API error: {data.get('code')} - {data.get('message', '')}")
            
            route = data["routes"][0]
            distance_m = route["distance"]
            
            # 解码 polyline（Mapbox 使用标准 polyline6）
            geometry = route["geometry"]
            coords_raw = decode_polyline(geometry)
            # Mapbox 返回的是 lon,lat，需要转换为 lat,lon
            coords = [(lat, lon) for lon, lat in coords_raw]
            
            return coords, distance_m
            
        except requests.exceptions.Timeout:
            if attempt < max_retries:
                time.sleep(2 ** attempt)
                continue
            raise
        except requests.exceptions.RequestException as e:
            if attempt < max_retries:
                time.sleep(2 ** attempt)
                continue
            raise
        except Exception as e:
            raise



# ============================================================================
# 路线等距重采样
# ============================================================================

def resample_path(
    coords: List[Tuple[float, float]],
    step_m: float = 30.0
) -> List[Tuple[float, float]]:
    """
    对路线进行等距重采样
    
    Args:
        coords: 原始坐标列表 [(lat, lon), ...]
        step_m: 采样间隔（米）
    
    Returns:
        重采样后的坐标列表
    """
    if len(coords) < 2:
        return coords
    
    resampled = [coords[0]]  # 保留起点
    carry = coords[0]
    acc = 0.0
    
    for next_coord in coords[1:]:
        seg_dist = haversine_distance(carry[0], carry[1], next_coord[0], next_coord[1])
        
        while acc + seg_dist >= step_m:
            # 计算插值点
            t = (step_m - acc) / seg_dist if seg_dist > 0 else 1.0
            # 线性插值
            lat = carry[0] + t * (next_coord[0] - carry[0])
            lon = carry[1] + t * (next_coord[1] - carry[1])
            resampled.append((lat, lon))
            
            # 更新 carry 和剩余距离
            carry = (lat, lon)
            seg_dist = haversine_distance(carry[0], carry[1], next_coord[0], next_coord[1])
            acc = 0.0
        
        acc += seg_dist
        carry = next_coord
    
    # 确保包含终点
    if resampled[-1] != coords[-1]:
        resampled.append(coords[-1])
    
    return resampled


# ============================================================================
# 高程采样：Google Elevation API
# ============================================================================

def sample_elevation_google(
    api_key: str,
    coords: List[Tuple[float, float]],
    timeout: int = 20,
    max_retries: int = 2,
) -> List[float]:
    """
    从 Google Elevation API 获取高程数据
    
    Args:
        api_key: Google Maps API Key
        coords: 坐标列表 [(lat, lon), ...]
        timeout: 请求超时（秒）
        max_retries: 最大重试次数
    
    Returns:
        高程列表（米）
    """
    url = "https://maps.googleapis.com/maps/api/elevation/json"
    
    # 编码 polyline（Google 支持路径采样）
    encoded = encode_polyline(coords)
    
    params = {
        "path": f"enc:{encoded}",
        "samples": len(coords),
        "key": api_key,
    }
    
    for attempt in range(max_retries + 1):
        try:
            response = requests.get(url, params=params, timeout=timeout)
            response.raise_for_status()
            data = response.json()
            
            if data.get("status") != "OK":
                status = data.get("status", "UNKNOWN")
                error_message = data.get("error_message", "")
                
                # 提供更详细的错误信息
                if status == "REQUEST_DENIED":
                    full_error = (
                        f"Google Elevation API error: {status} - {error_message}\n"
                        f"Please ensure that:\n"
                        f"1. Elevation API is enabled in Google Cloud Console\n"
                        f"2. Your API key has the necessary permissions\n"
                        f"3. Billing is enabled for your Google Cloud project\n"
                        f"Alternatively, you can use Mapbox provider with --provider mapbox"
                    )
                else:
                    full_error = f"Google Elevation API error: {status} - {error_message}"
                
                raise Exception(full_error)
            
            elevations = [result["elevation"] for result in data["results"]]
            return elevations
            
        except requests.exceptions.Timeout:
            if attempt < max_retries:
                time.sleep(2 ** attempt)
                continue
            raise
        except requests.exceptions.RequestException as e:
            if attempt < max_retries:
                time.sleep(2 ** attempt)
                continue
            raise
        except Exception as e:
            raise



# ============================================================================
# 高程采样：Mapbox Terrain-RGB
# ============================================================================

def latlon_to_tile(lat: float, lon: float, z: int) -> Tuple[int, int, int, int, int]:
    """
    将经纬度转换为瓦片坐标和像素坐标
    
    Args:
        lat: 纬度
        lon: 经度
        z: 缩放级别
    
    Returns:
        (x, y, z, px, py)
        - x, y, z: 瓦片坐标
        - px, py: 瓦片内的像素坐标（0-512，@2x 分辨率）
    """
    n = 2.0 ** z
    x_tile = int((lon + 180.0) / 360.0 * n)
    lat_rad = math.radians(lat)
    y_tile = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    
    # 计算像素坐标（@2x = 512x512）
    lon_per_tile = 360.0 / n
    lat_per_tile = 180.0 / n
    
    lon_in_tile = lon - (x_tile / n * 360.0 - 180.0)
    lat_in_tile = lat - (math.degrees(2 * math.atan(math.exp(math.pi * (1 - 2 * y_tile / n))) - math.pi / 2))
    
    px = int((lon_in_tile / lon_per_tile) * 512)
    py = int((lat_in_tile / lat_per_tile) * 512)
    
    return x_tile, y_tile, z, px, py


def download_terrain_tile(access_token: str, x: int, y: int, z: int, timeout: int = 15) -> Optional[Image.Image]:
    """
    下载 Mapbox Terrain-RGB 瓦片
    
    Args:
        access_token: Mapbox Access Token
        x, y, z: 瓦片坐标
        timeout: 请求超时（秒）
    
    Returns:
        PIL Image 对象（512x512 RGB）
    """
    if not HAS_PIL:
        raise ImportError("PIL/Pillow is required for Mapbox Terrain-RGB support")
    
    url = f"https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}@2x.pngraw"
    
    params = {"access_token": access_token}
    
    try:
        response = requests.get(url, params=params, timeout=timeout)
        response.raise_for_status()
        img = Image.open(BytesIO(response.content))
        return img
    except Exception as e:
        print(f"Warning: Failed to download tile {z}/{x}/{y}: {e}")
        return None


def elev_from_terrain_rgb(r: int, g: int, b: int) -> float:
    """
    从 Terrain-RGB 像素值计算高程（米）
    
    Formula: -10000 + ((R * 256 * 256 + G * 256 + B) * 0.1)
    
    Args:
        r, g, b: RGB 值（0-255）
    
    Returns:
        高程（米）
    """
    return -10000.0 + ((r * 256 * 256 + g * 256 + b) * 0.1)


def bilinear_sample(img: Image.Image, px: int, py: int) -> float:
    """
    双线性插值采样高程
    
    Args:
        img: PIL Image 对象
        px, py: 像素坐标（0-512）
    
    Returns:
        高程（米）
    """
    px = max(0, min(px, img.width - 1))
    py = max(0, min(py, img.height - 1))
    
    x0, y0 = int(px), int(py)
    x1, y1 = min(x0 + 1, img.width - 1), min(y0 + 1, img.height - 1)
    
    fx = px - x0
    fy = py - y0
    
    # 获取四个角的高程
    r00, g00, b00 = img.getpixel((x0, y0))[:3]
    r10, g10, b10 = img.getpixel((x1, y0))[:3]
    r01, g01, b01 = img.getpixel((x0, y1))[:3]
    r11, g11, b11 = img.getpixel((x1, y1))[:3]
    
    e00 = elev_from_terrain_rgb(r00, g00, b00)
    e10 = elev_from_terrain_rgb(r10, g10, b10)
    e01 = elev_from_terrain_rgb(r01, g01, b01)
    e11 = elev_from_terrain_rgb(r11, g11, b11)
    
    # 双线性插值
    e0 = e00 * (1 - fx) + e10 * fx
    e1 = e01 * (1 - fx) + e11 * fx
    elev = e0 * (1 - fy) + e1 * fy
    
    return elev


def sample_elevation_mapbox(
    access_token: str,
    coords: List[Tuple[float, float]],
    z: int = 14,
    workers: int = 8,
    timeout: int = 15,
) -> List[float]:
    """
    从 Mapbox Terrain-RGB 获取高程数据（带并发下载）
    
    Args:
        access_token: Mapbox Access Token
        coords: 坐标列表 [(lat, lon), ...]
        z: 缩放级别（默认14，长路线可用13提速）
        workers: 并发下载线程数
        timeout: 单个瓦片下载超时（秒）
    
    Returns:
        高程列表（米）
    """
    if not HAS_PIL:
        raise ImportError("PIL/Pillow is required for Mapbox Terrain-RGB support")
    
    # 收集需要的瓦片
    tiles_needed = {}
    coord_tile_info = []
    
    for lat, lon in coords:
        x, y, z, px, py = latlon_to_tile(lat, lon, z)
        tile_key = (x, y, z)
        tiles_needed[tile_key] = None  # 占位
        coord_tile_info.append((lat, lon, tile_key, px, py))
    
    # 并发下载瓦片
    def download_tile(tile_key):
        x, y, z = tile_key
        return tile_key, download_terrain_tile(access_token, x, y, z, timeout)
    
    tiles = {}
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(download_tile, tile_key): tile_key for tile_key in tiles_needed.keys()}
        for future in as_completed(futures):
            tile_key, img = future.result()
            if img:
                tiles[tile_key] = img
    
    # 采样高程
    elevations = []
    for lat, lon, tile_key, px, py in coord_tile_info:
        if tile_key in tiles:
            elev = bilinear_sample(tiles[tile_key], px, py)
            elevations.append(elev)
        else:
            # 瓦片下载失败，使用默认值0
            elevations.append(0.0)
            print(f"Warning: No tile data for ({lat}, {lon}), using elevation 0")
    
    return elevations



# ============================================================================
# 距离与累计爬升计算
# ============================================================================

def moving_average(values: List[float], win: int = 5) -> List[float]:
    """5点滑动平均去噪"""
    if len(values) < win:
        return values
    
    smoothed = []
    for i in range(len(values)):
        start = max(0, i - win // 2)
        end = min(len(values), i + win // 2 + 1)
        avg = sum(values[start:end]) / (end - start)
        smoothed.append(avg)
    
    return smoothed


def calc_metrics(
    coords_raw: List[Tuple[float, float]],
    coords_resampled: List[Tuple[float, float]],
    elevations: List[float],
) -> Tuple[float, float, float]:
    """
    计算距离、累计爬升、平均坡度
    
    Args:
        coords_raw: 原始路线坐标
        coords_resampled: 重采样后的坐标
        elevations: 高程列表（米）
    
    Returns:
        (distance_km, gain_m, slope_avg)
        - distance_km: 几何距离（公里）
        - gain_m: 累计爬升（米）
        - slope_avg: 平均坡度（0-1之间的小数）
    """
    # 计算几何距离
    distance_m = 0.0
    for i in range(len(coords_raw) - 1):
        distance_m += haversine_distance(
            coords_raw[i][0], coords_raw[i][1],
            coords_raw[i+1][0], coords_raw[i+1][1]
        )
    distance_km = distance_m / 1000.0
    
    # 去噪：5点滑窗 + 3m阈值
    elev_smoothed = moving_average(elevations, win=5)
    
    # 累计爬升（只统计上升，且变化>3m）
    gain_m = 0.0
    for i in range(len(elev_smoothed) - 1):
        diff = elev_smoothed[i+1] - elev_smoothed[i]
        if diff > 3.0:  # 只统计上升，且变化>3m
            gain_m += diff
    
    # 平均坡度
    slope_avg = gain_m / (distance_m) if distance_m > 0 else 0.0
    
    return distance_km, gain_m, slope_avg


# ============================================================================
# 端到端编排
# ============================================================================

def end2end(
    provider: str,
    origin: str,
    destination: str,
    profile: str,
    sample_m: float,
    api_key_or_token: str,
    meta: Dict[str, Any],
    z: int = 14,
    workers: int = 8,
) -> Dict[str, Any]:
    """
    端到端执行：路线→高程→难度
    
    Args:
        provider: "google" 或 "mapbox"
        origin: 起点坐标
        destination: 终点坐标
        profile: 路线模式（walking, driving等）
        sample_m: 采样间隔（米）
        api_key_or_token: API密钥或Token
        meta: 元数据字典（category, accessType等）
        z: Mapbox缩放级别（仅Mapbox使用）
        workers: Mapbox并发线程数（仅Mapbox使用）
    
    Returns:
        结果字典，包含 distance_km, elevation_gain_m, slope_avg, label, S_km, notes, geojson
    """
    # 1. 获取路线
    if provider.lower() == "google":
        coords_raw, distance_api_m = get_route_google(
            api_key_or_token, origin, destination, profile
        )
    elif provider.lower() == "mapbox":
        coords_raw, distance_api_m = get_route_mapbox(
            api_key_or_token, origin, destination, profile
        )
    else:
        raise ValueError(f"Unknown provider: {provider}")
    
    if len(coords_raw) < 2:
        # 路径太短，返回默认值
        return {
            "distance_km": 0.0,
            "elevation_gain_m": 0.0,
            "slope_avg": 0.0,
            "label": "EASY",
            "S_km": 0.0,
            "notes": ["short segment"],
            "geojson": None,
        }
    
    # 2. 重采样
    coords = resample_path(coords_raw, sample_m)
    
    # 3. 获取高程
    elevations = None
    if provider.lower() == "google":
        try:
            elevations = sample_elevation_google(api_key_or_token, coords)
        except Exception as e:
            # 如果 Google Elevation API 失败，尝试使用 Mapbox 作为回退
            mapbox_token = os.getenv("MAPBOX_ACCESS_TOKEN")
            if mapbox_token and HAS_PIL:
                print(f"Warning: Google Elevation API failed: {e}", file=sys.stderr)
                print("Falling back to Mapbox Terrain-RGB for elevation data...", file=sys.stderr)
                try:
                    elevations = sample_elevation_mapbox(mapbox_token, coords, z=z, workers=workers)
                except Exception as e2:
                    print(f"Warning: Mapbox fallback also failed: {e2}", file=sys.stderr)
                    raise e  # 抛出原始 Google API 错误
            else:
                raise  # 没有 Mapbox token 或 PIL，抛出原始错误
    elif provider.lower() == "mapbox":
        elevations = sample_elevation_mapbox(api_key_or_token, coords, z=z, workers=workers)
    else:
        elevations = [0.0] * len(coords)
    
    # 如果仍然没有高程数据，使用默认值
    if elevations is None:
        elevations = [0.0] * len(coords)
    
    # 4. 计算指标
    distance_km, gain_m, slope_avg = calc_metrics(coords_raw, coords, elevations)
    
    # 5. 评估难度
    max_elev_m = max(elevations) if elevations else meta.get('elevationMeters')
    label, S_km, notes = DifficultyEstimator.estimate_difficulty(
        meta,
        distance_km=distance_km,
        gain_m=gain_m,
        max_elev_m=max_elev_m,
        slope_avg=slope_avg,
    )
    
    # 6. 生成GeoJSON（可选）
    geojson = make_geojson(coords, elevations, distance_km, gain_m, label.value)
    
    return {
        "distance_km": round(distance_km, 3),
        "elevation_gain_m": round(gain_m, 1),
        "slope_avg": round(slope_avg, 4),
        "label": label.value,
        "S_km": S_km,
        "notes": notes,
        "geojson": geojson,
    }


def make_geojson(
    coords: List[Tuple[float, float]],
    elevations: List[float],
    distance_km: float,
    gain_m: float,
    label: str,
) -> Dict[str, Any]:
    """
    生成GeoJSON FeatureCollection
    
    Args:
        coords: 坐标列表
        elevations: 高程列表
        distance_km: 距离（公里）
        gain_m: 累计爬升（米）
        label: 难度标签
    
    Returns:
        GeoJSON FeatureCollection 字典
    """
    features = []
    
    # 路线LineString
    if len(coords) >= 2:
        coordinates = [[lon, lat] for lat, lon in coords]  # GeoJSON使用[lon,lat]
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": coordinates,
            },
            "properties": {
                "distance_km": distance_km,
                "elevation_gain_m": gain_m,
                "difficulty_label": label,
            },
        })
    
    # 高程点
    if len(coords) == len(elevations):
        for i, ((lat, lon), elev) in enumerate(zip(coords, elevations)):
            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [lon, lat],
                },
                "properties": {
                    "elevation_m": round(elev, 1),
                    "index": i,
                },
            })
    
    return {
        "type": "FeatureCollection",
        "features": features,
    }



# ============================================================================
# 主函数
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="端到端路线难度评估（路线→高程→难度）"
    )
    
    # 必需参数
    parser.add_argument(
        "--provider",
        type=str,
        required=True,
        choices=["google", "mapbox"],
        help="数据源提供商：google 或 mapbox",
    )
    parser.add_argument(
        "--origin",
        type=str,
        required=True,
        help="起点坐标：'lat,lon' 或 'lon,lat'（Mapbox）",
    )
    parser.add_argument(
        "--destination",
        type=str,
        required=True,
        help="终点坐标：'lat,lon' 或 'lon,lat'（Mapbox）",
    )
    
    # 可选参数
    parser.add_argument(
        "--profile",
        type=str,
        default="walking",
        choices=["walking", "driving", "bicycling", "cycling", "transit"],
        help="路线模式（默认：walking）",
    )
    parser.add_argument(
        "--sample-m",
        type=float,
        default=30.0,
        help="采样间隔（米，默认：30）",
    )
    parser.add_argument(
        "--out",
        type=str,
        help="输出GeoJSON文件路径（可选）",
    )
    
    # 元数据参数
    parser.add_argument(
        "--category",
        type=str,
        help="类别（如 ATTRACTION, RESTAURANT）",
    )
    parser.add_argument(
        "--accessType",
        type=str,
        help="访问方式（如 HIKING, VEHICLE, CABLE_CAR）",
    )
    parser.add_argument(
        "--visitDuration",
        type=str,
        help="访问时长（如 '半天', '2小时', '1天'）",
    )
    parser.add_argument(
        "--typicalStay",
        type=str,
        help="典型停留时间",
    )
    parser.add_argument(
        "--elevationMeters",
        type=float,
        help="海拔（米）",
    )
    parser.add_argument(
        "--subCategory",
        type=str,
        help="子类别（如 glacier, volcano）",
    )
    parser.add_argument(
        "--trailDifficulty",
        type=str,
        choices=["EASY", "MODERATE", "HARD", "EXTREME"],
        help="官方难度评级（最高优先级）",
    )
    
    # Mapbox专用参数
    parser.add_argument(
        "--z",
        type=int,
        default=14,
        help="Mapbox缩放级别（默认：14，长路线可用13提速）",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=8,
        help="Mapbox并发下载线程数（默认：8）",
    )
    
    args = parser.parse_args()
    
    # 获取API密钥
    if args.provider == "google":
        api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
        if not api_key:
            print("Error: GOOGLE_MAPS_API_KEY environment variable not set")
            sys.exit(1)
        api_key_or_token = api_key
    else:  # mapbox
        access_token = os.environ.get("MAPBOX_ACCESS_TOKEN")
        if not access_token:
            print("Error: MAPBOX_ACCESS_TOKEN environment variable not set")
            sys.exit(1)
        api_key_or_token = access_token
    
    # 构建元数据
    meta = {}
    if args.category:
        meta["category"] = args.category
    if args.accessType:
        meta["accessType"] = args.accessType
    if args.visitDuration:
        meta["visitDuration"] = args.visitDuration
    if args.typicalStay:
        meta["typicalStay"] = args.typicalStay
    if args.elevationMeters:
        meta["elevationMeters"] = args.elevationMeters
    if args.subCategory:
        meta["subCategory"] = args.subCategory
    if args.trailDifficulty:
        meta["trailDifficulty"] = args.trailDifficulty
    
    # 执行端到端计算
    try:
        result = end2end(
            provider=args.provider,
            origin=args.origin,
            destination=args.destination,
            profile=args.profile,
            sample_m=args.sample_m,
            api_key_or_token=api_key_or_token,
            meta=meta,
            z=args.z,
            workers=args.workers,
        )
        
        # 打印结果到stderr（便于调试）
        print("\n" + "="*60, file=sys.stderr)
        print("路线难度评估结果", file=sys.stderr)
        print("="*60, file=sys.stderr)
        print(f"距离: {result['distance_km']} km", file=sys.stderr)
        print(f"累计爬升: {result['elevation_gain_m']} m", file=sys.stderr)
        print(f"平均坡度: {result['slope_avg']*100:.2f}%", file=sys.stderr)
        print(f"难度等级: {result['label']}", file=sys.stderr)
        print(f"等效强度距离: {result['S_km']} km", file=sys.stderr)
        if result['notes']:
            print(f"说明: {', '.join(result['notes'])}", file=sys.stderr)
        print("="*60 + "\n", file=sys.stderr)
        
        # 输出JSON到stdout（供API调用解析）
        print(json.dumps(result, ensure_ascii=False))
        
        # 输出GeoJSON到文件（如果指定了--out）
        if args.out and result['geojson']:
            with open(args.out, 'w', encoding='utf-8') as f:
                json.dump(result['geojson'], f, ensure_ascii=False, indent=2)
            print(f"GeoJSON已保存至: {args.out}", file=sys.stderr)
        
        # 输出JSON结果到stdout（最后一行，供API调用解析）
        print(json.dumps(result, ensure_ascii=False))
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

