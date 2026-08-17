// 主表格（Spec §3, §7, §19, §20）。
// 使用真正的 HTML <table>，Phase 用 rowspan，減傷技能表頭用 colspan（Spec §2.1）。
// 減傷技能底下再依職業分組（colspan），每個職業前面可能有一個資源計量條欄位。

import { computeSkillColumnStates } from "../engine/cooldown.js";
import { GAUGE_COMPUTERS, formatGauge } from "../engine/resource.js";
import { computeResultDamage } from "../engine/damage.js";
import { formatTime, formatDamage } from "../utils.js";
import { describeSkill } from "../data/skills.js";

const STATE_LABEL = { available: "", used: "✓", locked: "🔒" };
const TYPE_LABEL = { physical: "物理", magic: "魔法", true: "真傷" };

/**
 * @typedef {{
 *   job: string,
 *   label: string,
 *   resource: {
 *     job: string, label: string, sublabel: string | null, icon: string | null,
 *     gauge: string, filledChar: string, emptyChar: string,
 *   } | null,
 *   skills: import('../data/skills.js').Skill[],
 * }} JobColumnGroup
 */

/**
 * @param {HTMLElement} container
 * @param {{
 *   events: import('../data/sample-duty.js').AttackEvent[],
 *   jobGroups: JobColumnGroup[],
 *   skillUsages: { skillId: string, eventId: string, time: number }[],
 *   skillTiers: import('../data/skills.js').Skill[],
 *   onToggleUsage: (skillId: string, event: import('../data/sample-duty.js').AttackEvent) => void,
 * }} opts
 */
