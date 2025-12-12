// src/places/utils/gpx-parser.util.ts

import { GPXPoint } from './gpx-fatigue-calculator.util';

/**
 * GPX 文件解析器
 * 
 * 从 GPX XML 文件中提取轨迹点数据
 */
export class GPXParser {
  /**
   * 从 GPX XML 字符串解析轨迹点
   * 
   * @param gpxXml GPX XML 字符串
   * @returns 轨迹点数组
   */
  static parse(gpxXml: string): GPXPoint[] {
    // 简单的 XML 解析（生产环境建议使用 xml2js 等库）
    const points: GPXPoint[] = [];
    
    // 使用正则表达式提取 <trkpt> 或 <wpt> 标签
    const pointRegex = /<(?:trkpt|wpt)\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/(?:trkpt|wpt)>/gi;
    let match;
    
    while ((match = pointRegex.exec(gpxXml)) !== null) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      const content = match[3];
      
      // 提取海拔（<ele> 标签）
      const eleMatch = content.match(/<ele>([^<]+)<\/ele>/i);
      const elevation = eleMatch ? parseFloat(eleMatch[1]) : undefined;
      
      // 提取时间（<time> 标签）
      const timeMatch = content.match(/<time>([^<]+)<\/time>/i);
      const time = timeMatch ? new Date(timeMatch[1]) : undefined;
      
      points.push({
        lat,
        lng,
        elevation,
        time,
      });
    }
    
    if (points.length === 0) {
      throw new Error('GPX 文件中未找到轨迹点');
    }
    
    return points;
  }

  /**
   * 从文件路径读取并解析 GPX
   * 
   * @param filePath 文件路径
   * @returns 轨迹点数组
   */
  static async parseFromFile(filePath: string): Promise<GPXPoint[]> {
    const fs = await import('fs/promises');
    const gpxXml = await fs.readFile(filePath, 'utf-8');
    return this.parse(gpxXml);
  }

  /**
   * 从 URL 读取并解析 GPX
   * 
   * @param url GPX 文件 URL
   * @returns 轨迹点数组
   */
  static async parseFromURL(url: string): Promise<GPXPoint[]> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch GPX from ${url}: ${response.statusText}`);
    }
    const gpxXml = await response.text();
    return this.parse(gpxXml);
  }
}
