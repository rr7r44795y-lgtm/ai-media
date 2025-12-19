/**
 * 日期时间工具类
 * 包含格式化、时间差计算、时区转换、有效期判断等常用功能
 * 适配前端/后端通用的时间处理场景
 */

/**
 * 格式化日期为指定字符串格式
 * @param date 日期（Date对象/时间戳/字符串）
 * @param format 格式模板，支持：YYYY-年 MM-月 DD-日 HH-时 mm-分 ss-秒 SSS-毫秒
 * @returns 格式化后的日期字符串
 * @example formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss') → '2025-12-12 14:30:00'
 */
export function formatDate(
  date: Date | number | string = new Date(),
  format: string = 'YYYY-MM-DD HH:mm:ss'
): string {
  // 统一转换为Date对象
  const targetDate = new Date(date);
  if (isNaN(targetDate.getTime())) {
    throw new Error('无效的日期格式');
  }

  // 提取日期组件
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth() + 1; // 月份从0开始
  const day = targetDate.getDate();
  const hours = targetDate.getHours();
  const minutes = targetDate.getMinutes();
  const seconds = targetDate.getSeconds();
  const milliseconds = targetDate.getMilliseconds();

  // 补零函数
  const pad = (num: number, length = 2): string => num.toString().padStart(length, '0');

  // 替换格式模板
  return format
    .replace('YYYY', pad(year, 4))
    .replace('MM', pad(month))
    .replace('DD', pad(day))
    .replace('HH', pad(hours))
    .replace('mm', pad(minutes))
    .replace('ss', pad(seconds))
    .replace('SSS', pad(milliseconds, 3));
}

/**
 * 计算两个日期的时间差
 * @param start 开始日期
 * @param end 结束日期（默认当前时间）
 * @returns 时间差对象（天/小时/分钟/秒/毫秒）
 * @example getDateDiff('2025-12-01', '2025-12-12') → { days: 11, hours: 0, minutes: 0, seconds: 0, ms: 950400000 }
 */
export function getDateDiff(
  start: Date | number | string,
  end: Date | number | string = new Date()
): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  ms: number;
} {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const diffMs = Math.abs(endMs - startMs);

  // 计算各维度差值
  const seconds = Math.floor(diffMs / 1000) % 60;
  const minutes = Math.floor(diffMs / (1000 * 60)) % 60;
  const hours = Math.floor(diffMs / (1000 * 60 * 60)) % 24;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return { days, hours, minutes, seconds, ms: diffMs };
}

/**
 * 转换为UTC时间字符串
 * @param date 日期（Date对象/时间戳/字符串）
 * @param format 格式模板（默认YYYY-MM-DD HH:mm:ss）
 * @returns UTC时间字符串
 * @example toUTCDate(new Date(), 'YYYY-MM-DD') → '2025-12-12'
 */
export function toUTCDate(
  date: Date | number | string = new Date(),
  format: string = 'YYYY-MM-DD HH:mm:ss'
): string {
  const targetDate = new Date(date);
  if (isNaN(targetDate.getTime())) {
    throw new Error('无效的日期格式');
  }

  // 提取UTC组件
  const year = targetDate.getUTCFullYear();
  const month = targetDate.getUTCMonth() + 1;
  const day = targetDate.getUTCDate();
  const hours = targetDate.getUTCHours();
  const minutes = targetDate.getUTCMinutes();
  const seconds = targetDate.getUTCSeconds();
  const milliseconds = targetDate.getUTCMilliseconds();

  const pad = (num: number, length = 2): string => num.toString().padStart(length, '0');

  return format
    .replace('YYYY', pad(year, 4))
    .replace('MM', pad(month))
    .replace('DD', pad(day))
    .replace('HH', pad(hours))
    .replace('mm', pad(minutes))
    .replace('ss', pad(seconds))
    .replace('SSS', pad(milliseconds, 3));
}

/**
 * 判断日期是否在有效期内
 * @param date 待判断日期
 * @param start 开始时间（默认当前时间）
 * @param end 结束时间
 * @returns 是否在有效期内
 * @example isInValidPeriod('2025-12-06', '2025-12-01', '2025-12-12') → true
 */
