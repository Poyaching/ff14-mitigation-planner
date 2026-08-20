// 本地儲存：支援多場次，資料存放在 localStorage（Spec 需求 1, 2）。
// 一個「場次」＝一次完整的排軸規劃（副本、等級、隊伍、事件時間軸、已排入的技能）。

const STORAGE_KEY = "ff14-mitigation-planner:v1";

/**
 * @typedef {{
 *   id: string,
 *   planName: string,
 *   level: number,
 *   selectedJobs: string[],
 *   visibleGroups: string[],
 *   events: import('./sample-duty.js').AttackEvent[],
 *   skillUsages: { skillId: string, eventId: string, time: number, target?: string | null }[],
 *   updatedAt: string,
 *   roomId?: string | null,
 * }} SessionData
 *
 * @typedef {{ sessions: Record<string, SessionData>, activeId: string }} Store
 */

/** 讀取整個儲存內容，格式壞掉或不存在時回傳 null。 */
export function loadStore() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    console.warn("無法讀取 localStorage", err);
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.sessions || !parsed.activeId) return null;
    return parsed;
  } catch (err) {
    console.warn("localStorage 內容格式錯誤", err);
    return null;
  }
}

/** 覆寫整個儲存內容。 */
export function saveStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (err) {
    console.warn("無法寫入 localStorage（可能已達容量上限）", err);
  }
}
