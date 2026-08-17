// CSV 匯入（Spec §23）：Phase,Time,Action,Target,Type,Damage → AttackEvent[]

import { parseTime, nextId } from "../utils.js";

/**
 * @param {string} text CSV 原始內容
 * @returns {import('./sample-duty.js').AttackEvent[]}
 */
export function parseDutyCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  // 跳過表頭列（第一欄若為 "Phase" 視為表頭）
  const header = lines[0].split(",")[0].trim().toLowerCase();
  const rows = header === "phase" ? lines.slice(1) : lines;

  return rows.map((line) => {
    const [phase, time, action, target, type, damage] = line.split(",").map((v) => v.trim());
    return {
      id: nextId("event"),
      phase,
      time: parseTime(time),
      action,
      target,
      type: /** @type {"physical" | "magic" | "true"} */ (type),
      damage: { amount: Number(damage), kind: "hit" },
    };
  });
}
