// 應用進入點：串接資料、Engine、UI（Spec §24 建議專案結構）。
// 支援多場次，資料存放在 localStorage（Spec 需求 1），並可一次匯出全部場次（Spec 需求 2）。

import { sampleDuty } from "./data/sample-duty.js";
import {
  JOBS,
  GROUPS,
  ALWAYS_VISIBLE_SKILLS,
  loadSkillTiers,
  pickActiveSkills,
  getResourceColumns,
} from "./data/skills.js";
import { loadStore, saveStore } from "./data/storage.js";
import { renderPlannerTable } from "./ui/planner-table.js";
import { initSettingsDrawer } from "./ui/settings-drawer.js";
import { initToolbar } from "./ui/toolbar.js";
import { nextId, downloadJson } from "./utils.js";

/** @returns {import('./data/storage.js').SessionData} */
function createDefaultSession() {
  return {
    id: nextId("session"),
    planName: "極月讀 Lv70 學者練習",
    dutyName: "極月讀（絕）",
    level: 70,
    selectedJobs: ["SCH", "SGE"],
    visibleGroups: ["mitigation", "barrier"],
    events: sampleDuty,
    skillUsages: [],
    updatedAt: new Date().toISOString(),
  };
}

/** @returns {import('./data/storage.js').SessionData} 全新的空白場次，延續目前的職業／分類／等級設定 */
function createBlankSession(templateState, index) {
  return {
    id: nextId("session"),
    planName: `新場次 ${index}`,
    dutyName: "",
    level: templateState.level,
    selectedJobs: [...templateState.selectedJobs],
    visibleGroups: [...templateState.visibleGroups],
    events: [],
    skillUsages: [],
    updatedAt: new Date().toISOString(),
  };
}

// --- 載入儲存內容，沒有資料時建立第一個場次 ---
let store = loadStore();
if (!store || Object.keys(store.sessions).length === 0) {
  const session = createDefaultSession();
  store = { sessions: { [session.id]: session }, activeId: session.id };
  saveStore(store);
}

/** 全域狀態：目前作用中場次的內容（單一畫面，暫不需要框架，Spec §26） */
const state = {
  sessionId: store.activeId,
  planName: "",
  dutyName: "",
  level: 70,
  selectedJobs: new Set(),
  visibleGroups: new Set(),
  events: [],
  skillTiers: /** @type {import('./data/skills.js').Skill[]} */ ([]),
  skillUsages: /** @type {{ skillId: string, eventId: string, time: number }[]} */ ([]),
};

/** 把一個 SessionData 套進目前的 state（Set 需要另外轉換）。 */
function loadSessionIntoState(session) {
  state.sessionId = session.id;
  state.planName = session.planName;
  state.dutyName = session.dutyName;
  state.level = session.level;
  state.selectedJobs = new Set(session.selectedJobs);
  state.visibleGroups = new Set(session.visibleGroups);
  state.events = session.events;
  state.skillUsages = session.skillUsages;
}

loadSessionIntoState(store.sessions[store.activeId] ?? Object.values(store.sessions)[0]);

/** 把目前 state 寫回 store 裡對應的場次，並存進 localStorage。 */
function persistCurrentSession() {
  store.sessions[state.sessionId] = {
    id: state.sessionId,
    planName: state.planName,
    dutyName: state.dutyName,
    level: state.level,
    selectedJobs: [...state.selectedJobs],
    visibleGroups: [...state.visibleGroups],
    events: state.events,
    skillUsages: state.skillUsages,
    updatedAt: new Date().toISOString(),
  };
  store.activeId = state.sessionId;
  saveStore(store);
}

function sessionCatalog() {
  return Object.values(store.sessions)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    .map((s) => ({ id: s.id, name: s.planName }));
}

const tableContainer = document.getElementById("planner-table-container");
const levelBadge = document.getElementById("level-badge");
const jobsBadge = document.getElementById("jobs-badge");

/**
 * 依「職業」把可見技能分組（Spec 需求：Mitigation 底下多一層職業分類，方便尋找），
 * 每組前面視情況插入該職業的資源計量條欄位（例如學者的以太超流、賢者的蛇膽）。
 * 職業順序沿用設定面板的角色分組順序（坦克／治療／近戰／遠程／法系）。
 */
function buildJobGroups() {
  const activeSkills = pickActiveSkills(state.skillTiers, state.level).filter((s) => {
    if (!state.selectedJobs.has(s.job)) return false;
    if (state.visibleGroups.has(s.group)) return true;
    // 資源管理核心技能（例如學者以太超流、賢者根素）即使分類沒勾選也一定要看得到、點得到（Spec 需求 3-1, 4-1）
    return ALWAYS_VISIBLE_SKILLS[s.job]?.includes(s.nameEn) ?? false;
  });

  const skillsByJob = new Map();
  for (const s of activeSkills) {
    if (!skillsByJob.has(s.job)) skillsByJob.set(s.job, []);
    skillsByJob.get(s.job).push(s);
  }
  for (const list of skillsByJob.values()) list.sort((a, b) => a.level - b.level);

  const resourceByJob = new Map(
    getResourceColumns(state.skillTiers)
      .filter((r) => state.selectedJobs.has(r.job))
      .map((r) => [r.job, r])
  );

  const jobGroups = [];
  for (const job of JOBS) {
    const resource = resourceByJob.get(job.id) ?? null;
    const skills = skillsByJob.get(job.id) ?? [];
    if (!resource && skills.length === 0) continue;
    jobGroups.push({ job: job.id, label: job.name, resource, skills });
  }
  return jobGroups;
}

