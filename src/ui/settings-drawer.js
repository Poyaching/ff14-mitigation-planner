// 左側設定面板（Spec §4 Hamburger, §5, §6），含場次管理（Spec 需求 1）。

import { ROLE_ORDER, ROLE_LABEL } from "../data/jobs.js";
import { GROUP_LABEL } from "../data/groups.js";

/**
 * @param {{
 *   state: {
 *     sessionId: string, level: number, selectedJobs: Set<string>, visibleGroups: Set<string>,
 *     planName: string,
 *   },
 *   jobs: { id: string, name: string, role: string }[],
 *   groups: string[],
 *   onChange: () => void,
 *   onSwitchSession: (id: string) => void,
 *   onCreateSession: () => void,
 *   onDeleteSession: () => void,
 * }} opts
 */
export function initSettingsDrawer({ state, jobs, groups, onChange, onSwitchSession, onCreateSession, onDeleteSession }) {
  const drawer = document.getElementById("settings-drawer");
  const overlay = document.getElementById("drawer-overlay");
  const hamburgerBtn = document.getElementById("hamburger-btn");
  const closeBtn = document.getElementById("close-drawer-btn");

  function openDrawer() {
    drawer.classList.add("open");
    overlay.classList.add("open");
  }
  function closeDrawer() {
    drawer.classList.remove("open");
    overlay.classList.remove("open");
  }

  hamburgerBtn.addEventListener("click", openDrawer);
  closeBtn.addEventListener("click", closeDrawer);
  overlay.addEventListener("click", closeDrawer);

  // 場次管理（Spec 需求 1：可以多加場次）
  const sessionSelect = document.getElementById("session-select");
  const newSessionBtn = document.getElementById("new-session-btn");
  const deleteSessionBtn = document.getElementById("delete-session-btn");

  sessionSelect.addEventListener("change", () => onSwitchSession(sessionSelect.value));
  newSessionBtn.addEventListener("click", () => onCreateSession());
  deleteSessionBtn.addEventListener("click", () => onDeleteSession());

  // 名稱：設定面板 ↔ Top Bar 同步（Spec §4 排軸名稱，跟副本名稱共用同一個欄位，不用分開填兩次）
  const nameInput = document.getElementById("settings-name-input");
  const topbarNameInput = document.getElementById("plan-name-input");
  nameInput.addEventListener("input", () => {
    state.planName = nameInput.value;
    topbarNameInput.value = nameInput.value;
  });

  // 等級（Spec §6）
  const levelSelect = document.getElementById("settings-level-select");
  levelSelect.addEventListener("change", () => {
    state.level = Number(levelSelect.value);
    onChange();
  });

  // 隊伍職業勾選（Spec §5），依角色分組顯示
  const jobContainer = document.getElementById("job-checkboxes");
  const jobsByRole = new Map(ROLE_ORDER.map((role) => [role, jobs.filter((j) => j.role === role)]));
  const jobCheckboxes = new Map(); // jobId -> <input>
  jobContainer.replaceChildren(
    ...ROLE_ORDER.flatMap((role) => {
      const roleJobs = jobsByRole.get(role) ?? [];
      if (roleJobs.length === 0) return [];
      const heading = document.createElement("div");
      heading.className = "job-role-heading";
      heading.textContent = ROLE_LABEL[role];

      const checkboxes = roleJobs.map((job) => {
        const label = document.createElement("label");
        label.className = "job-checkbox";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) state.selectedJobs.add(job.id);
          else state.selectedJobs.delete(job.id);
          onChange();
        });
        jobCheckboxes.set(job.id, checkbox);
        label.appendChild(checkbox);
        label.append(` ${job.id}　${job.name}`);
        return label;
      });

      return [heading, ...checkboxes];
    })
  );

  // 技能分類顯示（減傷／護盾／治療／其他）
  const groupContainer = document.getElementById("group-checkboxes");
  const groupCheckboxes = new Map(); // group -> <input>
  groupContainer.replaceChildren(
    ...groups.map((group) => {
      const label = document.createElement("label");
      label.className = "job-checkbox";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) state.visibleGroups.add(group);
        else state.visibleGroups.delete(group);
        onChange();
      });
      groupCheckboxes.set(group, checkbox);
      label.appendChild(checkbox);
      label.append(` ${GROUP_LABEL[group] ?? group}`);
      return label;
    })
  );

  /**
   * 依目前 state／場次清單重新同步畫面上的欄位（場次切換後、或任何 state 變動後呼叫）。
   * @param {{ id: string, name: string }[]} sessionCatalog
   */
  function refresh(sessionCatalog) {
    sessionSelect.replaceChildren(
      ...sessionCatalog.map((s) => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.name || "（未命名場次）";
        return opt;
      })
    );
    sessionSelect.value = state.sessionId;
    deleteSessionBtn.disabled = sessionCatalog.length <= 1;

    nameInput.value = state.planName;
    levelSelect.value = String(state.level);
    for (const [jobId, checkbox] of jobCheckboxes) checkbox.checked = state.selectedJobs.has(jobId);
    for (const [group, checkbox] of groupCheckboxes) checkbox.checked = state.visibleGroups.has(group);
  }

  return { openDrawer, closeDrawer, refresh };
}
