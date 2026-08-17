// 技能資料（Skill[]），來源：ff14_mitigation_skills_normalized.json（Spec §12, §14），
// 依職業拆分成 skills/skill_<CODE>.json 多個檔案（見 scripts/split-skills.js）。
// 原始資料是「每個等級節點一筆」（技能會隨等級成長，例如 CD 縮短、附加效果），
// 因此這裡在載入時先攤平成「(職業, 招式) 家族」，畫面再依目前等級挑出該家族生效中的那一筆。

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
 * }} Skill
 */

// 技能資料依職業／共用招式角色分類拆分成多個檔案（skills/skill_<CODE>.json），
// 由 scripts/split-skills.js 從 ff14_mitigation_skills_normalized.json 產生。
// 若母檔內容有更新，重新執行該腳本即可重新產生所有分檔。
const SKILLS_DIR = "./skills";

/** 職業角色分類，僅用於設定面板分組顯示與共用技能（roleGroup）展開對象。 */
const ROLE_JOBS = {
  TANK: ["PLD", "WAR", "DRK", "GNB"],
  HEALER: ["WHM", "SCH", "AST", "SGE"],
  MELEE: ["MNK"],
  RANGED: ["BRD", "MCH", "DNC"],
  CASTER: ["RDM", "PCT"],
};

const ROLE_LABEL = {
  TANK: "坦克",
  HEALER: "治療",
  MELEE: "近戰 DPS",
  RANGED: "遠程 DPS",
  CASTER: "法系 DPS",
};

const JOB_NAME = {
  PLD: "騎士", WAR: "戰士", DRK: "暗黑騎士", GNB: "絕槍戰士",
  WHM: "白魔導士", SCH: "學者", AST: "占星術師", SGE: "賢者",
  MNK: "武僧", BRD: "吟遊詩人", MCH: "機工士", DNC: "舞者",
  RDM: "赤魔導士", PCT: "繪靈法師",
};

/** @type {{ id: string, name: string, role: keyof typeof ROLE_JOBS }[]} */
export const JOBS = Object.entries(ROLE_JOBS).flatMap(([role, ids]) =>
  ids.map((id) => ({ id, name: JOB_NAME[id], role }))
);

export const ROLE_ORDER = Object.keys(ROLE_JOBS);
export { ROLE_LABEL };

export const GROUPS = ["mitigation", "barrier", "healing", "other"];
export const GROUP_LABEL = {
  mitigation: "減傷",
  barrier: "護盾",
  healing: "治療",
  other: "其他",
};

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
    const familyKey = `${s.job}|${slug(baseName)}`;
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
    };
  });
}

/**
 * 職業的「資源類」欄位設定（Spec 需求 5, 6，計算方式見 engine/resource.js）。
 * `gauge` 對應 engine/resource.js 的 GAUGE_COMPUTERS key；filled/empty 字元用來畫圓點計量條。
 */
const RESOURCE_JOBS = [
  {
    job: "SCH",
    label: "資源",
    sublabel: "以太超流",
    iconFromNameEn: "Aetherflow",
    gauge: "aetherflow",
    filledChar: "◆",
    emptyChar: "◇",
  },
  {
    job: "SGE",
    label: "蛇膽",
    sublabel: null,
    iconFromNameEn: null,
    gauge: "addersgall",
    filledChar: "●",
    emptyChar: "○",
  },
];

/**
 * 這些技能是資源管理的核心動作（例如施放後會重置計量條），
 * 即使目前的「顯示分類」沒有勾選對應分類，也一定要顯示，
 * 讓資源欄位跟真正觸發它的技能分開呈現（Spec 需求 3-1, 4-1）。
 * @type {Record<string, string[]>} job → nameEn 清單
 */
export const ALWAYS_VISIBLE_SKILLS = {
  SCH: ["Aetherflow"],
  SGE: ["Rhizomata"],
};

/**
 * 依職業回傳資源欄位設定（含圖示，若能在技能資料中找到對應招式的話）。
 * @param {Skill[]} tiers loadSkillTiers() 回傳的完整清單
 * @returns {{
 *   job: string, label: string, sublabel: string | null, icon: string | null,
 *   gauge: string, filledChar: string, emptyChar: string,
 * }[]}
 */
export function getResourceColumns(tiers) {
  return RESOURCE_JOBS.map((r) => ({
    job: r.job,
    label: r.label,
    sublabel: r.sublabel,
    icon: r.iconFromNameEn
      ? tiers.find((s) => s.job === r.job && s.nameEn === r.iconFromNameEn)?.icon ?? null
      : null,
    gauge: r.gauge,
    filledChar: r.filledChar,
    emptyChar: r.emptyChar,
  }));
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
