// Utility to get month name in genitive case (родительный падеж)
export const getMonthGenitive = (date: Date): string => {
  const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];
  return months[date.getMonth()];
};

// Utility to get month name in nominative case (именительный падеж)
export const getMonthNominative = (date: Date): string => {
  const months = [
    'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
    'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'
  ];
  return months[date.getMonth()];
};

const CITY_OFFSETS: Record<string, number> = {
  'москва': 3,
  'мск': 3,
  'санкт-петербург': 3,
  'санкт петербург': 3,
  'спб': 3,
  'казань': 3,
  'химки': 3,
  'сочи': 3,
  'краснодар': 3,
  'нижний новгород': 3,
  'самара': 4,
  'саратов': 4,
  'екатеринбург': 5,
  'челябинск': 5,
  'пермь': 5,
  'тюмень': 5,
  'уфа': 5,
  'чайковский': 5,
  'омск': 6,
  'новосибирск': 7,
  'нск': 7,
  'новокузнецк': 7,
  'кемерово': 7,
  'томск': 7,
  'барнаул': 7,
  'красноярск': 7,
  'иркутск': 8,
  'якутск': 9,
  'владивосток': 10,
  'хабаровск': 10,
  'магадан': 11,
  'калининград': 2,
  'дубай': 4,
  'онлайн': 3
};

const CITY_TIMEZONES: Record<string, string> = {
  'москва': 'Europe/Moscow',
  'мск': 'Europe/Moscow',
  'санкт-петербург': 'Europe/Moscow',
  'санкт петербург': 'Europe/Moscow',
  'спб': 'Europe/Moscow',
  'казань': 'Europe/Moscow',
  'химки': 'Europe/Moscow',
  'сочи': 'Europe/Moscow',
  'краснодар': 'Europe/Moscow',
  'нижний новгород': 'Europe/Moscow',
  'самара': 'Europe/Samara',
  'саратов': 'Europe/Saratov',
  'екатеринбург': 'Asia/Yekaterinburg',
  'челябинск': 'Asia/Yekaterinburg',
  'пермь': 'Asia/Yekaterinburg',
  'тюмень': 'Asia/Yekaterinburg',
  'уфа': 'Asia/Yekaterinburg',
  'чайковский': 'Asia/Yekaterinburg',
  'омск': 'Asia/Omsk',
  'новосибирск': 'Asia/Novosibirsk',
  'нск': 'Asia/Novosibirsk',
  'новокузнецк': 'Asia/Novosibirsk',
  'кемерово': 'Asia/Novosibirsk',
  'томск': 'Asia/Novosibirsk',
  'барнаул': 'Asia/Barnaul',
  'красноярск': 'Asia/Krasnoyarsk',
  'иркутск': 'Asia/Irkutsk',
  'якутск': 'Asia/Yakutsk',
  'владивосток': 'Asia/Vladivostok',
  'хабаровск': 'Asia/Khabarovsk',
  'магадан': 'Asia/Magadan',
  'калининград': 'Europe/Kaliningrad',
  'дубай': 'Asia/Dubai',
  'онлайн': 'Europe/Moscow'
};

const normalizeCityName = (city: string): string => {
  if (!city) return '';
  const withoutUtc = city.replace(/\s*\(UTC[+-]?\d+(?::\d{2})?\)\s*/i, '');
  const base = withoutUtc.split(',')[0] || '';
  return base
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
};

export const resolveCityTimeZone = (city: string, fallback: string | null = null): string | null => {
  if (!city) return fallback;
  const normalizedCity = normalizeCityName(city);
  return CITY_TIMEZONES[normalizedCity] || fallback;
};

const getCityOffsetHours = (city: string = 'Москва'): number => {
  // 1. Check for explicit UTC offset in city name, e.g., "Bali (UTC+8)"
  const utcMatch = city.match(/\(UTC([+-]?\d+)\)/i);
  if (utcMatch) {
    return parseInt(utcMatch[1], 10);
  }

  // 2. Normal lookup
  const normalizedCity = normalizeCityName(city);
  if (CITY_OFFSETS[normalizedCity] !== undefined) {
    return CITY_OFFSETS[normalizedCity];
  }

  console.warn(`City "${city}" not found in timezone list, defaulting to UTC+3 (Moscow)`);
  return 3;
};

/**
 * Parses a date string (YYYY-MM-DD or DD.MM.YYYY) and time string (HH:MM),
 * considering the city's timezone. Returns a Date or null if invalid.
 *
 * Logic:
 * 1. Normalize date to YYYY-MM-DD if possible.
 * 2. Validate time (HH:MM).
 * 3. Check for explicit UTC offset in city, otherwise use known offsets.
 */
