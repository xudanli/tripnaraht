/**
 * 直接调用 RapidAPI Booking.com 租车接口，输出原始响应用于调试
 *
 * 用法: npx ts-node scripts/debug-booking-com-rapidapi.ts
 * 需要: RAPIDAPI_BOOKING_COM_API_KEY 在 .env 中
 */

import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const API_KEY = process.env.RAPIDAPI_BOOKING_COM_API_KEY?.trim();
const HOST = process.env.RAPIDAPI_BOOKING_COM_HOST || 'booking-com15.p.rapidapi.com';

if (!API_KEY) {
  console.error('❌ RAPIDAPI_BOOKING_COM_API_KEY 未配置');
  process.exit(1);
}

// 使用近期日期（部分 API 对远期日期支持有限）
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 3);
const dayAfter = new Date();
dayAfter.setDate(dayAfter.getDate() + 4);
const pickDate = tomorrow.toISOString().split('T')[0];
const dropDate = dayAfter.toISOString().split('T')[0];

const paramsGet = {
  pick_up_latitude: 40.71,
  pick_up_longitude: -74.0,
  drop_off_latitude: 40.71,
  drop_off_longitude: -74.0,
  pick_up_time: '10:00',
  drop_off_time: '10:00',
  driver_age: 25,
  pick_up_date: pickDate,
  drop_off_date: dropDate,
  location: 'US',
};

// 尝试 ISO 8601 格式 (Booking.com 官方推荐)
const paramsPost = {
  pick_up_latitude: 40.71,
  pick_up_longitude: -74.0,
  drop_off_latitude: 40.71,
  drop_off_longitude: -74.0,
  pick_up_datetime: '2026-02-23T10:00:00',
  drop_off_datetime: '2026-02-24T10:00:00',
  driver_age: 25,
  location: 'US',
};

async function callApi(method: 'GET' | 'POST', params: Record<string, any>, label: string) {
  console.log(`\n--- ${label} ---`);
  console.log('Method:', method);
  console.log('Params:', JSON.stringify(params, null, 2));

  const config: any = {
    headers: {
      'x-rapidapi-host': HOST,
      'x-rapidapi-key': API_KEY,
      ...(method === 'POST' && { 'Content-Type': 'application/json' }),
    },
    timeout: 15000,
    validateStatus: () => true,
  };

  const url = `https://${HOST}/api/v1/cars/searchCarRentals`;
  const res =
    method === 'GET'
      ? await axios.get(url, { ...config, params })
      : await axios.post(url, params, config);

  return res;
}