export function renderPlannerTable(container, opts) {
  const { events, jobGroups, skillUsages, skillTiers, onToggleUsage } = opts;

  const totalMitigationCols =
    jobGroups.reduce((sum, g) => sum + (g.resource ? 1 : 0) + g.skills.length, 0) || 1;

  // --- colgroup ---
  const fixedCols = [
    ["phase", 70],
    ["time", 72],
    ["action", 260],
    ["target", 78],
    ["type", 78],
    ["damage", 88],
    ["result", 96],
  ];
  const colgroup = document.createElement("colgroup");
  for (const [, width] of fixedCols) {
    const col = document.createElement("col");
    col.style.width = `${width}px`;
    colgroup.appendChild(col);
  }
  for (const g of jobGroups) {
    if (g.resource) {
      const col = document.createElement("col");
      col.style.width = "48px";
      colgroup.appendChild(col);
    }
    for (const _ of g.skills) {
      const col = document.createElement("col");
      col.style.width = "44px";
      colgroup.appendChild(col);
    }
  }

  // --- thead（三層 Header：固定欄／減傷技能／職業／技能，Spec §20） ---
  const thead = document.createElement("thead");
  const headRow1 = document.createElement("tr");
  const headRow2 = document.createElement("tr");
  const headRow3 = document.createElement("tr");

  const fixedLabels = ["階段", "時間", "招式", "目標", "類型", "傷害"];
  for (const label of fixedLabels) {
    const th = document.createElement("th");
    th.textContent = label;
    th.rowSpan = 3;
    headRow1.appendChild(th);
  }

  const resultTh = document.createElement("th");
  resultTh.textContent = "結果傷害";
  resultTh.title =
    "扣除目前已排入的減傷技能效果後，隊伍實際受到的傷害（不含護盾吸收）。\n" +
    "簡化規則：自身／單體減傷（例如預警、幹預）只套用在 target＝tank 的事件；" +
    "敵方或隊伍範圍減傷（例如雪仇、野戰治療陣）視為對所有傷害生效；條件式減傷（conditionalMitigation）暫不計算。";
  resultTh.rowSpan = 3;
  resultTh.className = "result-header";
  headRow1.appendChild(resultTh);

  const mitigationTh = document.createElement("th");
  mitigationTh.textContent = "減傷技能";
  mitigationTh.colSpan = totalMitigationCols;
  mitigationTh.className = "mitigation-header";
  headRow1.appendChild(mitigationTh);

  if (jobGroups.length === 0) {
    const th = document.createElement("th");
    th.textContent = "（沒有符合目前職業／分類的技能）";
    th.className = "skill-header empty";
    th.rowSpan = 2;
    headRow2.appendChild(th);
  } else {
    for (const g of jobGroups) {
      const th = document.createElement("th");
      th.textContent = g.label;
      th.colSpan = (g.resource ? 1 : 0) + g.skills.length;
      th.className = "job-group-header";
      headRow2.appendChild(th);

      if (g.resource) {
        const rth = document.createElement("th");
        rth.className = "skill-header resource-header";
        rth.title = `${g.resource.label}${g.resource.sublabel ? `（${g.resource.sublabel}）` : ""}｜資源計量條（依已排入的技能自動計算）`;
        if (g.resource.icon) {
          const icon = document.createElement("img");
          icon.className = "skill-icon";
          icon.src = g.resource.icon;
          icon.alt = g.resource.label;
          icon.loading = "lazy";
          rth.appendChild(icon);
        } else {
          const placeholder = document.createElement("span");
          placeholder.className = "resource-placeholder-icon";
          rth.appendChild(placeholder);
        }
        const label = document.createElement("span");
        label.className = "skill-name";
        label.textContent = g.resource.label;
        rth.appendChild(label);
        headRow3.appendChild(rth);
      }

      for (const skill of g.skills) {
        const th = document.createElement("th");
        th.className = `skill-header group-${skill.group}`;
        th.title = describeSkill(skill);

        if (skill.icon) {
          const icon = document.createElement("img");
          icon.className = "skill-icon";
          icon.src = skill.icon;
          icon.alt = skill.name;
          icon.loading = "lazy";
          th.appendChild(icon);
        } else {
          const placeholder = document.createElement("span");
          placeholder.className = "resource-placeholder-icon";
          th.appendChild(placeholder);
        }

        if (skill.charges > 1) {
          const badge = document.createElement("span");
          badge.className = "charge-badge";
          badge.textContent = `×${skill.charges}`;
          th.appendChild(badge);
        }

        headRow3.appendChild(th);
      }
    }
  }

  thead.appendChild(headRow1);
  thead.appendChild(headRow2);
  thead.appendChild(headRow3);

  // --- tbody ---
  const tbody = document.createElement("tbody");

  // 每個技能的 CD 狀態表（先算好，逐格查表）
  const stateBySkill = new Map();
  for (const g of jobGroups) {
    for (const skill of g.skills) {
      stateBySkill.set(
        skill.id,
        computeSkillColumnStates(
          events,
          skillUsages.filter((u) => u.skillId === skill.id),
          skill
        )
      );
    }
  }

  // 每個職業的資源計量條（讀取「全部」SkillUsage，不受目前分類篩選影響 － Spec 需求 3, 4）
  const gaugeByJob = new Map();
  for (const g of jobGroups) {
    if (!g.resource) continue;
    const computeGauge = GAUGE_COMPUTERS[g.resource.gauge];
    if (computeGauge) gaugeByJob.set(g.job, computeGauge(events, skillUsages));
  }

  // 結果傷害（讀取「全部」SkillUsage，不受目前分類篩選影響 － Spec 需求 5）
  const resultByEvent = computeResultDamage(events, skillUsages, skillTiers);

  events.forEach((ev, index) => {
    const tr = document.createElement("tr");
    tr.className = "event-row";

    // Phase rowspan：只在該 Phase 第一列輸出 <td>
    const isFirstOfPhase = index === 0 || events[index - 1].phase !== ev.phase;
    if (isFirstOfPhase) {
      let span = 1;
      while (events[index + span] && events[index + span].phase === ev.phase) span++;
      const td = document.createElement("td");
      td.textContent = ev.phase;
      td.rowSpan = span;
      td.className = "phase-cell";
      tr.appendChild(td);
    }

    const timeTd = document.createElement("td");
    timeTd.textContent = formatTime(ev.time);
    timeTd.className = "time-cell";
    tr.appendChild(timeTd);

    const actionTd = document.createElement("td");
    actionTd.textContent = ev.action;
    actionTd.className = "action-cell";
    tr.appendChild(actionTd);

    const targetTd = document.createElement("td");
    targetTd.textContent = ev.target;
    targetTd.className = "target-cell";
    tr.appendChild(targetTd);

    const typeTd = document.createElement("td");
    typeTd.textContent = TYPE_LABEL[ev.type] ?? ev.type;
    typeTd.className = `type-cell type-${ev.type}`;
    tr.appendChild(typeTd);

    const damageTd = document.createElement("td");
    damageTd.className = "damage-cell";
    if (Array.isArray(ev.damage)) {
      const total = ev.damage.reduce((sum, d) => sum + d.amount, 0);
      damageTd.textContent = `${formatDamage(total)} ×${ev.damage.length}`;
      damageTd.title = ev.damage.map((d) => `${formatTime(d.time)} ${formatDamage(d.amount)}`).join("\n");
    } else {
      damageTd.textContent = formatDamage(ev.damage.amount);
    }
    tr.appendChild(damageTd);

    const resultTd = document.createElement("td");
    resultTd.className = "result-cell";
    const resultInfo = resultByEvent.get(ev.id);
    if (resultInfo) {
      resultTd.textContent = formatDamage(resultInfo.amount);
      const reducedPct = Math.round((1 - resultInfo.multiplier) * 100);
      resultTd.title =
        reducedPct > 0
          ? `${formatDamage(resultInfo.rawAmount)} → ${formatDamage(resultInfo.amount)}（減傷 ${reducedPct}%）`
          : `未套用任何減傷（原始傷害 ${formatDamage(resultInfo.rawAmount)}）`;
      if (reducedPct > 0) resultTd.classList.add("result-reduced");
    }
    tr.appendChild(resultTd);

    for (const g of jobGroups) {
      if (g.resource) {
        const rTd = document.createElement("td");
        rTd.className = "resource-cell";
        const gauge = gaugeByJob.get(g.job);
        if (gauge) {
          const current = gauge.states.get(ev.id) ?? gauge.max;
          rTd.textContent = formatGauge(current, gauge.max, g.resource.filledChar, g.resource.emptyChar);
          rTd.title = `${g.resource.label} ${current}/${gauge.max}`;
        } else {
          rTd.title = g.resource.label;
        }
        tr.appendChild(rTd);
      }

      for (const skill of g.skills) {
        const cellState = stateBySkill.get(skill.id).get(ev.id);
        const td = document.createElement("td");
        const covered = cellState.state === "locked" && cellState.covered;
        td.className = `skill-cell group-${skill.group} state-${cellState.state}${covered ? " covered" : ""}`;
        td.textContent = STATE_LABEL[cellState.state];
        td.dataset.skillId = skill.id;
        td.dataset.eventId = ev.id;
        if (cellState.state === "locked") {
          td.title = covered
            ? `${skill.name} 效果持續中\nCD 中｜下次可用：${formatTime(cellState.nextAvailable)}`
            : `${skill.name} CD 中\n下次可用：${formatTime(cellState.nextAvailable)}`;
        } else {
          td.title = skill.name;
        }
        tr.appendChild(td);
      }
    }

    tbody.appendChild(tr);
  });

  // 事件委派：點擊技能格
  tbody.addEventListener("click", (e) => {
    const td = e.target.closest("td.skill-cell");
    if (!td || td.classList.contains("state-locked")) return;
    const skillId = td.dataset.skillId;
    const eventId = td.dataset.eventId;
    const ev = events.find((e2) => e2.id === eventId);
    if (ev) onToggleUsage(skillId, ev);
  });

  const table = document.createElement("table");
  table.className = "planner-table";
  table.appendChild(colgroup);
  table.appendChild(thead);
  table.appendChild(tbody);

  container.replaceChildren(table);
}
