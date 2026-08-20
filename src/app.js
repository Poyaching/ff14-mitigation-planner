// 應用進入點：串接資料、Engine、UI（Spec §24 建議專案結構）。
// 支援多場次，資料存放在 localStorage（Spec 需求 1），並可一次匯出全部場次（Spec 需求 2）。

import { sampleDuty } from "./data/sample-duty.js";
import { JOBS, RESOURCE_JOBS, ALWAYS_VISIBLE_SKILLS, PINNED_SKILLS, CUSTOM_SORT_GROUP } from "./data/jobs.js";
import { GROUPS, GROUP_SORT_ORDER } from "./data/groups.js";
import { loadSkillTiers, pickActiveSkills } from "./data/skills.js";
import { buildDisplayEvents } from "./engine/timeline.js";
import { loadStore, saveStore } from "./data/storage.js";
import { renderPlannerTable } from "./ui/planner-table.js";
import { initSettingsDrawer } from "./ui/settings-drawer.js";
import { initToolbar } from "./ui/toolbar.js";
import { initCollabPanel } from "./ui/collab-panel.js";
import { onAuthChange, signInWithInviteCode, joinRoom, leaveRoom, pushRoomState } from "./firebase/collab.js";
import { nextId, downloadJson } from "./utils.js";

/** @returns {import('./data/storage.js').SessionData} */
function createDefaultSession() {
  return {
    id: nextId("session"),
    planName: "幻朱雀",
    level: 100,
    selectedJobs: ["SCH", "SGE"],
    visibleGroups: ["mitigation", "barrier"],
    events: sampleDuty,
    skillUsages: [],
    updatedAt: new Date().toISOString(),
    roomId: null,
  };
}