let drawer;
let toolbar;

function render() {
  persistCurrentSession();

  levelBadge.textContent = `Lv.${state.level}`;
  jobsBadge.textContent = `${state.selectedJobs.size} 個職業`;

  renderPlannerTable(tableContainer, {
    events: state.events,
    jobGroups: buildJobGroups(),
    skillUsages: state.skillUsages,
    skillTiers: state.skillTiers,
    onToggleUsage: (skillId, ev) => {
      const existingIndex = state.skillUsages.findIndex(
        (u) => u.skillId === skillId && u.eventId === ev.id
      );
      if (existingIndex >= 0) {
        // 已排入 → 點擊取消（Spec §15 取消前面的技能後，後續 Lock 重新計算）
        state.skillUsages.splice(existingIndex, 1);
      } else {
        state.skillUsages.push({ skillId, eventId: ev.id, time: ev.time });
      }
      render();
    },
  });

  drawer?.refresh(sessionCatalog());
  toolbar?.refresh();
}

function switchSession(id) {
  const session = store.sessions[id];
  if (!session) return;
  loadSessionIntoState(session);
  render();
}

function createSession() {
  const session = createBlankSession(state, Object.keys(store.sessions).length + 1);
  store.sessions[session.id] = session;
  switchSession(session.id);
}

function deleteSession(id) {
  const ids = Object.keys(store.sessions);
  if (ids.length <= 1) return; // 至少保留一個場次
  if (!window.confirm(`確定要刪除場次「${store.sessions[id].planName || "（未命名場次）"}」嗎？此動作無法復原。`)) {
    return;
  }
  delete store.sessions[id];
  const fallbackId = store.activeId === id ? Object.keys(store.sessions)[0] : store.activeId;
  saveStore(store);
  switchSession(fallbackId);
}

function exportAllSessions() {
  persistCurrentSession();
  const filename = `ff14-mitigation-planner-sessions-${new Date().toISOString().slice(0, 10)}.json`;
  downloadJson(filename, { exportedAt: new Date().toISOString(), sessions: store.sessions, activeId: store.activeId });
}

/**
 * 匯入場次（Spec 需求 2 的另一半：有匯出就要有對應的匯入）。
 * 匯入的場次一律用新的 id 加進目前的場次清單，不會覆蓋既有場次，匯入後自動切換到第一個匯入的場次。
 * @param {File} file 「匯出全部場次」產生的 JSON 檔
 */
async function importSessionsFromFile(file) {
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch (err) {
    window.alert(`匯入失敗：檔案不是合法的 JSON（${err.message}）`);
    return;
  }

  const importedSessions = parsed?.sessions;
  if (!importedSessions || typeof importedSessions !== "object") {
    window.alert("匯入失敗：檔案內容不是「匯出全部場次」產生的格式");
    return;
  }

  let importedCount = 0;
  let firstNewId = null;
  for (const session of Object.values(importedSessions)) {
    if (!session || typeof session !== "object") continue;
    const id = nextId("session");
    store.sessions[id] = {
      id,
      planName: session.planName ?? "（匯入的場次）",
      dutyName: session.dutyName ?? "",
      level: typeof session.level === "number" ? session.level : 70,
      selectedJobs: Array.isArray(session.selectedJobs) ? session.selectedJobs : [],
      visibleGroups: Array.isArray(session.visibleGroups) ? session.visibleGroups : ["mitigation", "barrier"],
      events: Array.isArray(session.events) ? session.events : [],
      skillUsages: Array.isArray(session.skillUsages) ? session.skillUsages : [],
      updatedAt: new Date().toISOString(),
    };
    firstNewId ??= id;
    importedCount += 1;
  }

  if (importedCount === 0) {
    window.alert("匯入失敗：檔案裡沒有任何場次");
    return;
  }

  saveStore(store);
  window.alert(`已匯入 ${importedCount} 個場次`);
  switchSession(firstNewId);
}

async function main() {
  drawer = initSettingsDrawer({
    state,
    jobs: JOBS,
    groups: GROUPS,
    onChange: render,
    onSwitchSession: switchSession,
    onCreateSession: createSession,
    onDeleteSession: () => deleteSession(state.sessionId),
  });
  toolbar = initToolbar({
    state,
    onChange: render,
    onExportAll: exportAllSessions,
    onImportSessions: importSessionsFromFile,
  });

  tableContainer.replaceChildren();
  tableContainer.textContent = "技能資料載入中…";
  try {
    state.skillTiers = await loadSkillTiers();
  } catch (err) {
    tableContainer.textContent = `技能資料載入失敗：${err.message}`;
    return;
  }
  render();
}

main();