async function main() {
  console.log('🔍 直接调用 RapidAPI booking-com15...');
  console.log('URL: https://' + HOST + '/api/v1/cars/searchCarRentals');

  try {
    // 1. 当前 GET 方式
    const res = await callApi('GET', paramsGet, '1. GET (当前方式)');

    function logRes(r: any) {
      console.log('Status:', r.status);
      console.log('Body:', JSON.stringify(r.data, null, 2));
      if (r.data?.status === false) {
        console.log('⚠️ API 返回 status:false，上游服务异常');
      } else if (Array.isArray(r.data?.data)) {
        console.log('✅ 成功，结果数:', r.data.data.length);
      }
    }
    logRes(res);

    // 2. 尝试 POST + 不同参数
    const res2 = await callApi('POST', paramsPost, '2. POST + datetime 格式');
    logRes(res2);

    // 3. 尝试 POST + 原始参数
    const res3 = await callApi('POST', paramsGet, '3. POST + 原始参数');
    logRes(res3);

    // 4. 洛杉矶机场坐标（租车热门地点）
    const laxParams = { ...paramsGet, pick_up_latitude: 33.9425, pick_up_longitude: -118.4081, drop_off_latitude: 33.9425, drop_off_longitude: -118.4081 };
    const res4 = await callApi('GET', laxParams, '4. GET 洛杉矶机场');
    logRes(res4);

    // 5. Search Car Rentals 使用 Playground 默认坐标（JFK 机场）
    const jfkParams = {
      pick_up_latitude: 40.6397018432617,
      pick_up_longitude: -73.7791976928711,
      drop_off_latitude: 40.6397018432617,
      drop_off_longitude: -73.7791976928711,
      pick_up_time: '10:00',
      drop_off_time: '10:00',
      driver_age: 30,
      pick_up_date: pickDate,
      drop_off_date: dropDate,
      currency_code: 'USD',
      location: 'US',
    };
    const res5 = await axios.get(`https://${HOST}/api/v1/cars/searchCarRentals`, {
      params: jfkParams,
      headers: { 'x-rapidapi-host': HOST, 'x-rapidapi-key': API_KEY! },
      timeout: 15000,
      validateStatus: () => true,
    });
    console.log('\n--- 5. GET Search Car Rentals（Playground 默认 JFK 坐标）---');
    console.log('Status:', res5.status, 'Body:', JSON.stringify(res5.data, null, 2));
    if (res5.data?.status === true) console.log('✅ 成功');

    // 6. Search Car Location（获取 Booking.com 认可的坐标）
    console.log('\n--- 6. Search Car Location (searchDestination) ---');
    for (const q of ['New York', 'JFK', 'Reykjavik']) {
      const r = await axios.get(`https://${HOST}/api/v1/cars/searchDestination`, {
        params: { query: q },
        headers: { 'x-rapidapi-host': HOST, 'x-rapidapi-key': API_KEY! },
        timeout: 15000,
        validateStatus: () => true,
      });
      console.log(`  query="${q}": status=${r.status}, data.length=${Array.isArray(r.data?.data) ? r.data.data.length : 'N/A'}`);
      if (r.data?.data?.[0]) {
        const loc = r.data.data[0];
        const lat = loc.coordinates?.latitude ?? loc.latitude;
        const lng = loc.coordinates?.longitude ?? loc.longitude;
        console.log(`    首条: lat=${lat}, lng=${lng}`);
      }
    }

    // 7. 若 Search Car Location 有结果，用其坐标调用 Search Car Rentals
    const locRes = await axios.get(`https://${HOST}/api/v1/cars/searchDestination`, {
      params: { query: 'New York' },
      headers: { 'x-rapidapi-host': HOST, 'x-rapidapi-key': API_KEY! },
      timeout: 15000,
      validateStatus: () => true,
    });
    const locs = locRes.data?.data;
    if (Array.isArray(locs) && locs.length > 0) {
      const first = locs[0];
      const lat = first.coordinates?.latitude ?? first.latitude;
      const lng = first.coordinates?.longitude ?? first.longitude;
      if (lat != null && lng != null) {
        console.log('\n--- 7. Search Car Rentals（使用 Search Car Location 坐标）---');
        const rentalParams = {
          pick_up_latitude: lat,
          pick_up_longitude: lng,
          drop_off_latitude: lat,
          drop_off_longitude: lng,
          pick_up_time: '10:00',
          drop_off_time: '10:00',
          driver_age: 30,
          pick_up_date: pickDate,
          drop_off_date: dropDate,
          currency_code: 'USD',
          location: 'US',
        };
        const r6 = await axios.get(`https://${HOST}/api/v1/cars/searchCarRentals`, {
          params: rentalParams,
          headers: { 'x-rapidapi-host': HOST, 'x-rapidapi-key': API_KEY! },
          timeout: 15000,
          validateStatus: () => true,
        });
        console.log('Status:', r6.status);
        console.log('Body:', JSON.stringify(r6.data, null, 2));
        if (r6.data?.status === true && Array.isArray(r6.data?.data)) {
          console.log('✅ 两段式流程成功，租车结果数:', r6.data.data.length);
        }
      }
    }
  } catch (e: any) {
    console.error('请求失败:', e.message);
    if (e.response) {
      console.error('Status:', e.response.status);
      console.error('Data:', JSON.stringify(e.response.data, null, 2));
    }
  }
}

main();
