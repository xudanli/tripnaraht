/**
 * 示例：将 TripNara 行程同步到 Google Calendar
 * 
 * 这个示例展示了如何使用 GoogleCalendarMcpClient 将行程同步到用户的 Google Calendar
 */

import { GoogleCalendarMcpClient } from '../google-calendar-client';

interface TripItem {
  placeName: string;
  startTime: string;
  endTime: string;
  description?: string;
  address?: string;
}

interface TripDay {
  date: string;
  items: TripItem[];
}

interface Trip {
  id: string;
  name: string;
  timezone: string;
  days: TripDay[];
}

/**
 * 将行程同步到 Google Calendar
 */
export async function syncTripToGoogleCalendar(trip: Trip): Promise<void> {
  const client = new GoogleCalendarMcpClient();

  try {
    console.log(`🔄 开始同步行程 "${trip.name}" 到 Google Calendar...\n`);
    
    // 连接到 Google Calendar
    await client.connect();

    // 获取主日历 ID（如果需要）
    const calendars = await client.listCalendars();
    const primaryCalendar = calendars.calendars?.find((cal: any) => cal.primary) || calendars.calendars?.[0];
    const calendarId = primaryCalendar?.id || 'primary';

    console.log(`📅 使用日历: ${primaryCalendar?.summary || calendarId}\n`);

    let successCount = 0;
    let errorCount = 0;

    // 为每个行程项创建日历事件
    for (const day of trip.days) {
      for (const item of day.items) {
        try {
          await client.createEvent({
            calendarId,
            summary: `${day.date} - ${item.placeName}`,
            start: {
              dateTime: item.startTime,
              timeZone: trip.timezone,
            },
            end: {
              dateTime: item.endTime,
              timeZone: trip.timezone,
            },
            description: item.description || `行程: ${trip.name}\n地点: ${item.placeName}${item.address ? `\n地址: ${item.address}` : ''}`,
            location: item.address,
          });

          console.log(`✅ 已创建事件: ${item.placeName} (${item.startTime})`);
          successCount++;
        } catch (error) {
          console.error(`❌ 创建事件失败 [${item.placeName}]:`, error);
          errorCount++;
        }
      }
    }

    console.log(`\n📊 同步完成:`);
    console.log(`   ✅ 成功: ${successCount}`);
    console.log(`   ❌ 失败: ${errorCount}`);
    console.log(`   📅 总计: ${successCount + errorCount}`);

  } catch (error) {
    console.error('❌ 同步失败:', error);
    throw error;
  } finally {
    await client.disconnect();
  }
}

/**
 * 示例：检查用户在特定日期的可用时间
 */
export async function checkUserAvailability(date: string, durationMinutes: number = 60): Promise<any> {
  const client = new GoogleCalendarMcpClient();

  try {
    await client.connect();

    const timeMin = `${date}T00:00:00Z`;
    const timeMax = `${date}T23:59:59Z`;

    const freeSlots = await client.findFreeSlots({
      timeMin,
      timeMax,
      durationMinutes,
    });

    return freeSlots;
  } catch (error) {
    console.error('❌ 检查可用时间失败:', error);
    throw error;
  } finally {
    await client.disconnect();
  }
}

/**
 * 示例：更新行程事件（当行程变更时）
 */
export async function updateTripEvent(
  calendarId: string,
  eventId: string,
  updates: {
    startTime?: string;
    endTime?: string;
    placeName?: string;
    description?: string;
  }
): Promise<void> {
  const client = new GoogleCalendarMcpClient();

  try {
    await client.connect();

    await client.updateEvent({
      calendarId,
      eventId,
      summary: updates.placeName,
      start: updates.startTime ? { dateTime: updates.startTime } : undefined,
      end: updates.endTime ? { dateTime: updates.endTime } : undefined,
      description: updates.description,
    });

    console.log(`✅ 已更新事件: ${eventId}`);
  } catch (error) {
    console.error('❌ 更新事件失败:', error);
    throw error;
  } finally {
    await client.disconnect();
  }
}

// 使用示例
if (require.main === module) {
  // 示例行程数据
  const exampleTrip: Trip = {
    id: 'trip-123',
    name: '冰岛环岛之旅',
    timezone: 'Atlantic/Reykjavik',
    days: [
      {
        date: '2026-02-07',
        items: [
          {
            placeName: '黄金瀑布',
            startTime: '2026-02-07T10:00:00+00:00',
            endTime: '2026-02-07T12:00:00+00:00',
            description: '参观冰岛著名的黄金瀑布',
            address: 'Iceland',
          },
          {
            placeName: '间歇泉',
            startTime: '2026-02-07T13:00:00+00:00',
            endTime: '2026-02-07T15:00:00+00:00',
            description: '观看间歇泉喷发',
            address: 'Iceland',
          },
        ],
      },
    ],
  };

  // 同步行程到 Google Calendar
  syncTripToGoogleCalendar(exampleTrip)
    .then(() => {
      console.log('\n🎉 同步完成！');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ 同步失败:', error);
      process.exit(1);
    });
}
