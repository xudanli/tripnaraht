export interface LatLng {
  lat: number;
  lng: number;
}

/** Google Encoded Polyline Algorithm */
export function encodePolyline(coordinates: LatLng[]): string {
  let encoded = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const coord of coordinates) {
    const lat = Math.round(coord.lat * 1e5);
    const lng = Math.round(coord.lng * 1e5);
    encoded += encodeSignedNumber(lat - prevLat);
    encoded += encodeSignedNumber(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return encoded;
}

/** Decode Google encoded polyline → {lat,lng}[] */
export function decodePolyline(encoded: string, precision = 5): LatLng[] {
  const coordinates: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const factor = Math.pow(10, precision);

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    result = 0;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coordinates.push({ lat: lat / factor, lng: lng / factor });
  }

  return coordinates;
}

function encodeSignedNumber(num: number): string {
  let sgnNum = num << 1;
  if (num < 0) sgnNum = ~sgnNum;
  return encodeNumber(sgnNum);
}

function encodeNumber(num: number): string {
  let encoded = '';
  while (num >= 0x20) {
    encoded += String.fromCharCode((0x20 | (num & 0x1f)) + 63);
    num >>= 5;
  }
  encoded += String.fromCharCode(num + 63);
  return encoded;
}

/** 解析高德 `lng,lat;lng,lat` 折线为坐标数组 */
export function parseAmapPolyline(raw: string): LatLng[] {
  return raw
    .split(';')
    .map((pair) => {
      const [lngStr, latStr] = pair.split(',');
      const lng = Number(lngStr);
      const lat = Number(latStr);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    })
    .filter((c): c is LatLng => c != null);
}

/** 合并多条折线坐标并重新编码（去重相邻点） */
export function concatPolylines(parts: string[], decode: (p: string) => LatLng[]): string {
  const coords: LatLng[] = [];
  for (const part of parts) {
    if (!part.trim()) continue;
    const points = decode(part);
    for (const point of points) {
      const prev = coords.at(-1);
      if (prev && prev.lat === point.lat && prev.lng === point.lng) continue;
      coords.push(point);
    }
  }
  if (coords.length < 2 && coords.length === 1) {
    coords.push(coords[0]!);
  }
  return coords.length >= 2 ? encodePolyline(coords) : '';
}
