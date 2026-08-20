// 「正確時間線」（task.txt 需求 1）：開啟後在原始事件之間補上固定間隔的參考時間點，
// 方便直接在表格上讀出資源計量條／技能 CD 的狀態，不用自己心算。
// 只影響畫面顯示用的事件清單，不會寫回場次的 events 資料，也不會被匯出。
//
// 間隔秒數怎麼決定：不同資源有不同的變化節奏（例如賢者蛇膽每 20 秒自動 +1、
// 學者以太超流要靠 60 秒 CD 的技能手動補滿，見 data/jobs.js 的 RESOURCE_JOBS.regenSeconds），
// 預設取所有資源節奏的最大公因數（20 與 60 的最大公因數是 20），
// 這樣同一組參考時間點可以同時對齊每一種資源的變化時機。

import { RESOURCE_JOBS } from "../data/jobs.js";

function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}

const FALLBACK_INTERVAL_SECONDS = 20;

/** 目前設定的所有資源節奏的最大公因數；沒有任何資源設定 regenSeconds 時退回預設值。 */
function defaultIntervalSeconds() {
  const seconds = RESOURCE_JOBS.map((r) => r.regenSeconds).filter((n) => n > 0);
  if (seconds.length === 0) return FALLBACK_INTERVAL_SECONDS;
  return seconds.reduce(gcd);
}

/**
 * @param {import('../data/sample-duty.js').AttackEvent[]} events 依時間排序的原始事件
 * @param {number} [intervalSeconds] 參考時間點的間隔秒數，預設見 defaultIntervalSeconds()
 * @returns {(import('../data/sample-duty.js').AttackEvent & { isMarker?: boolean })[]}
 *   依時間排序、原始事件與參考時間點合併後的清單
 */
export function buildDisplayEvents(events, intervalSeconds = defaultIntervalSeconds()) {
  if (events.length === 0) return [];

  const realTimes = new Set(events.map((e) => e.time));
  const lastTime = events[events.length - 1].time;
  const lastGrid = Math.ceil(lastTime / intervalSeconds) * intervalSeconds;

  const markers = [];
  for (let t = 0; t <= lastGrid; t += intervalSeconds) {
    if (realTimes.has(t)) continue; // 跟真實事件時間重疊就不重複畫一列
    markers.push({
      id: `marker_${t}`,
      time: t,
      phase: phaseAt(events, t),
      action: "",
      target: "",
      type: null,
      damage: { amount: 0, kind: "marker" },
      isMarker: true,
    });
  }

  return [...events, ...markers].sort((a, b) => a.time - b.time);
}

/** 時間點 t 所屬的 Phase：取「時間 <= t 的最後一個事件」的 phase；t 比所有事件都早就用第一個事件的 phase。 */
function phaseAt(events, t) {
  let phase = events[0].phase;
  for (const ev of events) {
    if (ev.time > t) break;
    phase = ev.phase;
  }
  return phase;
}
