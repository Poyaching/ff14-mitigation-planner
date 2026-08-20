// CD Lock 計算（Spec §15），支援多充能（Spec §16）與持續時間涵蓋範圍判斷。

/** 判斷某次 SkillUsage 是否屬於指定的技能家族（不論目前是哪個等級版本）。 */
function isFamily(skillId, familyKey) {
  return skillId === familyKey || skillId.startsWith(`${familyKey}|`);
}

/**
 * 計算某技能在每個 AttackEvent 時間點的狀態。
 * 充能模型：技能有 `charges` 個充能格，未滿時每經過 `cooldown` 秒回滿 1 格；
 * 使用時消耗 1 格，格數 >0 即可使用（不需要滿格）。
 * 持續涵蓋（covered）：CD 中的格子若仍落在「最近一次使用時間 + duration」的範圍內，
 * 代表效果本身還在生效（例如減傷／護盾還沒消失），只是還不能重新施放；反之則純粹是在等 CD。
 * @param {import('../data/sample-duty.js').AttackEvent[]} events 依時間排序的事件列表
 * @param {{ skillId: string, eventId: string, time: number }[]} usages 該技能目前的 SkillUsage[]
 * @param {import('../data/skills.js').Skill} skill
 * @param {{ skillId: string, eventId: string, time: number }[]} [sharedUsages] 跟這個技能「共用同一顆 CD」
 *   的另一個技能（skill.sharedCooldownWith）的使用紀錄（例如占星的星極／靈極抽卡）。
 *   會消耗充能、讓這個技能跟著進 CD，但不會讓這一格顯示成「已使用」（那是共用 CD 的另一個技能自己的格子）。
 * @returns {Map<string, { state: "used" | "locked" | "available", covered?: boolean, nextAvailable?: number }>}
 */
export function computeSkillColumnStates(events, usages, skill, sharedUsages = []) {
  const maxCharges = skill.charges || 1;
  const cooldown = skill.cooldown || 0;
  const duration = skill.duration || 0;
  const usageByEvent = new Map(usages.map((u) => [u.eventId, u]));
  const sharedByEvent = new Map(sharedUsages.map((u) => [u.eventId, u]));
  const result = new Map();

  let lastUsedTime = null; // 與充能無關，單純記錄「最近一次使用」，供持續涵蓋範圍判斷
  const isCovered = (time) => duration > 0 && lastUsedTime !== null && time < lastUsedTime + duration;

  // 無 CD（例如一般 GCD 治療咒文）：只要不是已使用過的格子，永遠可用。
  if (cooldown <= 0) {
    for (const ev of events) {
      if (usageByEvent.has(ev.id)) {
        lastUsedTime = ev.time;
        result.set(ev.id, { state: "used" });
      } else {
        result.set(ev.id, { state: "available" });
      }
    }
    return result;
  }

  let avail = maxCharges;
  let regenStart = null; // 目前這一次「充能回復倒數」的起算時間，滿格時為 null

  for (const ev of events) {
    // 先把時間推進到這個事件，補上這段期間回復的充能。
    while (regenStart !== null && avail < maxCharges && ev.time - regenStart >= cooldown) {
      avail += 1;
      regenStart += cooldown;
      if (avail >= maxCharges) regenStart = null;
    }

    if (usageByEvent.has(ev.id)) {
      result.set(ev.id, { state: "used" });
      lastUsedTime = ev.time;
      if (avail > 0) {
        avail -= 1;
        if (regenStart === null) regenStart = ev.time;
      }
      continue;
    }

    if (sharedByEvent.has(ev.id)) {
      // 共用 CD 的另一個技能被用掉了：這一格不是「已使用」，但充能要一起扣、CD 要一起跑。
      if (avail > 0) {
        avail -= 1;
        if (regenStart === null) regenStart = ev.time;
      }
      result.set(ev.id, {
        state: avail > 0 ? "available" : "locked",
        covered: false,
        nextAvailable: regenStart !== null ? regenStart + cooldown : undefined,
      });
      continue;
    }

    if (avail > 0) {
      result.set(ev.id, { state: "available" });
    } else {
      result.set(ev.id, {
        state: "locked",
        covered: isCovered(ev.time),
        nextAvailable: regenStart + cooldown,
      });
    }
  }

  return result;
}

