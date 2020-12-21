/*
 * Copyright 2014-2015 Metamarkets Group Inc.
 * Copyright 2015-2019 Imply Data, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import moment from 'moment-timezone';

import { Timezone } from '../timezone/timezone';

export type AlignFn = (dt: Date, tz: Timezone) => Date;

export type ShiftFn = (dt: Date, tz: Timezone, step: number) => Date;

export type RoundFn = (dt: Date, roundTo: number, tz: Timezone) => Date;

export interface TimeShifterNoCeil {
  canonicalLength: number;
  siblings?: number;
  floor: AlignFn;
  round: RoundFn;
  shift: ShiftFn;
}

export interface TimeShifter extends TimeShifterNoCeil {
  ceil: AlignFn;
}

function adjustDay(day: number): number {
  return (day + 7) % 7;
}

function floorTo(n: number, roundTo: number): number {
  return Math.floor(n / roundTo) * roundTo;
}

function timeShifterFiller(tm: TimeShifterNoCeil): TimeShifter {
  const { floor, shift } = tm;
  return {
    ...tm,
    ceil: (dt: Date, tz: Timezone) => {
      const floored = floor(dt, tz);
      if (floored.valueOf() === dt.valueOf()) return dt; // Just like ceil(3) is 3 and not 4
      return shift(floored, tz, 1);
    },
  };
}

export const second = timeShifterFiller({
  canonicalLength: 1000,
  siblings: 60,
  floor: (dt, _tz) => {
    // Seconds do not actually need a timezone because all timezones align on seconds... for now...
    dt = new Date(dt.valueOf());
    dt.setUTCMilliseconds(0);
    return dt;
  },
  round: (dt, roundTo, _tz) => {
    const cur = dt.getUTCSeconds();
    const adj = floorTo(cur, roundTo);
    if (cur !== adj) dt.setUTCSeconds(adj);
    return dt;
  },
  shift: (dt, _tz, step) => {
    dt = new Date(dt.valueOf());
    dt.setUTCSeconds(dt.getUTCSeconds() + step);
    return dt;
  },
});

export const minute = timeShifterFiller({
  canonicalLength: 60000,
  siblings: 60,
  floor: (dt, _tz) => {
    // Minutes do not actually need a timezone because all timezones align on minutes... for now...
    dt = new Date(dt.valueOf());
    dt.setUTCSeconds(0, 0);
    return dt;
  },
  round: (dt, roundTo, _tz) => {
    const cur = dt.getUTCMinutes();
    const adj = floorTo(cur, roundTo);
    if (cur !== adj) dt.setUTCMinutes(adj);
    return dt;
  },
  shift: (dt, _tz, step) => {
    dt = new Date(dt.valueOf());
    dt.setUTCMinutes(dt.getUTCMinutes() + step);
    return dt;
  },
});

// Movement by hour is tz independent because in every timezone an hour is 60 min
function hourMove(dt: Date, _tz: Timezone, step: number) {
  dt = new Date(dt.valueOf());
  dt.setUTCHours(dt.getUTCHours() + step);
  return dt;
}

export const hour = timeShifterFiller({
  canonicalLength: 3600000,
  siblings: 24,
  floor: (dt, tz) => {
    if (tz.isUTC()) {
      dt = new Date(dt.valueOf());
      dt.setUTCMinutes(0, 0, 0);
    } else {
      const wt = moment.tz(dt, tz.toString());
      dt = new Date(
        wt
          .second(0)
          .minute(0)
          .millisecond(0)
          .valueOf(),
      );
    }
    return dt;
  },
  round: (dt, roundTo, tz) => {
    if (tz.isUTC()) {
      const cur = dt.getUTCHours();
      const adj = floorTo(cur, roundTo);
      if (cur !== adj) dt.setUTCHours(adj);
    } else {
      const wt = moment.tz(dt, tz.toString());
      const cur = wt.hour() as number;
      const adj = floorTo(cur, roundTo);
      if (cur !== adj) return hourMove(dt, tz, adj - cur);
    }
    return dt;
  },
  shift: hourMove,
});

export const day = timeShifterFiller({
  canonicalLength: 24 * 3600000,
  floor: (dt, tz) => {
    if (tz.isUTC()) {
      dt = new Date(dt.valueOf());
      dt.setUTCHours(0, 0, 0, 0);
    } else {
      const wt = moment.tz(dt, tz.toString());
      dt = new Date(
        wt
          .hour(0)
          .second(0)
          .minute(0)
          .millisecond(0)
          .valueOf(),
      );
    }
    return dt;
  },
  shift: (dt, tz, step) => {
    if (tz.isUTC()) {
      dt = new Date(dt.valueOf());
      dt.setUTCDate(dt.getUTCDate() + step);
    } else {
      const wt = moment.tz(dt, tz.toString());
      dt = new Date(wt.add(step, 'days').valueOf());
    }
    return dt;
  },
  round: () => {
    throw new Error('missing day round');
  },
});

export const week = timeShifterFiller({
  canonicalLength: 7 * 24 * 3600000,
  floor: (dt, tz) => {
    if (tz.isUTC()) {
      dt = new Date(dt.valueOf());
      dt.setUTCHours(0, 0, 0, 0);
      dt.setUTCDate(dt.getUTCDate() - adjustDay(dt.getUTCDay()));
    } else {
      const wt = moment.tz(dt, tz.toString());
      dt = new Date(
        wt
          .date(wt.date() - adjustDay(wt.day()))
          .hour(0)
          .second(0)
          .minute(0)
          .millisecond(0)
          .valueOf(),
      );
    }
    return dt;
  },
  shift: (dt, tz, step) => {
    if (tz.isUTC()) {
      dt = new Date(dt.valueOf());
      dt.setUTCDate(dt.getUTCDate() + step * 7);
    } else {
      const wt = moment.tz(dt, tz.toString());
      dt = new Date(wt.add(step * 7, 'days').valueOf());
    }
    return dt;
  },
  round: () => {
    throw new Error('missing week round');
  },
});

function monthShift(dt: Date, tz: Timezone, step: number) {
  if (tz.isUTC()) {
    dt = new Date(dt.valueOf());
    dt.setUTCMonth(dt.getUTCMonth() + step);
  } else {
    const wt = moment.tz(dt, tz.toString());
    dt = new Date(wt.add(step, 'month').valueOf());
  }
  return dt;
}

export const month = timeShifterFiller({
  canonicalLength: 30 * 24 * 3600000,
  siblings: 12,
  floor: (dt, tz) => {
    if (tz.isUTC()) {
      dt = new Date(dt.valueOf());
      dt.setUTCHours(0, 0, 0, 0);
      dt.setUTCDate(1);
    } else {
      const wt = moment.tz(dt, tz.toString());
      dt = new Date(
        wt
          .date(1)
          .hour(0)
          .second(0)
          .minute(0)
          .millisecond(0)
          .valueOf(),
      );
    }
    return dt;
  },
  round: (dt, roundTo, tz) => {
    if (tz.isUTC()) {
      const cur = dt.getUTCMonth();
      const adj = floorTo(cur, roundTo);
      if (cur !== adj) dt.setUTCMonth(adj);
    } else {
      const wt = moment.tz(dt, tz.toString());
      const cur = wt.month();
      const adj = floorTo(cur, roundTo);
      if (cur !== adj) return monthShift(dt, tz, adj - cur);
    }
    return dt;
  },
  shift: monthShift,
});

function yearShift(dt: Date, tz: Timezone, step: number) {
  if (tz.isUTC()) {
    dt = new Date(dt.valueOf());
    dt.setUTCFullYear(dt.getUTCFullYear() + step);
  } else {
    const wt = moment.tz(dt, tz.toString());
    dt = new Date(wt.add(step, 'years') as any);
  }
  return dt;
}

export const year = timeShifterFiller({
  canonicalLength: 365 * 24 * 3600000,
  siblings: 1000,
  floor: (dt, tz) => {
    if (tz.isUTC()) {
      dt = new Date(dt.valueOf());
      dt.setUTCHours(0, 0, 0, 0);
      dt.setUTCMonth(0, 1);
    } else {
      const wt = moment.tz(dt, tz.toString());
      dt = new Date(
        wt
          .month(0)
          .date(1)
          .hour(0)
          .second(0)
          .minute(0)
          .millisecond(0)
          .valueOf(),
      );
    }
    return dt;
  },
  round: (dt, roundTo, tz) => {
    if (tz.isUTC()) {
      const cur = dt.getUTCFullYear();
      const adj = floorTo(cur, roundTo);
      if (cur !== adj) dt.setUTCFullYear(adj);
    } else {
      const wt = moment.tz(dt, tz.toString());
      const cur = wt.year();
      const adj = floorTo(cur, roundTo);
      if (cur !== adj) return yearShift(dt, tz, adj - cur);
    }
    return dt;
  },
  shift: yearShift,
});

export interface Shifters {
  second: TimeShifter;
  minute: TimeShifter;
  hour: TimeShifter;
  day: TimeShifter;
  week: TimeShifter;
  month: TimeShifter;
  year: TimeShifter;

  [key: string]: TimeShifter;
}

export const shifters: Shifters = {
  second: second,
  minute: minute,
  hour: hour,
  day: day,
  week: week,
  month: month,
  year: year,
};
