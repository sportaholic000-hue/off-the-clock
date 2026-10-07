const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;
const formatterCache = new Map();

function pad(value) {
  return String(value).padStart(2, '0');
}

function finiteInteger(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new TypeError(`${label} must be an integer from ${min} to ${max}.`);
  }
  return value;
}

function validDateParts(year, month, day) {
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year && value.getUTCMonth() + 1 === month && value.getUTCDate() === day;
}

export function parseLocalDate(value) {
  const match = typeof value === 'string' ? DATE_PATTERN.exec(value) : null;
  if (!match) throw new TypeError('Date must use YYYY-MM-DD.');
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  if (!validDateParts(parts.year, parts.month, parts.day)) throw new TypeError('Date is not valid.');
  return parts;
}

export function parseLocalTime(value) {
  const match = typeof value === 'string' ? TIME_PATTERN.exec(value) : null;
  if (!match) throw new TypeError('Time must use HH:mm.');
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new TypeError('Time is not valid.');
  return { hour, minute, minuteOfDay: hour * 60 + minute };
}

export function isValidIanaTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function formatter(timeZone) {
  if (!isValidIanaTimeZone(timeZone)) throw new TypeError('A valid IANA timezone is required.');
  if (!formatterCache.has(timeZone)) {
    formatterCache.set(timeZone, new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }));
  }
  return formatterCache.get(timeZone);
}

export function utcToLocalParts(instant, timeZone) {
  const date = instant instanceof Date ? new Date(instant.getTime()) : new Date(instant);
  if (!Number.isFinite(date.getTime())) throw new TypeError('A valid UTC instant is required.');
  const values = Object.fromEntries(
    formatter(timeZone).formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second)
  };
}

function offsetMinutesAt(instant, timeZone) {
  const date = instant instanceof Date ? instant : new Date(instant);
  const parts = utcToLocalParts(date, timeZone);
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((localAsUtc - date.getTime()) / 60000);
}

function sameLocal(parts, target) {
  return parts.year === target.year && parts.month === target.month && parts.day === target.day &&
    parts.hour === target.hour && parts.minute === target.minute;
}

export function localDateTimeCandidates(dateValue, timeValue, timeZone) {
  const date = parseLocalDate(dateValue);
  const time = parseLocalTime(timeValue);
  if (!isValidIanaTimeZone(timeZone)) throw new TypeError('A valid IANA timezone is required.');
  const target = { ...date, hour: time.hour, minute: time.minute };
  const naiveUtc = Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute, 0);
  const offsets = new Set();
  for (const hours of [-36, -12, 0, 12, 36]) {
    offsets.add(offsetMinutesAt(new Date(naiveUtc + hours * 3600000), timeZone));
  }
  const candidates = [];
  for (const offset of offsets) {
    const instant = new Date(naiveUtc - offset * 60000);
    if (sameLocal(utcToLocalParts(instant, timeZone), target)) candidates.push(instant.toISOString());
  }
  return [...new Set(candidates)].sort();
}

export function localDateForInstant(instant, timeZone) {
  const parts = utcToLocalParts(instant, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function addLocalDays(dateValue, days) {
  const parts = parseLocalDate(dateValue);
  finiteInteger(days, 'Days', { min: -3660, max: 3660 });
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function compareLocalDates(left, right) {
  parseLocalDate(left);
  parseLocalDate(right);
  return left.localeCompare(right);
}

function weekdayKey(dateValue) {
  const parts = parseLocalDate(dateValue);
  return WEEKDAY_KEYS[new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()];
}

function isoInstant(value, label) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError(`${label} must be a valid instant.`);
  return date.toISOString();
}

export function intervalsOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  const aStart = new Date(leftStart).getTime();
  const aEnd = new Date(leftEnd).getTime();
  const bStart = new Date(rightStart).getTime();
  const bEnd = new Date(rightEnd).getTime();
  return Number.isFinite(aStart) && Number.isFinite(aEnd) && Number.isFinite(bStart) && Number.isFinite(bEnd) &&
    aStart < bEnd && aEnd > bStart;
}

export function formatLocalIso(instant, timeZone) {
  const date = instant instanceof Date ? new Date(instant.getTime()) : new Date(instant);
  if (!Number.isFinite(date.getTime())) throw new TypeError('A valid UTC instant is required.');
  const parts = utcToLocalParts(date, timeZone);
  const offset = offsetMinutesAt(date, timeZone);
  const sign = offset >= 0 ? '+' : '-';
  const absolute = Math.abs(offset);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

export function formatSlotLabel(instant, timeZone, locale = 'en-US') {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (!Number.isFinite(date.getTime())) throw new TypeError('A valid UTC instant is required.');
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(date);
}

function normalizeWeeklyAvailability(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Weekly availability must be an object.');
  }
  const result = {};
  for (const key of WEEKDAY_KEYS) {
    const windows = value[key] ?? [];
    if (!Array.isArray(windows)) throw new TypeError(`Weekly availability for ${key} must be an array.`);
    result[key] = windows.map(window => {
      if (window === null || typeof window !== 'object' || Array.isArray(window)) {
        throw new TypeError(`Availability windows for ${key} must be objects.`);
      }
      const start = parseLocalTime(window.start);
      const end = parseLocalTime(window.end);
      if (end.minuteOfDay <= start.minuteOfDay) {
        throw new TypeError('Availability windows must start and end on the same day, with end after start.');
      }
      return { start: window.start, end: window.end, startMinute: start.minuteOfDay, endMinute: end.minuteOfDay };
    });
  }
  return result;
}

function normalizeBlackouts(value) {
  if (!Array.isArray(value)) throw new TypeError('Blackouts must be an array.');
  return value.map(item => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new TypeError('Each blackout must be an object.');
    }
    const startAtUtc = isoInstant(item.startAtUtc, 'Blackout start');
    const endAtUtc = isoInstant(item.endAtUtc, 'Blackout end');
    if (new Date(startAtUtc) >= new Date(endAtUtc)) throw new TypeError('Blackout end must follow its start.');
    return { startAtUtc, endAtUtc };
  });
}