/**
 * 「限時技能」的可施放時間窗口（Skill.availableAfter，例如占星的牌要先抽卡才能出）。
 * 判斷邏輯：找出目前最後一次觸發的是「這個前置技能」還是它的互斥對象（exclusiveWith，例如另一極的抽卡），
 * 只有「最後一次觸發的就是這個前置技能本身、且還在 duration 秒內」才算可施放
 * （互斥對象的觸發會讓這個窗口失效，即使自己的 duration 還沒到，藉此模擬「資源互斥」，Spec §task 占星資源）。
 * @param {import('../data/sample-duty.js').AttackEvent[]} events
 * @param {{ skillId: string, eventId: string, time: number }[]} allUsages 全部場次的 SkillUsage
 * @param {{ familyKey: string, duration: number, exclusiveWith?: string[], startsOpen?: boolean }} availableAfter
 *   `startsOpen`：前置技能本身是「一開始就當作已觸發過」的資源（例如占星預設已持有星極的牌），
 *   窗口從時間 0 就算開啟，不用真的先點一次前置技能。
 * @returns {Map<string, boolean>} eventId → 是否在可施放窗口內
 */
export function computeAvailabilityWindow(events, allUsages, availableAfter) {
  const { familyKey, duration, exclusiveWith = [], startsOpen = false } = availableAfter;
  const rivals = [familyKey, ...exclusiveWith];
  const usagesByEvent = new Map();
  for (const u of allUsages) {
    if (!usagesByEvent.has(u.eventId)) usagesByEvent.set(u.eventId, []);
    usagesByEvent.get(u.eventId).push(u);
  }

  let lastTriggerFamily = startsOpen ? familyKey : null;
  let lastTriggerTime = startsOpen ? 0 : null;
  const result = new Map();

  for (const ev of events) {
    const evUsages = usagesByEvent.get(ev.id) ?? [];
    for (const fam of rivals) {
      if (evUsages.some((u) => isFamily(u.skillId, fam))) {
        lastTriggerFamily = fam;
        lastTriggerTime = ev.time;
      }
    }
    const withinWindow =
      lastTriggerFamily === familyKey && lastTriggerTime !== null && ev.time < lastTriggerTime + duration;
    result.set(ev.id, withinWindow);
  }

  return result;
}

/**
 * 「每次抽卡只能發一次」（task.txt 占星資源需求）：限時技能一旦用過，就算自己的 CD／充能已經轉完，
 * 也要等到下一次觸發前置技能（重新抽到同一組牌）才會重新解鎖，不是單純看 CD。
 * @param {import('../data/sample-duty.js').AttackEvent[]} events
 * @param {{ skillId: string, eventId: string, time: number }[]} ownUsages 這個技能自己的 SkillUsage
 * @param {{ skillId: string, eventId: string, time: number }[]} allUsages 全部場次的 SkillUsage
 * @param {{ familyKey: string, startsOpen?: boolean }} availableAfter 只看觸發這個技能的前置技能（不含互斥對象）
 * @returns {Map<string, boolean>} eventId → 這次持有期間是否已經用過（true 代表要鎖住，不能再點）
 */
export function computeUsedSinceTrigger(events, ownUsages, allUsages, availableAfter) {
  const { familyKey, startsOpen = false } = availableAfter;
  const ownEventIds = new Set(ownUsages.map((u) => u.eventId));
  const usagesByEvent = new Map();
  for (const u of allUsages) {
    if (!usagesByEvent.has(u.eventId)) usagesByEvent.set(u.eventId, []);
    usagesByEvent.get(u.eventId).push(u);
  }

  let usedSinceTrigger = false;
  let everTriggered = startsOpen;
  const result = new Map();

  for (const ev of events) {
    const evUsages = usagesByEvent.get(ev.id) ?? [];
    if (evUsages.some((u) => isFamily(u.skillId, familyKey))) {
      everTriggered = true;
      usedSinceTrigger = false; // 重新抽到這組牌，用過的狀態重置
    }
    if (ownEventIds.has(ev.id)) usedSinceTrigger = true;
    result.set(ev.id, everTriggered && usedSinceTrigger);
  }

  return result;
}
