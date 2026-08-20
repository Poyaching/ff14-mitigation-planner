// Top Bar（Spec §4）：匯入 CSV / 重設 / 匯出匯入全部場次 / 排軸名稱同步。

import { parseDutyCsv } from "../data/csv.js";
import { defaultIntervalSeconds } from "../engine/timeline.js";

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
  const usedSkillsOnlyToggle = document.getElementById("used-skills-only-toggle");
  const timelineIntervalInput = document.getElementById("timeline-interval-input");
  const exportBtn = document.getElementById("export-sessions-btn");
  const importSessionsBtn = document.getElementById("import-sessions-btn");
  const importSessionsInput = document.getElementById("import-sessions-file-input");
  const nameInput = document.getElementById("plan-name-input");

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

  // 只顯示使用技能（task.txt 需求）：把整排職業／技能欄收成一欄，只顯示每個事件實際排入的
  // 技能圖示，方便快速看完整份排軸的結果，不用逐欄找打勾。純畫面顯示用，不存進場次資料。
  usedSkillsOnlyToggle.addEventListener("change", () => {
    state.showUsedSkillsOnly = usedSkillsOnlyToggle.checked;
    onChange();
  });

  // 間距（秒）：留空／輸入無效值就退回自動（依資源節奏算出來的預設值，見 timeline.js）。
  // 一樣是純畫面顯示用，不存進場次資料。
  timelineIntervalInput.placeholder = String(defaultIntervalSeconds());
  timelineIntervalInput.addEventListener("input", () => {
    const value = Number(timelineIntervalInput.value);
    state.timelineInterval = timelineIntervalInput.value !== "" && value > 0 ? value : null;
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

  // 排軸名稱（Spec §4，跟副本名稱共用同一個欄位，全站只有這一個輸入框）。
  // 要呼叫 onChange() 才會實際存進 store／讓漢堡選單裡的場次選項文字跟著更新（bug：先前沒呼叫，
  // 改名字後場次選單顯示的還是舊名字，重新整理甚至會遺失剛改的名字）。
  nameInput.addEventListener("input", () => {
    state.planName = nameInput.value;
    onChange();
  });

  /** 場次切換後同步排軸名稱輸入框。 */
  function refresh() {
    // 使用者正在打字時不要打斷，只在跟目前值不同時才同步（避免游標跳到最後面）。
    if (document.activeElement !== nameInput) nameInput.value = state.planName;
    fullTimelineToggle.checked = state.showFullTimeline;
    usedSkillsOnlyToggle.checked = state.showUsedSkillsOnly;
    // 使用者正在打字時不要打斷（例如清空成空字串、正要改成 2 秒的過程），只在跟目前值不同時才同步。
    const displayValue = state.timelineInterval == null ? "" : String(state.timelineInterval);
    if (document.activeElement !== timelineIntervalInput && timelineIntervalInput.value !== displayValue) {
      timelineIntervalInput.value = displayValue;
    }
  }

  return { refresh };
}
