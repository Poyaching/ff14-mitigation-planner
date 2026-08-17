// 結果傷害計算（Spec 需求 5）：扣除目前已排入的減傷技能效果後，隊伍實際受到的傷害，不含護盾吸收。
//
// 簡化說明（資料模型的限制，無法做到 100% 精確）：
// - 只計算 group 為「減傷」的技能（effects.mitigation／criticalMitigation），護盾（barrier）完全不計入。
// - 條件式減傷（conditionalMitigation，需搭配 precondition 判斷是否有前置 buff）暫不計算。
// - 敵方目標技能（RANGE_ENEMY／SINGLE_ENEMY，例如雪仇、牽制）視為對所有傷害生效。
// - 隊伍範圍技能（RANGE_PARTY）視為對所有傷害生效。
// - 自身／單體技能（SELF／SINGLE_PARTY，例如預警、幹預）因為 AttackEvent 沒有記錄「誰是坦克」，
//   簡化為只在 target === "tank" 的事件上生效（多數自身減傷是坦克拿來扛自己的傷害）。
// - 多段傷害（damage 為陣列）會逐段依各自的時間點判斷當下生效的減傷。

/**
 * @param {"RANGE_ENEMY" | "SINGLE_ENEMY" | "RANGE_PARTY" | "SELF" | "SINGLE_PARTY"} assign
 * @param {string} target AttackEvent.target
 */
function appliesToTarget(assign, target) {
  if (assign === "RANGE_ENEMY" || assign === "SINGLE_ENEMY") return true;
  if (assign === "RANGE_PARTY") return true;
  if (assign === "SELF" || assign === "SINGLE_PARTY") return target === "tank";
  return true;
}

function typeKeyOf(type) {
  if (type === "physical") return "physical";
  if (type === "magic") return "magic";
  return "unique"; // "true" 傷害對應 unique 欄位
}

/**
 * 把目前已排入的減傷 SkillUsage 整理成「生效區間」清單，供逐時間點查詢用。
 * @param {{ skillId: string, eventId: string, time: number }[]} skillUsages
 * @param {Map<string, import('../data/skills.js').Skill>} tierById
 */
function buildMitigationWindows(skillUsages, tierById) {
  const windows = [];
  for (const u of skillUsages) {
    const skill = tierById.get(u.skillId);
    const mitigation = skill?.effects?.mitigation;
    if (!mitigation) continue;
    const critical = skill.effects.criticalMitigation;
    windows.push({
      start: u.time,
      end: u.time + (skill.duration || 0),
      assign: skill.assign,
      mitigation,
      criticalEnd: critical ? u.time + (critical.duration || 0) : null,
      critical,
    });
  }
  return windows;
}

/** 計算某個時間點、某種傷害類型、某個目標，會被目前生效的減傷技能乘上的總倍率（1 = 沒有減傷）。 */
function multiplierAt(windows, time, type, target) {
  const typeKey = typeKeyOf(type);
  let multiplier = 1;
  for (const w of windows) {
    if (time < w.start || time >= w.end) continue;
    if (!appliesToTarget(w.assign, target)) continue;
    multiplier *= w.mitigation[typeKey] ?? 1;
    if (w.criticalEnd !== null && time < w.criticalEnd) {
      multiplier *= w.critical[typeKey] ?? 1;
    }
  }
  return multiplier;
}

/**
 * @param {import('../data/sample-duty.js').AttackEvent[]} events
 * @param {{ skillId: string, eventId: string, time: number }[]} skillUsages 全部場次的 SkillUsage（不受分類篩選影響）
 * @param {import('../data/skills.js').Skill[]} skillTiers loadSkillTiers() 的完整清單（含所有等級節點）
 * @returns {Map<string, { amount: number, rawAmount: number, multiplier: number }>}
 */
export function computeResultDamage(events, skillUsages, skillTiers) {
  const tierById = new Map(skillTiers.map((t) => [t.id, t]));
  const windows = buildMitigationWindows(skillUsages, tierById);
  const result = new Map();

  for (const ev of events) {
    if (Array.isArray(ev.damage)) {
      let raw = 0;
      let amount = 0;
      for (const d of ev.damage) {
        const multiplier = multiplierAt(windows, d.time, ev.type, ev.target);
        raw += d.amount;
        amount += Math.round(d.amount * multiplier);
      }
      result.set(ev.id, { amount, rawAmount: raw, multiplier: raw > 0 ? amount / raw : 1 });
    } else {
      const multiplier = multiplierAt(windows, ev.time, ev.type, ev.target);
      const rawAmount = ev.damage.amount;
      result.set(ev.id, { amount: Math.round(rawAmount * multiplier), rawAmount, multiplier });
    }
  }

  return result;
}