export function isInValidPeriod(
  date: Date | number | string,
  start: Date | number | string = new Date(),
  end: Date | number | string
): boolean {
  const dateMs = new Date(date).getTime();
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();

  return dateMs >= startMs && dateMs <= endMs;
}

/**
 * 获取指定日期的开始/结束时间
 * @param date 日期
 * @param type 类型（start-当天开始，end-当天结束）
 * @returns Date对象
 * @example getDayBoundary('2025-12-12', 'start') → 2025-12-12 00:00:00
 */
export function getDayBoundary(
  date: Date | number | string = new Date(),
  type: 'start' | 'end' = 'start'
): Date {
  const targetDate = new Date(date);
  if (isNaN(targetDate.getTime())) {
    throw new Error('无效的日期格式');
  }

  if (type === 'start') {
    targetDate.setHours(0, 0, 0, 0);
  } else {
    targetDate.setHours(23, 59, 59, 999);
  }

  return targetDate;
}

/**
 * 计算日期偏移（加减天数/小时/分钟）
 * @param date 基准日期
 * @param offset 偏移量（正数加，负数减）
 * @param unit 偏移单位（day/hour/minute/second）
 * @returns 偏移后的Date对象
 * @example offsetDate('2025-12-12', 7, 'day') → 2025-12-19
 */
export function offsetDate(
  date: Date | number | string = new Date(),
  offset: number = 1,
  unit: 'day' | 'hour' | 'minute' | 'second' = 'day'
): Date {
  const targetDate = new Date(date);
  if (isNaN(targetDate.getTime())) {
    throw new Error('无效的日期格式');
  }

  switch (unit) {
    case 'day':
      targetDate.setDate(targetDate.getDate() + offset);
      break;
    case 'hour':
      targetDate.setHours(targetDate.getHours() + offset);
      break;
    case 'minute':
      targetDate.setMinutes(targetDate.getMinutes() + offset);
      break;
    case 'second':
      targetDate.setSeconds(targetDate.getSeconds() + offset);
      break;
    default:
      throw new Error('不支持的偏移单位');
  }

  return targetDate;
}

/**
 * 解析字符串为Date对象（兼容多种格式）
 * @param dateStr 日期字符串（支持YYYY-MM-DD、YYYY/MM/DD、YYYY-MM-DD HH:mm:ss等）
 * @returns Date对象
 * @example parseDate('2025-12-12 14:30:00') → Date对象
 */
export function parseDate(dateStr: string): Date {
  // 替换斜杠为横杠，统一格式
  const normalizedStr = dateStr.replace(/\//g, '-');
  const date = new Date(normalizedStr);

  if (isNaN(date.getTime())) {
    throw new Error(`无法解析日期字符串：${dateStr}`);
  }

  return date;
}

/**
 * 转换为相对时间（如1分钟前、2小时前、3天前）
 * @param date 目标日期
 * @param lang 语言（zh/en，默认zh）
 * @returns 相对时间字符串
 * @example getRelativeTime('2025-12-12 14:29:00') → '1分钟前'
 */
export function getRelativeTime(
  date: Date | number | string,
  lang: 'zh' | 'en' = 'zh'
): string {
  const targetMs = new Date(date).getTime();
  const nowMs = new Date().getTime();
  const diffMs = nowMs - targetMs;

  if (diffMs < 0) {
    return lang === 'zh' ? '未来时间' : 'Future time';
  }

  // 定义时间单位
  const units = lang === 'zh'
    ? [
        { ms: 86400000, label: '天' },
        { ms: 3600000, label: '小时' },
        { ms: 60000, label: '分钟' },
        { ms: 1000, label: '秒' },
      ]
    : [
        { ms: 86400000, label: 'day' },
        { ms: 3600000, label: 'hour' },
        { ms: 60000, label: 'minute' },
        { ms: 1000, label: 'second' },
      ];

  // 计算相对时间
  for (const unit of units) {
    const value = Math.floor(diffMs / unit.ms);
    if (value >= 1) {
      return lang === 'zh'
        ? `${value}${unit.label}前`
        : `${value} ${unit.label}${value > 1 ? 's' : ''} ago`;
    }
  }

  return lang === 'zh' ? '刚刚' : 'Just now';
}