// 技能資料（Skill[]），來源：ff14_mitigation_skills_normalized.json（Spec §12, §14），
// 依職業拆分成 skills/skill_<CODE>.json 多個檔案（見 scripts/split-skills.js）。
// 原始資料是「每個等級節點一筆」（技能會隨等級成長，例如 CD 縮短、附加效果），
// 因此這裡在載入時先攤平成「(職業, 招式) 家族」，畫面再依目前等級挑出該家族生效中的那一筆。
//
// 隊伍職業清單、顯示分類、資源欄位設定等固定選項已抽到 ./jobs.js、./groups.js，
// 這裡只保留技能資料的讀取／攤平／查詢邏輯。

import { ROLE_JOBS, JOB_NAME } from "./jobs.js";

/**
 * @typedef {{
 *   duration?: number,
 *   mitigation?: { duration?: number, magic?: number, physical?: number, unique?: number },
 *   barrier?: { effect?: { amount?: number, duration?: number } },
 *   healing?: { heal?: number, [k: string]: any },
 *   hpBuff?: any,
 *   criticalMitigation?: any,
 *   conditionalMitigation?: any,
 * }} SkillEffects
 *
 * @typedef {{
 *   id: string,
 *   familyKey: string,
 *   job: string,
 *   name: string,
 *   nameEn: string,
 *   level: number,
 *   cooldown: number,
 *   charges: number,
 *   icon: string,
 *   group: "mitigation" | "barrier" | "healing" | "other",
 *   assign: "SELF" | "RANGE_PARTY" | "SINGLE_PARTY" | "SINGLE_ENEMY" | "RANGE_ENEMY",
 *   duration: number,
 *   effects: SkillEffects,
 *   note?: string,
 *   sharedCooldownWith: string | null,
 *   availableAfter: { familyKey: string, duration: number, exclusiveWith: string[], startsOpen: boolean } | null,
 * }} Skill
 */

// 技能資料依職業／共用招式角色分類拆分成多個檔案（skills/skill_<CODE>.json），
// 由 scripts/split-skills.js 從 ff14_mitigation_skills_normalized.json 產生。
// 若母檔內容有更新，重新執行該腳本即可重新產生所有分檔。
const SKILLS_DIR = "./skills";

const ASSIGN_LABEL = {
  SELF: "自身",
  RANGE_PARTY: "隊伍範圍",
  SINGLE_PARTY: "隊伍單體",
  SINGLE_ENEMY: "敵方單體",
  RANGE_ENEMY: "敵方範圍",
};

function stripVariantSuffix(name) {
  return name.replace(/[\s　]*[（(][^）)]*[）)]\s*$/, "").trim();
}

/**
 * 有些技能到了更高等級會整個換一個名字，不是單純變體後綴（例如白魔的「醫濟」Medica II
 * 升級成「醫養」Medica III、學者的「士氣高揚之策」Succor 升級成「意氣軒昂之策」Concitation），
 * 自動判斷家族的規則（stripVariantSuffix + slug）沒辦法把它們認成同一招，會被拆成兩個獨立欄位。
 * 這裡用「新名稱 → 舊名稱」手動列出這種情況，只影響「家族分組」的判斷依據，
 * 不影響該等級節點實際顯示的技能名稱／圖示／效果（那些照樣用該節點自己的資料）。
 * 名稱請填技能的英文名稱（Skill.nameEn）。
 * @type {Record<string, string>}
 */
const SKILL_NAME_ALIASES = {
  "Medica III": "Medica II", // 白魔：醫濟 → 醫養
  "Concitation": "Succor", // 學者：士氣高揚之策 → 意氣軒昂之策
};

/** 家族分組用的名稱：套用 SKILL_NAME_ALIASES 後的結果（顯示用的 baseName 不受影響）。 */
function familyBaseName(baseName) {
  return SKILL_NAME_ALIASES[baseName] ?? baseName;
}

function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function effectGroup(effects) {
  if (!effects) return "other";
  if (effects.mitigation) return "mitigation";
  if (effects.barrier) return "barrier";
  if (effects.healing) return "healing";
  return "other";
}

/** 效果的持續時間（秒）。用來判斷 CD 中的格子是否仍在效果涵蓋範圍內（Spec 需求：區分「持續中」與「純等 CD」）。 */
function effectDuration(effects) {
  if (!effects) return 0;
  return effects.mitigation?.duration ?? effects.barrier?.effect?.duration ?? effects.duration ?? 0;
}

/**
 * 將原始 JSON 攤平成 (職業, 招式) 家族的所有等級節點。
 * 未帶 job（只有 roleGroup，例如雪仇/牽制/昏亂/鐵壁）的共用招式會展開給該角色下所有職業。
 * @param {any} raw
 * @returns {Skill[]} 依家族＋等級節點展開的完整清單（尚未依目前等級篩選）
 */
