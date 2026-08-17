// 資源計量條計算（Spec 需求 3, 4：賢者蛇膽／學者以太超流），依提供的試算表公式改寫成逐事件模擬。

/** 判斷某次 SkillUsage 是否屬於指定的技能家族（不論目前是哪個等級版本，Spec §skills.js familyKey）。 */
function isFamily(skillId, familyKey) {
  return skillId === familyKey || skillId.startsWith(`${familyKey}|`);
}

function usagesAtEvent(usages, eventId) {
  return usages.filter((u) => u.eventId === eventId);
}

function countByFamily(evUsages, familyKeys) {
  return evUsages.filter((u) => familyKeys.some((f) => isFamily(u.skillId, f))).length;
}

/**
 * 賢者「蛇膽」（Addersgall）：滿層 3，每 20 秒自動回 1 層（與充能技能同一套回復模型）。
 * 堅角清汁／寄生清汁／靈橡清汁／白牛清汁 各消耗 1 層，根素（Rhizomata）補回 1 層。
 * @param {import('../data/sample-duty.js').AttackEvent[]} events
 * @param {{ skillId: string, eventId: string, time: number }[]} usages 全部場次的 SkillUsage（不受目前分類篩選影響）
 * @returns {{ max: number, states: Map<string, number> }}
 */
export function computeAddersgallGauge(events, usages) {
  const MAX = 3;
  const REGEN_SECONDS = 20;
  const CONSUME = ["SGE|kerachole", "SGE|ixochole", "SGE|druochole", "SGE|taurochole"];
  const PRODUCE = ["SGE|rhizomata"];

  let avail = MAX;
  let regenStart = null;
  const states = new Map();

  for (const ev of events) {
    while (regenStart !== null && avail < MAX && ev.time - regenStart >= REGEN_SECONDS) {
      avail += 1;
      regenStart += REGEN_SECONDS;
      if (avail >= MAX) regenStart = null;
    }

    const evUsages = usagesAtEvent(usages, ev.id);
    const consume = countByFamily(evUsages, CONSUME);
    const produce = countByFamily(evUsages, PRODUCE);

    if (consume || produce) {
      avail = Math.max(0, Math.min(MAX, avail - consume + produce));
      if (avail >= MAX) regenStart = null;
      else if (regenStart === null) regenStart = ev.time;
    }

    states.set(ev.id, avail);
  }

  return { max: MAX, states };
}

/**
 * 學者「以太超流」（Aetherflow）：滿層 3，沒有自動回復，只有施放「以太超流」或「轉化」時全滿。
 * 野戰治療陣／不屈不撓之策／生命活性法／深謀遠慮之策 各消耗 1 層；
 * 同一時間點若還使用了「秘策」，可以讓其中一次消耗變成免費（不扣層數）。
 * @param {import('../data/sample-duty.js').AttackEvent[]} events
 * @param {{ skillId: string, eventId: string, time: number }[]} usages
 * @returns {{ max: number, states: Map<string, number> }}
 */
export function computeAetherflowGauge(events, usages) {
  const MAX = 3;
  const RESET = ["SCH|aetherflow", "SCH|dissipation"];
  const CONSUME = ["SCH|sacred_soil", "SCH|indomitability", "SCH|lustrate", "SCH|excogitation"];
  const REFUND = ["SCH|recitation"];

  let stacks = MAX;
  const states = new Map();

  for (const ev of events) {
    const evUsages = usagesAtEvent(usages, ev.id);
    const reset = countByFamily(evUsages, RESET) > 0;
    const consume = countByFamily(evUsages, CONSUME);
    const refund = countByFamily(evUsages, REFUND);

    if (reset) {
      stacks = MAX;
    } else if (consume > 0 || refund > 0) {
      const effectiveRefund = consume > 0 ? refund : 0; // 秘策沒有搭配消耗技能時不影響層數
      stacks = Math.max(0, Math.min(MAX, stacks - consume + effectiveRefund));
    }

    states.set(ev.id, stacks);
  }

  return { max: MAX, states };
}

/** 把目前層數轉成圓點字串，例如 max=3、current=2 → "●●○"。 */
export function formatGauge(current, max, filledChar, emptyChar) {
  const c = Math.max(0, Math.min(max, current ?? 0));
  return filledChar.repeat(c) + emptyChar.repeat(max - c);
}

/** gauge 類型 → 計算函式，供 UI 依 RESOURCE_JOBS 設定挑選。 */
export const GAUGE_COMPUTERS = {
  aetherflow: computeAetherflowGauge,
  addersgall: computeAddersgallGauge,
};
