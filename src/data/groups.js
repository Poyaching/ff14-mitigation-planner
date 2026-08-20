// 技能顯示分類（固定選項，Spec §6：設定面板「顯示分類」勾選清單）。

export const GROUPS = ["mitigation", "barrier", "healing", "other"];

export const GROUP_LABEL = {
  mitigation: "減傷",
  barrier: "護盾",
  healing: "治療",
  other: "其他",
};

/**
 * 每個職業欄位裡的技能排序依據（task.txt 需求 4）：其他 > 護盾 > 減傷 > 治療，
 * 同分類內再依等級排序。數字越小排越前面。
 * @type {Record<string, number>}
 */
export const GROUP_SORT_ORDER = {
  other: 0,
  barrier: 1,
  mitigation: 2,
  healing: 3,
};
