export declare class LocationDetectorService {
    isInChina(lat: number, lng: number): boolean;
    areBothInChina(fromLat: number, fromLng: number, toLat: number, toLng: number): boolean;
    areBothOverseas(fromLat: number, fromLng: number, toLat: number, toLng: number): boolean;
}
