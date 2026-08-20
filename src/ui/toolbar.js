// Top Bar（Spec §4）：匯入 CSV / 重設 / 匯出匯入全部場次 / 排軸名稱同步。

import { parseDutyCsv } from "../data/csv.js";

/**
 * @param {{
 *   state: { events: any[], skillUsages: any[], planName: string },
 *   onChange: () => void,
 *   onExportAll: () => void,
 *   onImportSessions: (file: File) => void | Promise<void>,
 * }} opts
 */
export function initToolbar({ state, onChange, onExportAll, onImportSessions }) {
  const importBtn = document.getElementById("import-csv-btn");
  const fileInput = document.getElementById("csv-file-input");
  const resetBtn = document.getElementById("reset-btn");
  const fullTimelineToggle = document.getElementById("full-timeline-toggle");
  const exportBtn = document.getElementById("export-sessions-btn");
  const importSessionsBtn = document.getElementById("import-sessions-btn");
  const importSessionsInput = document.getElementById("import-sessions-file-input");
  const nameInput = document.getElementById("plan-name-input");
  const settingsNameInput = document.getElementById("settings-name-input");

  importBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const text = await file.text();
    // 匯入新的副本資料，只負責副本資料，不含玩家排軸（Spec §23）
    state.events = parseDutyCsv(text);
    state.skillUsages = [];
    fileInput.value = "";
    onChange();
  });

  // 重設：只清除 SkillUsage[]，不動副本資料（Spec §4 重設）
  resetBtn.addEventListener("click", () => {
    state.skillUsages = [];
    onChange();
  });

  // 完整時間線（task.txt 需求 1）：開啟後在表格裡補上依資源節奏計算出的參考時間點，
  // 方便直接讀出資源計量條／技能 CD 在整點秒數的狀態。純顯示用，不會存進場次資料，預設打勾。
  fullTimelineToggle.addEventListener("change", () => {
    state.showFullTimeline = fullTimelineToggle.checked;
    onChange();
  });

  // 匯出全部場次（Spec 需求 2）
  exportBtn.addEventListener("click", () => onExportAll());

  // 匯入場次（Spec 需求 2 的另一半）
  importSessionsBtn.addEventListener("click", () => importSessionsInput.click());
  importSessionsInput.addEventListener("change", async () => {
    const file = importSessionsInput.files?.[0];
    importSessionsInput.value = "";
    if (!file) return;
    await onImportSessions(file);
  });

  // 排軸名稱：Top Bar ↔ 設定面板同步（Spec §4）
  nameInput.addEventListener("input", () => {
    state.planName = nameInput.value;
    settingsNameInput.value = nameInput.value;
  });

  /** 場次切換後同步排軸名稱輸入框。 */
  function refresh() {
    nameInput.value = state.planName;
    fullTimelineToggle.checked = state.showFullTimeline;
  }

  return { refresh };
}