function flattenTiers(raw) {
  const expanded = [];
  for (const s of raw.skills) {
    if (/^LB\d$/.test(s.name?.en ?? "")) continue; // 極限技，CD 機制與本表不同，暫不收錄
    const jobs = s.job ? [s.job] : ROLE_JOBS[s.roleGroup] ?? [];
    for (const job of jobs) {
      expanded.push({ ...s, job });
    }
  }

  // 原始資料的 availability.skill／availability.timerShared 是用日文技能名稱互相參照
  // （例如占星「星極抽卡」→「アストラルドロー」），這裡先建一份 (job, 日文名) → familyKey 的對照表，
  // 供下面把日文參照解析成本 app 慣用的 familyKey。
  const jaNameToFamilyKey = new Map();
  for (const s of expanded) {
    if (!s.name?.ja) continue;
    const familyKey = `${s.job}|${slug(familyBaseName(stripVariantSuffix(s.name.en)))}`;
    jaNameToFamilyKey.set(`${s.job}|${s.name.ja}`, familyKey);
  }
  function resolveJaSkillName(job, ja) {
    return ja ? jaNameToFamilyKey.get(`${job}|${ja}`) ?? null : null;
  }

  // 有些資源進本就已經持有（例如占星進場預設已經抽好星極的牌），用 initialHeld 標記；
  // familyKeyInitialHeld 記錄哪些 familyKey 屬於這種「一開始就當作已觸發過」的技能。
  const familyKeyInitialHeld = new Map();
  for (const s of expanded) {
    if (!s.initialHeld) continue;
    const familyKey = `${s.job}|${slug(familyBaseName(stripVariantSuffix(s.name.en)))}`;
    familyKeyInitialHeld.set(familyKey, true);
  }

  // 同一 (job, 去除變體後綴的招式名, level) 可能有多筆（例如「延時攝影：堆棧 N」的後續 tick、
  // 「最低限度／最大」的條件效果）。優先保留沒有後綴的那筆；若整組都是變體，就取第一筆代表。
  const tierByKey = new Map();
  for (const s of expanded) {
    const baseName = stripVariantSuffix(s.name.en);
    const key = `${s.job}|${baseName}|${s.level}`;
    const isVariant = s.name.en !== baseName;
    const existing = tierByKey.get(key);
    if (!existing) {
      tierByKey.set(key, { raw: s, baseName, isVariant });
    } else if (existing.isVariant && !isVariant) {
      tierByKey.set(key, { raw: s, baseName, isVariant });
    }
  }

  return [...tierByKey.values()].map(({ raw: s, baseName }) => {
    const familyKey = `${s.job}|${slug(familyBaseName(baseName))}`;

    // 「限時技能」：必須先用過某個前置技能，才會在一段時間內變成可施放（例如占星抽卡後才能出牌、
    // 學者天使聖像期間才能用的招式）。sharedCooldownWith 則是「跟另一個技能共用同一顆 CD」
    // （例如占星的星極／靈極抽卡是同一顆 CD，用其中一個另一個也會進 CD）。
    // 若前置技能本身也有 sharedCooldownWith，代表兩者互斥（用另一顆會讓這個的限時窗口失效），
    // 一併記錄在 exclusiveWith，供 engine/cooldown.js 判斷「資源互斥」用。
    const sharedCooldownWith = resolveJaSkillName(s.job, s.availability?.timerShared);
    let availableAfter = null;
    const requiredFamilyKey = resolveJaSkillName(s.job, s.availability?.skill);
    if (requiredFamilyKey && s.availability?.duration) {
      const requiredJa = expanded.find(
        (e) => e.job === s.job && jaNameToFamilyKey.get(`${e.job}|${e.name.ja}`) === requiredFamilyKey
      );
      const exclusiveWith = resolveJaSkillName(s.job, requiredJa?.availability?.timerShared);
      // startsOpen 預設是「前置技能本身就是一開始就當作已觸發過」（例如占星預設已持有星極的牌，
      // 卡片的窗口從時間 0 就算開啟）；但這條推論不適用於互斥的那一對技能本身
      // （例如靈極抽卡的前置是星極抽卡，星極一開始就算觸發過，並不代表靈極抽卡也要一開始就打開——
      // 互斥雙方只有其中一邊該在一開始打開），所以也允許資料直接用 availability.startsOpen 明講覆蓋。
      const startsOpen =
        s.availability && "startsOpen" in s.availability
          ? s.availability.startsOpen === true
          : familyKeyInitialHeld.get(requiredFamilyKey) === true;
      availableAfter = {
        familyKey: requiredFamilyKey,
        duration: s.availability.duration,
        exclusiveWith: exclusiveWith ? [exclusiveWith] : [],
        startsOpen,
      };
    }

    return {
      id: `${familyKey}|${s.level}`,
      familyKey,
      job: s.job,
      name: s.name.zhCN || baseName,
      nameEn: baseName,
      level: s.level,
      cooldown: s.cooldown,
      charges: s.charges || 1,
      icon: s.iconUrl,
      group: effectGroup(s.effects),
      assign: s.assign,
      duration: effectDuration(s.effects),
      effects: s.effects,
      note: s.note,
      sharedCooldownWith,
      availableAfter,
    };
  });
}

