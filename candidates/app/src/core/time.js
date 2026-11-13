/**
 * 时间口径（§4.1.1）。
 * 1) 所有 N 天 / N 小时均为自起算事件起的连续时长，不按自然日 0 点切换；
 * 2) 判定区间左闭右开：起算时刻 ≤ t < 起算时刻 + N，恰好到达边界即视为超期；
 * 3) 起算时刻与判定时刻均以服务端时间为准，不采信客户端时间；精度到秒。
 *
 * 演示需要：平台内所有「7 天 / 24 小时」判定不可能在答辩现场自然发生，
 * 因此提供仅用于演示与验收测试的服务端时间偏移（/api/dev/time-shift），
 * 业务逻辑一律调用 nowMs()，绝不读客户端时间。
 */
const SECOND = 1000;
const HOUR = 3600 * SECOND;
const DAY = 24 * HOUR;

let offsetMs = 0;

export function setTimeOffset(ms) {
  offsetMs = Number(ms) || 0;
}
export function getTimeOffset() {
  return offsetMs;
}
export function nowMs() {
  return Date.now() + offsetMs;
}

/** ISO-8601 UTC 字符串，秒精度（如 2026-11-05T08:30:00Z） */
export function iso(ms = nowMs()) {
  return new Date(ms).toISOString().slice(0, 19) + 'Z';
}
export function nowIso() {
  return iso(nowMs());
}
export function parseIso(s) {
  if (!s) return NaN;
  return Date.parse(s);
}
/** 在给定 ISO 时间上加小时数 */
export function addHours(isoStr, hours) {
  return iso(parseIso(isoStr) + hours * HOUR);
}
/** 在给定 ISO 时间上加天数 */
export function addDays(isoStr, days) {
  return iso(parseIso(isoStr) + days * DAY);
}
/** to - from 的小时数 */
export function hoursBetween(fromIso, toIso) {
  return (parseIso(toIso) - parseIso(fromIso)) / HOUR;
}
/** 左闭右开判定：是否已达/超过 deadlineIso */
export function isOverdue(deadlineIso, atMs = nowMs()) {
  return atMs >= parseIso(deadlineIso);
}
/** 剩余毫秒（负数表示已超期） */
export function remainingMs(deadlineIso, atMs = nowMs()) {
  return parseIso(deadlineIso) - atMs;
}
/** 人类可读的剩余时长，用于界面提示「剩余 X 天」 */
export function humanRemaining(deadlineIso, atMs = nowMs()) {
  const ms = remainingMs(deadlineIso, atMs);
  if (ms <= 0) return '已到期';
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  const m = Math.floor((ms % HOUR) / 60000);
  if (d > 0) return `${d} 天 ${h} 小时`;
  if (h > 0) return `${h} 小时 ${m} 分`;
  return `${m} 分`;
}
/** 同一自然日（本地时区）判定，用于「每日提醒一次」 */
export function sameLocalDay(aIso, bIso) {
  if (!aIso || !bIso) return false;
  const a = new Date(parseIso(aIso));
  const b = new Date(parseIso(bIso));
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export const TIME = { SECOND, HOUR, DAY };
