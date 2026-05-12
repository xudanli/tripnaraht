declare module 'suncalc' {
  export interface SunTimes {
    solarNoon: Date;
    nadir: Date;
    goldenHourEnd: Date;
    sunset: Date;
    dusk: Date;
    nauticalDusk: Date;
    nightEnd: Date;
    night: Date;
    goldenHour: Date;
    sunrise: Date;
    dawn: Date;
    nauticalDawn: Date;
    nightStart: Date;
  }

  export function getTimes(date: Date, latitude: number, longitude: number): SunTimes;
}
