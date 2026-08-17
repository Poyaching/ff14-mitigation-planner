// CD Lock 計算（Spec §15），支援多充能（Spec §16）與持續時間涵蓋範圍判斷。

/**
 * 計算某技能在每個 AttackEvent 時間點的狀態。
 * 充能模型：技能有 `charges` 個充能格，未滿時每經過 `cooldown` 秒回滿 1 格；
 * 使用時消耗 1 格，格數 >0 即可使用（不需要滿格）。
 * 持續涵蓋（covered）：CD 中的格子若仍落在「最近一次使用時間 + duration」的範圍內，
 * 代表效果本身還在生效（例如減傷／護盾還沒消失），只是還不能重新施放；反之則純粹是在等 CD。
 * @param {import('../data/sample-duty.js').AttackEvent[]} events 依時間排序的事件列表
 * @param {{ skillId: string, eventId: string, time: number }[]} usages 該技能目前的 SkillUsage[]
 * @param {import('../data/skills.js').Skill} skill
 * @returns {Map<string, { state: "used" | "locked" | "available", covered?: boolean, nextAvailable?: number }>}
 */
export function computeSkillColumnStates(events, usages, skill) {
  const maxCharges = skill.charges || 1;
  const cooldown = skill.cooldown || 0;
  const duration = skill.duration || 0;
  const usageByEvent = new Map(usages.map((u) => [u.eventId, u]));
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