/** @returns {import('./data/storage.js').SessionData} 全新的空白場次，延續目前的職業／分類／等級設定 */
function createBlankSession(templateState, index) {
  return {
    id: nextId("session"),
    planName: `新場次 ${index}`,
    level: templateState.level,
    selectedJobs: [...templateState.selectedJobs],
    visibleGroups: [...templateState.visibleGroups],
    events: [],
    skillUsages: [],
    updatedAt: new Date().toISOString(),
    roomId: null,
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
  level: 70,
  selectedJobs: new Set(),
  visibleGroups: new Set(),
  events: [],
  // 完整時間線開關（task.txt 需求 1）：純畫面顯示用，不屬於場次資料，不會存檔／匯出；
  // 預設打勾，不管是新場次還是匯入的場次，畫面一載入就是開啟狀態。
  showFullTimeline: true,
  // 參考時間點的間距（秒）；null 代表「自動」，交給 buildDisplayEvents 依資源節奏算預設值。
  // 使用者可以在 Top Bar 自行改成別的秒數（例如 2 秒），一樣是純畫面顯示用、不存檔。
  timelineInterval: /** @type {number | null} */ (null),
  skillTiers: /** @type {import('./data/skills.js').Skill[]} */ ([]),
  skillUsages: /** @type {{ skillId: string, eventId: string, time: number }[]} */ ([]),
  // 這個場次曾經加入過的多人共編房間代碼（純本機標記，不會同步給房間內其他人）。
  // 只用來在漢堡的場次選單裡標示「這是共編場次」，跟撞名的個人場次區分開，離開房間也不會清掉，
  // 方便之後想重新加入同一個房間時知道要打什麼代碼。
  roomId: /** @type {string | null} */ (null),
};

/** 把一個 SessionData 套進目前的 state（Set 需要另外轉換）。 */
function loadSessionIntoState(session) {
  state.sessionId = session.id;
  state.planName = session.planName;
  state.level = session.level;
  state.selectedJobs = new Set(session.selectedJobs);
  state.visibleGroups = new Set(session.visibleGroups);
  state.events = session.events;
  state.skillUsages = session.skillUsages;
  state.roomId = session.roomId ?? null;
}

loadSessionIntoState(store.sessions[store.activeId] ?? Object.values(store.sessions)[0]);

// --- 多人共編（task.txt 需求）：加入房間後，職業／等級／顯示分類／副本事件／已排入技能
// 全部即時同步給房間內所有人，見 firebase/collab.js。 ---
const collab = { roomId: /** @type {string | null} */ (null) };
let lastPushedJson = /** @type {string | null} */ (null);
let collabPanel;

/** 目前場次裡「會同步給房間」的欄位（不含畫面顯示用的完整時間線開關等純本機設定）。 */
function syncableSnapshot() {
  return {
    planName: state.planName,
    level: state.level,
    selectedJobs: [...state.selectedJobs],
    visibleGroups: [...state.visibleGroups],
    events: state.events,
    skillUsages: state.skillUsages,
  };
}

/** 收到房間資料（加入時的初始值、或之後其他人改動）時套進本機 state 並重繪。 */
function applyRemoteRoomState(data) {
  if (!data) return;
  state.planName = data.planName ?? state.planName;
  state.level = typeof data.level === "number" ? data.level : state.level;
  state.selectedJobs = new Set(data.selectedJobs ?? []);
  state.visibleGroups = new Set(data.visibleGroups ?? []);
  state.events = Array.isArray(data.events) ? data.events : state.events;
  state.skillUsages = Array.isArray(data.skillUsages) ? data.skillUsages : state.skillUsages;
  // 先把「已同步過」的基準線設成剛套用的內容，render() 裡才不會把剛收到的資料當成本機改動又寫回去。
  lastPushedJson = JSON.stringify(syncableSnapshot());
  render();
}

/** 離開房間（不管是使用者按離開、還是切換/新增/刪除場次導致連線不再有意義）。 */
function disconnectRoom() {
  if (!collab.roomId) return;
  leaveRoom();
  collab.roomId = null;
  lastPushedJson = null;
}

/** 把目前 state 寫回 store 裡對應的場次，並存進 localStorage。 */
function persistCurrentSession() {
  store.sessions[state.sessionId] = {
    id: state.sessionId,
    planName: state.planName,
    level: state.level,
    selectedJobs: [...state.selectedJobs],
    visibleGroups: [...state.visibleGroups],
    events: state.events,
    skillUsages: state.skillUsages,
    updatedAt: new Date().toISOString(),
    roomId: state.roomId,
  };
  store.activeId = state.sessionId;
  saveStore(store);
}

function sessionCatalog() {
  return Object.values(store.sessions)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    .map((s) => ({ id: s.id, name: s.planName, roomId: s.roomId ?? null }));
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
  // 排序規則（task.txt 需求 4）：PINNED_SKILLS 列出的技能（例如學者以太超流、能量吸收）固定排最前面，
  // 緊接在資源計量條旁邊；其餘預設依分類「其他 > 護盾 > 減傷 > 治療」排序，同分類內再依等級排序；
  // 有 CUSTOM_SORT_GROUP 設定的職業則改用該職業自己的分類順序，並把 extraGroup 列出的技能
  // （例如學者仙女／熾天使系）獨立插在指定順位。
  for (const [job, list] of skillsByJob) {
    const pinned = PINNED_SKILLS[job] ?? [];
    const custom = CUSTOM_SORT_GROUP[job];
    const rank = (s) => {
      const idx = pinned.indexOf(s.nameEn);
      if (idx !== -1) return [0, idx, 0];
      if (custom?.extraGroup?.nameEn.includes(s.nameEn)) return [1, custom.extraGroup.rank, s.level];
      const groupOrder = custom?.groupOrder ?? GROUP_SORT_ORDER;
      return [1, groupOrder[s.group] ?? 99, s.level];
    };
    list.sort((a, b) => {
      const [ra, ga, la] = rank(a);
      const [rb, gb, lb] = rank(b);
      return ra - rb || ga - gb || la - lb;
    });
  }

  const resourceByJob = new Map(
    RESOURCE_JOBS.filter((r) => state.selectedJobs.has(r.job)).map((r) => [r.job, r])
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

  // 有連線共編房間時，只要跟上次同步過的內容不一樣就寫回房間（debounce 見 pushRoomState）。
  if (collab.roomId) {
    const json = JSON.stringify(syncableSnapshot());
    if (json !== lastPushedJson) {
      lastPushedJson = json;
      pushRoomState(syncableSnapshot());
    }
  }

  levelBadge.textContent = `Lv.${state.level}`;
  jobsBadge.textContent = `${state.selectedJobs.size} 個職業`;

  const displayEvents = state.showFullTimeline
    ? buildDisplayEvents(state.events, state.timelineInterval ?? undefined)
    : state.events;

  renderPlannerTable(tableContainer, {
    events: displayEvents,
    jobGroups: buildJobGroups(),
    skillUsages: state.skillUsages,
    skillTiers: state.skillTiers,
    partyJobs: JOBS.filter((j) => state.selectedJobs.has(j.id)),
    onToggleUsage: (skillId, ev) => {
      const existingIndex = state.skillUsages.findIndex(
        (u) => u.skillId === skillId && u.eventId === ev.id
      );
      if (existingIndex >= 0) {
        // 已排入 → 點擊取消（Spec §15 取消前面的技能後，後續 Lock 重新計算）
        state.skillUsages.splice(existingIndex, 1);
      } else {
        state.skillUsages.push({ skillId, eventId: ev.id, time: ev.time, target: null });
      }
      render();
    },
    // 指定隊友（單體技能，例如神祝禱／安慰之心）：只改 target，不影響已排入狀態本身。
    onSetTarget: (skillId, eventId, target) => {
      const usage = state.skillUsages.find((u) => u.skillId === skillId && u.eventId === eventId);
      if (usage) {
        usage.target = target || null;
        render();
      }
    },
  });

  drawer?.refresh(sessionCatalog());
  toolbar?.refresh();
}

function switchSession(id) {
  const session = store.sessions[id];
  if (!session) return;
  // 房間是綁在單一場次的資料上，切換場次後原本的連線就沒意義了，要求使用者切回來後重新加入。
  if (collab.roomId) {
    disconnectRoom();
    collabPanel?.forceDisconnectUi();
  }
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
      planName: session.planName ?? session.dutyName ?? "（匯入的場次）",
      level: typeof session.level === "number" ? session.level : 70,
      selectedJobs: Array.isArray(session.selectedJobs) ? session.selectedJobs : [],
      visibleGroups: Array.isArray(session.visibleGroups) ? session.visibleGroups : ["mitigation", "barrier"],
      events: Array.isArray(session.events) ? session.events : [],
      skillUsages: Array.isArray(session.skillUsages) ? session.skillUsages : [],
      updatedAt: new Date().toISOString(),
      roomId: typeof session.roomId === "string" ? session.roomId : null,
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
  collabPanel = initCollabPanel({
    onSignIn: (code) => signInWithInviteCode(code),
    onJoin: async (roomId) => {
      const { existed, initialData } = await joinRoom(roomId, applyRemoteRoomState);
      collab.roomId = roomId;
      // 記錄這個場次連結到哪個房間，離開後也不清掉，讓場次選單可以標示、避免撞名選錯（見 state.roomId 註解）。
      state.roomId = roomId;
      if (existed) {
        applyRemoteRoomState(initialData);
      } else {
        // 新房間：把本機目前資料當作初始值寫上去（強制清掉基準線，讓 render() 一定會 push）。
        lastPushedJson = null;
        render();
      }
    },
    onLeave: () => disconnectRoom(),
  });
  onAuthChange((signedIn) => collabPanel.setSignedIn(signedIn));

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
