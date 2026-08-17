// 範例副本時間軸資料（AttackEvent[]）
// 之後可由「匯入 CSV」取代，格式對應 Spec §23。
// TODO: 正式副本資料來源尚未確認（Spec §30-1）

/**
 * @typedef {"physical" | "magic" | "true"} DamageType
 * @typedef {{ amount: number, kind: "hit" | "dot" | "tick", duration?: number, interval?: number }} DamageData
 * @typedef {{ id: string, time: number, phase: string, action: string, target: string, type: DamageType, damage: DamageData | DamageData[], notes?: string }} AttackEvent
 */

/** @type {AttackEvent[]} */
export const sampleDuty = [
  { id: "event_001", time: 4, phase: "P1", action: "AA", target: "tank", type: "physical", damage: { amount: 12000, kind: "hit" } },
  { id: "event_002", time: 7, phase: "P1", action: "阿斯卡隆之威", target: "tank", type: "physical", damage: { amount: 28000, kind: "hit" } },
  { id: "event_003", time: 18, phase: "P1", action: "AA", target: "tank", type: "physical", damage: { amount: 12000, kind: "hit" } },
  { id: "event_004", time: 32, phase: "P1", action: "AA", target: "tank", type: "physical", damage: { amount: 12000, kind: "hit" } },
  { id: "event_005", time: 40, phase: "P1", action: "責難", target: "party", type: "magic", damage: { amount: 51000, kind: "hit" } },
  { id: "event_006", time: 54, phase: "P1", action: "百雷", target: "party", type: "magic", damage: { amount: 51000, kind: "hit" } },
  { id: "event_007", time: 68, phase: "P1", action: "AA", target: "tank", type: "physical", damage: { amount: 12000, kind: "hit" } },
  { id: "event_008", time: 82, phase: "P1", action: "邪龍魔炎", target: "party", type: "magic", damage: { amount: 45000, kind: "hit" } },
  { id: "event_009", time: 96, phase: "P2", action: "古代爆震", target: "party", type: "magic", damage: { amount: 60000, kind: "hit" } },
  {
    id: "event_010",
    time: 110,
    phase: "P2",
    action: "黃泉之槍",
    target: "tank",
    type: "physical",
    damage: [
      { time: 110, amount: 18000, kind: "hit" },
      { time: 112, amount: 18000, kind: "hit" },
      { time: 114, amount: 18000, kind: "hit" },
    ],
  },
  { id: "event_011", time: 128, phase: "P2", action: "AA", target: "tank", type: "physical", damage: { amount: 13000, kind: "hit" } },
  { id: "event_012", time: 142, phase: "P2", action: "百雷", target: "party", type: "magic", damage: { amount: 55000, kind: "hit" } },
];
