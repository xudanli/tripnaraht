import { GPXPoint } from './gpx-fatigue-calculator.util';
export declare class GPXParser {
    static parse(gpxXml: string): GPXPoint[];
    static parseFromFile(filePath: string): Promise<GPXPoint[]>;
    static parseFromURL(url: string): Promise<GPXPoint[]>;
}