/**
 * 要讀取的分檔代碼：所有職業代碼（JOB_NAME 的 key）＋所有共用招式的角色分類代碼（ROLE_JOBS 的 key，
 * 例如雪仇／牽制／昏亂／鐵壁這類不分職業、整個角色分類共用的招式）。
 * 未來新增職業時，只要在檔案上方的 ROLE_JOBS／JOB_NAME 補上設定、並新增對應的
 * skills/skill_<CODE>.json，這裡就會自動一併用迴圈讀進來，不必再改讀取邏輯。
 */
const SKILL_FILE_CODES = [...new Set([...Object.keys(JOB_NAME), ...Object.keys(ROLE_JOBS)])];

/** 讀取單一分檔；該分類目前沒有資料（例如尚無共用招式的職業分類）就當作空清單，不視為錯誤。 */
async function loadSkillFile(code) {
  const res = await fetch(`${SKILLS_DIR}/skill_${code}.json`);
  if (!res.ok) {
    if (res.status !== 404) console.warn(`載入技能分檔 skill_${code}.json 失敗（${res.status}）`);
    return [];
  }
  return res.json();
}

/** 載入並攤平技能資料。同一批資料只需抓取一次。 */
let tiersPromise;
export function loadSkillTiers() {
  if (!tiersPromise) {
    tiersPromise = Promise.all(SKILL_FILE_CODES.map(loadSkillFile)).then((chunks) =>
      flattenTiers({ skills: chunks.flat() })
    );
  }
  return tiersPromise;
}

/**
 * 依目前等級，從每個 (職業, 招式) 家族挑出生效中的那一筆（等級門檻 <= level 中最高的一筆）。
 * @param {Skill[]} tiers loadSkillTiers() 回傳的完整清單
 * @param {number} level
 * @returns {Skill[]}
 */
export function pickActiveSkills(tiers, level) {
  const bestByFamily = new Map();
  for (const s of tiers) {
    if (s.level > level) continue;
    const current = bestByFamily.get(s.familyKey);
    if (!current || s.level > current.level) bestByFamily.set(s.familyKey, s);
  }
  return [...bestByFamily.values()].sort((a, b) => a.level - b.level);
}

/** 技能效果的文字摘要（給 tooltip 用）。 */
export function describeSkill(skill) {
  const lines = [`${skill.name}（${skill.job} Lv.${skill.level}）`];
  lines.push(
    skill.cooldown > 0
      ? `CD ${skill.cooldown}s${skill.charges > 1 ? ` ×${skill.charges} 充能` : ""}`
      : "無 CD"
  );
  if (skill.assign && ASSIGN_LABEL[skill.assign]) lines.push(`目標：${ASSIGN_LABEL[skill.assign]}`);

  const e = skill.effects || {};
  if (e.mitigation) {
    const { magic, physical, unique } = e.mitigation;
    const pct = (v) => `${Math.round((1 - v) * 100)}%`;
    if (magic === physical && (unique === undefined || unique === magic)) {
      lines.push(`減傷 ${pct(magic)}｜持續 ${e.mitigation.duration ?? e.duration ?? 0}s`);
    } else {
      const parts = [];
      if (physical !== undefined) parts.push(`物理 ${pct(physical)}`);
      if (magic !== undefined) parts.push(`魔法 ${pct(magic)}`);
      if (unique !== undefined && unique !== physical && unique !== magic) parts.push(`特殊 ${pct(unique)}`);
      lines.push(`減傷 ${parts.join("／")}｜持續 ${e.mitigation.duration ?? e.duration ?? 0}s`);
    }
  }
  if (e.barrier?.effect) {
    const { amount, duration } = e.barrier.effect;
    lines.push(`護盾強度 ${amount ?? "?"}${duration ? `｜持續 ${duration}s` : ""}`);
  }
  if (e.healing) {
    lines.push(`治療潛力值 ${e.healing.heal ?? "?"}`);
  }
  if (skill.note) {
    lines.push(skill.note);
  }

  return lines.join("\n");
}