function timeOfDayFor(hour) {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function withinWorkingWindow(startMs, endMs, localDate, window, timeZone) {
  const inside = at => {
    const parts = utcToLocalParts(at, timeZone);
    const date = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
    const minute = parts.hour * 60 + parts.minute;
    return date === localDate && minute >= window.startMinute && minute < window.endMinute;
  };
  // End is exclusive. Inspect the last occupied millisecond, so an appointment
  // ending exactly at closing remains valid even at a clock transition.
  const lastMs = endMs - 1;
  if (!inside(startMs) || !inside(lastMs)) return false;
  const startingOffset = offsetMinutesAt(startMs, timeZone);
  if (startingOffset === offsetMinutesAt(lastMs, timeZone)) return true;
  // Within a same-day window, inspect both sides of its offset transition.
  // A repeated-hour appointment must not cross clock times outside the window.
  let before = startMs, after = lastMs;
  while (after - before > 1) {
    const middle = Math.floor((before + after) / 2);
    if (offsetMinutesAt(middle, timeZone) === startingOffset) before = middle;
    else after = middle;
  }
  return inside(before) && inside(after);
}

export function generateCandidateSlots({
  now,
  timeZone,
  weeklyAvailability,
  blackouts = [],
  fromDate,
  days = 7,
  durationMinutes,
  slotIncrementMinutes,
  minimumNoticeMinutes,
  bookingHorizonDays,
  timeOfDay = []
}) {
  const nowDate = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (!Number.isFinite(nowDate.getTime())) throw new TypeError('A valid clock value is required.');
  if (!isValidIanaTimeZone(timeZone)) throw new TypeError('A valid IANA timezone is required.');
  finiteInteger(days, 'Days', { min: 1, max: 31 });
  finiteInteger(durationMinutes, 'Duration minutes', { min: 1, max: 7 * 24 * 60 });
  finiteInteger(slotIncrementMinutes, 'Slot increment minutes', { min: 1, max: 24 * 60 });
  finiteInteger(minimumNoticeMinutes, 'Minimum notice minutes', { min: 0, max: 365 * 24 * 60 });
  finiteInteger(bookingHorizonDays, 'Booking horizon days', { min: 1, max: 366 });
  const weekly = normalizeWeeklyAvailability(weeklyAvailability);
  const closed = normalizeBlackouts(blackouts);
  const today = localDateForInstant(nowDate, timeZone);
  const firstDate = fromDate === undefined || fromDate === null || fromDate === '' ? today : String(fromDate);
  parseLocalDate(firstDate);
  if (compareLocalDates(firstDate, today) < 0) throw new TypeError('Availability cannot start in the past.');
  const finalDate = addLocalDays(today, bookingHorizonDays);
  if (compareLocalDates(firstDate, finalDate) > 0) return [];
  const requestedPeriods = new Set(Array.isArray(timeOfDay) ? timeOfDay : []);
  for (const period of requestedPeriods) {
    if (!['morning', 'afternoon', 'evening'].includes(period)) throw new TypeError('Unsupported time-of-day filter.');
  }
  const noticeBoundary = nowDate.getTime() + minimumNoticeMinutes * 60000;
  const slots = [];
  for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
    const localDate = addLocalDays(firstDate, dayOffset);
    if (compareLocalDates(localDate, finalDate) > 0) break;
    for (const window of weekly[weekdayKey(localDate)]) {
      // Duration is elapsed time, not wall-clock subtraction. DST can make a
      // local working window shorter or longer than its displayed clock span.
      for (let minute = window.startMinute; minute < window.endMinute; minute += slotIncrementMinutes) {
        const hour = Math.floor(minute / 60);
        if (requestedPeriods.size && !requestedPeriods.has(timeOfDayFor(hour))) continue;
        const localTime = `${pad(hour)}:${pad(minute % 60)}`;
        for (const startAtUtc of localDateTimeCandidates(localDate, localTime, timeZone)) {
          const startMs = new Date(startAtUtc).getTime();
          if (startMs < noticeBoundary) continue;
          const endMs = startMs + durationMinutes * 60000;
          if (!withinWorkingWindow(startMs, endMs, localDate, window, timeZone)) continue;
          const endAtUtc = new Date(endMs).toISOString();
          if (closed.some(item => intervalsOverlap(startAtUtc, endAtUtc, item.startAtUtc, item.endAtUtc))) continue;
          slots.push({
            startAtUtc,
            endAtUtc,
            startLocal: formatLocalIso(startAtUtc, timeZone),
            endLocal: formatLocalIso(endAtUtc, timeZone)
          });
        }
      }
    }
  }
  return slots.sort((left, right) => left.startAtUtc.localeCompare(right.startAtUtc));
}