export const parseEventDate = (dateStr: string, timeStr: string, city: string = 'Москва'): Date | null => {
  if (!dateStr || !timeStr) return null;

  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const ru = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  let normalizedDate = dateStr;
  if (ru) normalizedDate = `${ru[3]}-${ru[2]}-${ru[1]}`;
  if (iso) normalizedDate = `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dateParts = normalizedDate.split('-').map(Number);
  if (dateParts.length !== 3 || dateParts.some(Number.isNaN)) return null;
  const [year, month, day] = dateParts;

  const normalizedTime = timeStr
    .trim()
    .replace('.', ':')
    .match(/(\d{1,2}):(\d{2})/);
  const timeMatch = normalizedTime ? [normalizedTime[0], normalizedTime[1], normalizedTime[2]] : null;
  if (!timeMatch) return null;
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

  const offsetHours = getCityOffsetHours(city);

  // Create UTC timestamp representing the face value of the time
  const utcFaceValue = Date.UTC(year, month - 1, day, hours, minutes);

  // To get the actual UTC time, we subtract the offset
  // Example: 14:00 in UTC+5 (Perm) -> We want 09:00 UTC.
  // 14:00 UTC - 5 hours = 09:00 UTC. Correct.
  const correctedTimestamp = utcFaceValue - (offsetHours * 60 * 60 * 1000);

  const result = new Date(correctedTimestamp);
  return Number.isNaN(result.getTime()) ? null : result;
};

/**
 * Formats an event time into a time string (HH:MM) in the event's timezone.
 */
export const formatEventTime = (
  dateStr: string,
  timeStr: string,
  city: string = 'Москва'
): string => {
  const date = parseEventDate(dateStr, timeStr, city);
  if (!date || Number.isNaN(date.getTime())) return '—';

  const offsetHours = getCityOffsetHours(city);
  const eventLocal = new Date(date.getTime() + offsetHours * 60 * 60 * 1000);

  return eventLocal.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC'
  });
};

const getOffsetMinutesForTimeZone = (date: Date, timeZone: string): number | null => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
      hour: '2-digit'
    }).formatToParts(date);

    const tzName = parts.find((part) => part.type === 'timeZoneName')?.value || '';
    if (!tzName) return null;
    if (tzName === 'GMT' || tzName === 'UTC') return 0;

    const match = tzName.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
    if (!match) return null;

    const sign = match[1] === '-' ? -1 : 1;
    const hours = Number(match[2]);
    const minutes = Number(match[3] || '0');
    return sign * (hours * 60 + minutes);
  } catch {
    return null;
  }
};

const parseDateTimeParts = (
  dateStr: string,
  timeStr: string
): { year: number; month: number; day: number; hours: number; minutes: number } | null => {
  if (!dateStr || !timeStr) return null;

  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const ru = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);

  let year = 0;
  let month = 0;
  let day = 0;
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (ru) {
    day = Number(ru[1]);
    month = Number(ru[2]);
    year = Number(ru[3]);
  } else {
    return null;
  }

  const timeMatch = timeStr.trim().replace('.', ':').match(/^(\d{1,2}):(\d{2})$/);
  if (!timeMatch) return null;
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);

  if ([year, month, day, hours, minutes].some(Number.isNaN)) return null;

  return { year, month, day, hours, minutes };
};

const zonedDateTimeToUtc = (
  dateStr: string,
  timeStr: string,
  timeZone: string
): Date | null => {
  const parts = parseDateTimeParts(dateStr, timeStr);
  if (!parts) return null;

  const { year, month, day, hours, minutes } = parts;
  let utcMs = Date.UTC(year, month - 1, day, hours, minutes);

  for (let i = 0; i < 3; i += 1) {
    const offsetMinutes = getOffsetMinutesForTimeZone(new Date(utcMs), timeZone);
    if (offsetMinutes === null) return null;

    const nextUtcMs = Date.UTC(year, month - 1, day, hours, minutes) - offsetMinutes * 60 * 1000;
    if (nextUtcMs === utcMs) break;
    utcMs = nextUtcMs;
  }

  const result = new Date(utcMs);
  return Number.isNaN(result.getTime()) ? null : result;
};

/**
 * For online meetings with source_timezone returns viewer-local date/time.
 * Falls back to city-based static offsets if source timezone is absent.
 */
export const formatEventDateTimeForViewer = (
  dateStr: string,
  timeStr: string,
  city: string = 'Москва',
  sourceTimezone?: string | null
): { dateLabel: string; timeLabel: string } => {
  const sourceTz = sourceTimezone?.trim();
  const utcDate = sourceTz
    ? zonedDateTimeToUtc(dateStr, timeStr, sourceTz)
    : parseEventDate(dateStr, timeStr, city);

  if (!utcDate || Number.isNaN(utcDate.getTime())) {
    return {
      dateLabel: dateStr,
      timeLabel: sourceTz ? timeStr : formatEventTime(dateStr, timeStr, city)
    };
  }

  const localTime = utcDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  const localDay = utcDate.getDate();
  const localMonth = getMonthGenitive(utcDate);

  return {
    dateLabel: `${localDay} ${localMonth}`,
    timeLabel: localTime
  };
};
