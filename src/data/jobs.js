// 隊伍職業清單與角色分類（固定選項，Spec §5：設定面板「隊伍職業」勾選清單）。

/** 職業角色分類，用於設定面板分組顯示與共用技能（roleGroup）展開對象。 */
export const ROLE_JOBS = {
  TANK: ["PLD", "WAR", "DRK", "GNB"],
  HEALER: ["WHM", "SCH", "AST", "SGE"],
  MELEE: ["MNK", "DRG", "NIN", "SAM", "RPR", "VPR"],
  RANGED: ["BRD", "MCH", "DNC"],
  CASTER: ["BLM", "SMN", "RDM", "PCT"],
};

export const ROLE_LABEL = {
  TANK: "坦克",
  HEALER: "治療",
  MELEE: "近戰 DPS",
  RANGED: "遠程 DPS",
  CASTER: "法系 DPS",
};

/** 職業代碼 → 中文名稱。 */
export const JOB_NAME = {
  PLD: "騎士", WAR: "戰士", DRK: "暗黑騎士", GNB: "絕槍戰士",
  WHM: "白魔導士", SCH: "學者", AST: "占星術師", SGE: "賢者",
  MNK: "武僧", DRG:"龍騎士",NIN:"忍者",SAM:"武士",RPR:"奪魂者",VPR:"毒蛇劍士",
  BRD: "吟遊詩人", MCH: "機工士", DNC: "舞者",
  BLM: "黑魔道士",	SMN:"召喚士",PCT:"繪靈法師",RDM:"赤魔道士"
};

/** @type {{ id: string, name: string, role: keyof typeof ROLE_JOBS }[]} */
export const JOBS = Object.entries(ROLE_JOBS).flatMap(([role, ids]) =>
  ids.map((id) => ({ id, name: JOB_NAME[id], role }))
);

export const ROLE_ORDER = Object.keys(ROLE_JOBS);

/**
 * 職業的「資源類」欄位設定（Spec 需求 5, 6，計算方式見 engine/resource.js）。
 * `gauge` 對應 engine/resource.js 的 GAUGE_COMPUTERS key；filled/empty 字元用來畫圓點計量條。
 * 資源欄位不需要圖示，只顯示文字標籤即可。
 * `regenSeconds`：這個資源自己的變化節奏，供「完整時間線」（engine/timeline.js）計算參考時間點的間隔用。
 */
export const RESOURCE_JOBS = [
  {
    job: "WHM",
    label: "百合",
    sublabel: null,
    gauge: "lily",
    filledChar: "✿",
    emptyChar: "○",
    regenSeconds: 20, // Lv.52 學會，戰鬥中每 20 秒自動開放一朵，最多 3 朵
  },
  {
    job: "SCH",
    label: "豆子",
    sublabel: "以太超流",
    gauge: "aetherflow",
    filledChar: "◆",
    emptyChar: "◇",
    regenSeconds: 60, // 沒有自動回復，要靠「以太超流」這個技能手動補滿，該技能 CD 是 60 秒
  },
  {
    job: "SGE",
    label: "蛇膽",
    sublabel: null,
    gauge: "addersgall",
    filledChar: "●",
    emptyChar: "○",
    regenSeconds: 20, // 每 20 秒自動 +1（見 engine/resource.js computeAddersgallGauge）
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
  AST: ["Astral Draw", "Umbral Draw"],
};

/**
 * 部分技能希望固定排在該職業欄位最前面（緊接在資源計量條旁邊），不想被「依等級排序」打散
 * ——例如學者的「以太超流」是重置資源的技能，放在資源欄位旁邊比較好對照。
 * 沒有列在這裡的技能維持原本的等級排序，排在被釘選的技能後面。
 * @type {Record<string, string[]>} job → nameEn 清單（依此順序排在最前面）
 */
export const PINNED_SKILLS = {
  SCH: ["Aetherflow", "Energy Drain"],
  // 占星抽卡系統：抽卡技能＋依「星極／靈極」分組的卡片，往前排方便對照哪組現在可以出牌。
  AST: [
    "Astral Draw",
    "The Balance",
    "The Arrow",
    "The Spire",
    "Lord of Crowns",
    "Umbral Draw",
    "The Spear",
    "The Ewer",
    "The Bole",
    "Lady of Crowns",
  ],
};

/**
 * 部分職業想要一套跟全域「其他 > 護盾 > 減傷 > 治療」（data/groups.js GROUP_SORT_ORDER）不一樣的
 * 分類排序，甚至把特定技能獨立成一個不看效果分類（other/barrier/mitigation/healing）的額外分類。
 * 目前只有學者：盾 ＞ 減傷 ＞ 仙女技能 ＞ 治療技能 ＞ 其他技能（乙太超流／能量吸收另外用 PINNED_SKILLS 釘最前面）。
 * - `groupOrder`：覆蓋這個職業的分類順序（數字越小排越前面）。
 * - `extraGroup`：獨立分類，`rank` 要放在 `groupOrder` 對應的兩個數值之間。
 * @type {Record<string, {
 *   groupOrder?: Record<"mitigation" | "barrier" | "healing" | "other", number>,
 *   extraGroup?: { rank: number, nameEn: string[] },
 * }>}
 */
export const CUSTOM_SORT_GROUP = {
  SCH: {
    groupOrder: { barrier: 0, mitigation: 1, healing: 2, other: 3 },
    extraGroup: {
      rank: 1.5, // 插在 mitigation(1) 之後、healing(2) 之前
      nameEn: [
        "Summon Seraph",
        "Consolation",
        "Fey Blessing",
        "Fey Union",
        "Fey Illumination",
        "Whispering Dawn",
        "Seraphism",
        "Accession",
        "Manifestation",
        "Deployment Tactics",
      ],
    },
  },
};
