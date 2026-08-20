// 主表格（Spec §3, §7, §19, §20）。
// 使用真正的 HTML <table>，Phase 用 rowspan，減傷技能表頭用 colspan（Spec §2.1）。
// 減傷技能底下再依職業分組（colspan），每個職業前面可能有一個資源計量條欄位。

import { computeSkillColumnStates, computeAvailabilityWindow, computeUsedSinceTrigger } from "../engine/cooldown.js";
import { GAUGE_COMPUTERS, RESOURCE_CONSUMERS, formatGauge } from "../engine/resource.js";
import { computeResultDamage } from "../engine/damage.js";
import { formatTime, formatDamage } from "../utils.js";
import { describeSkill } from "../data/skills.js";

const STATE_LABEL = { available: "", used: "✓", locked: "🔒" };
const TYPE_LABEL = { physical: "物理", magic: "魔法", true: "真傷" };
const CANCEL_USAGE_VALUE = "__cancel__"; // 指定隊友選單裡的「取消排入」選項用的特殊值

/**
 * @typedef {{
 *   job: string,
 *   label: string,
 *   resource: {
 *     job: string, label: string, sublabel: string | null,
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
 *   skillUsages: { skillId: string, eventId: string, time: number, target?: string | null }[],
 *   skillTiers: import('../data/skills.js').Skill[],
 *   partyJobs: { id: string, name: string }[],
 *   onToggleUsage: (skillId: string, event: import('../data/sample-duty.js').AttackEvent) => void,
 *   onSetTarget: (skillId: string, eventId: string, target: string) => void,
 *   showUsedSkillsOnly?: boolean,
 * }} opts
 */
export function renderPlannerTable(container, opts) {
  const { events, jobGroups, skillUsages, skillTiers, partyJobs, onToggleUsage, onSetTarget, showUsedSkillsOnly } = opts;
  const usageByKey = new Map(skillUsages.map((u) => [`${u.skillId}|${u.eventId}`, u]));

  // 「只顯示使用技能」（task.txt 需求）：把整排職業／技能欄收成一欄，每個事件顯示這次真的
  // 排入的技能圖示；有 duration 的技能（例如異想幻光這類有持續時間的護盾／減傷）如果效果還沒
  // 結束，涵蓋到的後續事件也一併顯示同一個圖示（用跟一般表格同一套 stateBySkill／covered 判斷，
  // 見下方），代表「這個機制當下有被這個效果罩住」，不是漏排。covered 的圖示是唯讀的，
  // 只有真正排入的那一格可以點擊取消（不然點了不知道要取消哪一次施放）。

  const totalMitigationCols = showUsedSkillsOnly
    ? 1
    : jobGroups.reduce((sum, g) => sum + (g.resource ? 1 : 0) + g.skills.length, 0) || 1;

  // --- colgroup ---
  // 手機版需求：這幾欄要凍結在左邊（見下方 applyStickyOffsets），「招式」不用強制留大格，
  // 交給 table-layout: auto 依內容動態撐開，這裡的寬度只是初始建議值。
  const fixedCols = [
    ["phase-cell", 60],
    ["time-cell", 68],
    ["action-cell", 110],
    ["target-cell", 64],
    ["type-cell", 64],
    ["damage-cell", 78],
    ["result-cell", 90],
  ];
  const colgroup = document.createElement("colgroup");
  for (const [, width] of fixedCols) {
    const col = document.createElement("col");
    col.style.width = `${width}px`;
    colgroup.appendChild(col);
  }
  if (showUsedSkillsOnly) {
    const col = document.createElement("col");
    col.style.width = "220px";
    colgroup.appendChild(col);
  } else {
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
  }

  // --- thead（三層 Header：固定欄／減傷技能／職業／技能，Spec §20） ---
  const thead = document.createElement("thead");
  const headRow1 = document.createElement("tr");
  const headRow2 = document.createElement("tr");
  const headRow3 = document.createElement("tr");

  const fixedLabels = ["階段", "時間", "招式", "目標", "類型", "傷害"];
  fixedLabels.forEach((label, i) => {
    const th = document.createElement("th");
    th.textContent = label;
    th.rowSpan = 3;
    th.className = fixedCols[i][0]; // 跟 tbody 對應欄位同一個 class，供 applyStickyOffsets 量測寬度
    headRow1.appendChild(th);
  });

  const resultTh = document.createElement("th");
  resultTh.textContent = "結果傷害";
  resultTh.title =
    "扣除目前已排入的減傷技能效果後，隊伍實際受到的傷害（不含護盾吸收）。\n" +
    "簡化規則：自身／單體減傷（例如預警、幹預）只套用在 target＝tank 的事件；" +
    "敵方或隊伍範圍減傷（例如雪仇、野戰治療陣）視為對所有傷害生效；條件式減傷（conditionalMitigation）暫不計算。";
  resultTh.rowSpan = 3;
  resultTh.className = "result-header result-cell";
  headRow1.appendChild(resultTh);

  const mitigationTh = document.createElement("th");
  mitigationTh.textContent = "減傷技能";
  mitigationTh.colSpan = totalMitigationCols;
  mitigationTh.className = "mitigation-header";
  headRow1.appendChild(mitigationTh);

  if (showUsedSkillsOnly) {
    const th = document.createElement("th");
    th.textContent = "使用技能";
    th.className = "skill-header empty used-skills-header";
    th.rowSpan = 2;
    headRow2.appendChild(th);
  } else if (jobGroups.length === 0) {
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
        // 資源欄位不需要圖示，只顯示文字標籤即可。
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

  // familyKey → 目前顯示中的技能 id，用來解析 skill.sharedCooldownWith／availableAfter 這類跨技能參照
  // （例如占星星極／靈極抽卡共用 CD、卡片要先抽卡才能出牌）。
  const skillIdByFamily = new Map();
  for (const g of jobGroups) {
    for (const skill of g.skills) skillIdByFamily.set(skill.familyKey, skill.id);
  }

  // 每個技能的 CD 狀態表（先算好，逐格查表）；同時算出「限時技能」的可施放窗口，
  // 以及「每次觸發前置技能只能用一次」的已使用狀態（task.txt 占星資源需求：每張卡每次抽卡只能發一次）。
  const stateBySkill = new Map();
  const availabilityBySkill = new Map();
  const usedSinceTriggerBySkill = new Map();
  for (const g of jobGroups) {
    for (const skill of g.skills) {
      const ownUsages = skillUsages.filter((u) => u.skillId === skill.id);
      let sharedUsages = [];
      if (skill.sharedCooldownWith) {
        const siblingId = skillIdByFamily.get(skill.sharedCooldownWith);
        if (siblingId) sharedUsages = skillUsages.filter((u) => u.skillId === siblingId);
      }
      stateBySkill.set(skill.id, computeSkillColumnStates(events, ownUsages, skill, sharedUsages));

      if (skill.availableAfter) {
        availabilityBySkill.set(skill.id, computeAvailabilityWindow(events, skillUsages, skill.availableAfter));
        usedSinceTriggerBySkill.set(
          skill.id,
          computeUsedSinceTrigger(events, ownUsages, skillUsages, skill.availableAfter)
        );
      }
    }
  }

  // 每個職業的資源計量條（讀取「全部」SkillUsage，不受目前分類篩選影響 － Spec 需求 3, 4）
  const gaugeByJob = new Map();
  // 每個職業「會消耗這個資源」的技能家族（familyKey 集合），資源用完時要把對應技能格鎖住，不能誤點。
  const consumeFamiliesByJob = new Map();
  for (const g of jobGroups) {
    if (!g.resource) continue;
    const computeGauge = GAUGE_COMPUTERS[g.resource.gauge];
    if (computeGauge) gaugeByJob.set(g.job, computeGauge(events, skillUsages));
    consumeFamiliesByJob.set(g.job, new Set(RESOURCE_CONSUMERS[g.resource.gauge] ?? []));
  }

  // 結果傷害（讀取「全部」SkillUsage，不受目前分類篩選影響 － Spec 需求 5）。
  // 「完整時間線」補的參考時間點（isMarker）沒有真實傷害，不需要計算。
  const resultByEvent = computeResultDamage(
    events.filter((ev) => !ev.isMarker),
    skillUsages,
    skillTiers
  );

  events.forEach((ev, index) => {
    const tr = document.createElement("tr");
    tr.className = ev.isMarker ? "event-row marker-row" : "event-row";

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

    // 「完整時間線」補的參考時間點（isMarker）沒有招式／目標／類型／傷害／結果傷害，欄位留空即可。
    const actionTd = document.createElement("td");
    actionTd.textContent = ev.isMarker ? "" : ev.action;
    actionTd.className = "action-cell";
    tr.appendChild(actionTd);

    const targetTd = document.createElement("td");
    targetTd.textContent = ev.isMarker ? "" : ev.target;
    targetTd.className = "target-cell";
    tr.appendChild(targetTd);

    const typeTd = document.createElement("td");
    if (!ev.isMarker) {
      typeTd.textContent = TYPE_LABEL[ev.type] ?? ev.type;
      typeTd.className = `type-cell type-${ev.type}`;
    } else {
      typeTd.className = "type-cell";
    }
    tr.appendChild(typeTd);

    const damageTd = document.createElement("td");
    damageTd.className = "damage-cell";
    if (ev.isMarker) {
      // 留空
    } else if (Array.isArray(ev.damage)) {
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

    if (showUsedSkillsOnly) {
      const usedTd = document.createElement("td");
      usedTd.className = "used-skills-cell";
      for (const g of jobGroups) {
        for (const skill of g.skills) {
          const cellState = stateBySkill.get(skill.id)?.get(ev.id);
          if (!cellState) continue;
          const usedHere = cellState.state === "used";
          const coveredHere = cellState.state === "locked" && cellState.covered;
          if (!usedHere && !coveredHere) continue;

          const wrap = document.createElement("span");
          wrap.className = `used-skill-icon-wrap${coveredHere ? " covered" : ""}`;
          if (usedHere) {
            // 只有真的排入的那一格能點擊取消，效果持續涵蓋的格子純顯示用（不知道要取消哪一次施放）。
            wrap.dataset.skillId = skill.id;
            wrap.dataset.eventId = ev.id;
            const usage = usageByKey.get(`${skill.id}|${ev.id}`);
            wrap.title = usage?.target ? `${skill.name}（指定：${usage.target}）\n點一下取消排入` : `${skill.name}\n點一下取消排入`;
          } else {
            wrap.title = `${skill.name}\n效果持續時間涵蓋這個事件`;
          }
          if (skill.icon) {
            const icon = document.createElement("img");
            icon.className = "skill-icon";
            icon.src = skill.icon;
            icon.alt = skill.name;
            icon.loading = "lazy";
            wrap.appendChild(icon);
          } else {
            const placeholder = document.createElement("span");
            placeholder.className = "resource-placeholder-icon";
            wrap.appendChild(placeholder);
          }
          usedTd.appendChild(wrap);
        }
      }
      tr.appendChild(usedTd);
      tbody.appendChild(tr);
      return;
    }

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

        // 這個技能會消耗職業資源（例如以太超流／百合／蛇膽）的話，資源不夠時即使沒在 CD 也不能點
        // （Spec：沒有資源的技能不能按）。
        const consumesResource = consumeFamiliesByJob.get(g.job)?.has(skill.familyKey) ?? false;
        let resourceOut = false;
        if (consumesResource && cellState.state === "available") {
          const gauge = gaugeByJob.get(g.job);
          const current = gauge ? gauge.states.get(ev.id) ?? gauge.max : null;
          resourceOut = current !== null && current <= 0;
        }

        // 限時技能（例如占星卡片）：還沒觸發前置技能、或前置技能的窗口已經失效（例如另一極抽卡把它蓋掉了），
        // 一樣不能點（Spec §data/skills.js availableAfter）。
        let notYetAvailable = false;
        let usedThisCycle = false;
        if (!resourceOut && cellState.state === "available" && skill.availableAfter) {
          const windowMap = availabilityBySkill.get(skill.id);
          notYetAvailable = windowMap ? !windowMap.get(ev.id) : false;
          if (!notYetAvailable) {
            // 已經在可施放窗口內，但這次持有期間已經發過牌了，要等下一次抽卡才能再發
            // （task.txt 占星資源需求：每個只能發一次）。
            const usedMap = usedSinceTriggerBySkill.get(skill.id);
            usedThisCycle = usedMap ? usedMap.get(ev.id) : false;
          }
        }

        const effectiveState = resourceOut || notYetAvailable || usedThisCycle ? "locked" : cellState.state;

        td.className = `skill-cell group-${skill.group} state-${effectiveState}${covered ? " covered" : ""}${resourceOut || notYetAvailable || usedThisCycle ? " resource-out" : ""}`;
        td.dataset.skillId = skill.id;
        td.dataset.eventId = ev.id;

        // 單體指定技能（Skill.assign === SINGLE_PARTY，例如神祝禱、安慰之心）已排入時，
        // 把打勾換成「指定隊友」的下拉選單，方便標記這次是發給誰（Spec：為了簡單只顯示職業前兩字）。
        if (effectiveState === "used" && skill.assign === "SINGLE_PARTY" && partyJobs?.length) {
          const usage = usageByKey.get(`${skill.id}|${ev.id}`);
          const select = document.createElement("select");
          select.className = "target-select";
          select.dataset.skillId = skill.id;
          select.dataset.eventId = ev.id;
          const blankOpt = document.createElement("option");
          blankOpt.value = "";
          blankOpt.textContent = "✓";
          select.appendChild(blankOpt);
          for (const job of partyJobs) {
            const opt = document.createElement("option");
            opt.value = job.id;
            opt.textContent = job.name.slice(0, 2);
            select.appendChild(opt);
          }
          // 選單會蓋住整個格子，點格子本身沒辦法再取消排入，所以額外提供一個「取消排入」選項。
          const cancelOpt = document.createElement("option");
          cancelOpt.value = CANCEL_USAGE_VALUE;
          cancelOpt.textContent = "✕ 取消排入";
          select.appendChild(cancelOpt);
          select.value = usage?.target ?? "";
          td.appendChild(select);
        } else {
          td.textContent = STATE_LABEL[effectiveState];
        }

        if (resourceOut) {
          const resourceLabel = g.resource ? `${g.resource.label}${g.resource.sublabel ? `／${g.resource.sublabel}` : ""}` : "資源";
          td.title = `${skill.name}\n沒有可消耗的${resourceLabel}`;
        } else if (notYetAvailable) {
          td.title = `${skill.name}\n目前不在可施放的時間窗口內（需要先用過對應的前置技能）`;
        } else if (usedThisCycle) {
          td.title = `${skill.name}\n這次已經發過牌了，要等下一次抽卡才能再發`;
        } else if (cellState.state === "locked") {
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

  // 事件委派：點擊技能格。「完整時間線」補的參考時間點跟真實事件一樣可以排入技能
  // （目的就是要能剛好卡在整點秒數開資源，例如 00:20、01:00）。
  tbody.addEventListener("click", (e) => {
    if (e.target.closest("select.target-select")) return; // 點的是指定隊友選單，不要連帶取消排入

    // 「只顯示使用技能」模式下，點技能圖示＝取消排入（這個精簡欄位沒有空格可以點來「新增」排入，
    // 只能取消已經排入的；要新增請關掉這個模式，回到完整的職業／技能欄位表格）。
    const usedIconWrap = e.target.closest(".used-skill-icon-wrap");
    if (usedIconWrap) {
      const { skillId, eventId } = usedIconWrap.dataset;
      const ev = events.find((e2) => e2.id === eventId);
      if (ev) onToggleUsage(skillId, ev);
      return;
    }

    const td = e.target.closest("td.skill-cell");
    if (!td || td.classList.contains("state-locked")) return;
    const skillId = td.dataset.skillId;
    const eventId = td.dataset.eventId;
    const ev = events.find((e2) => e2.id === eventId);
    if (ev) onToggleUsage(skillId, ev);
  });

  // 指定隊友下拉選單變更：一般選項只更新 target；選「取消排入」則整格取消（等同再點一次技能格）。
  tbody.addEventListener("change", (e) => {
    const select = e.target.closest("select.target-select");
    if (!select) return;
    const { skillId, eventId } = select.dataset;
    if (select.value === CANCEL_USAGE_VALUE) {
      const ev = events.find((e2) => e2.id === eventId);
      if (ev) onToggleUsage(skillId, ev);
      return;
    }
    onSetTarget(skillId, eventId, select.value);
  });

  const table = document.createElement("table");
  table.className = "planner-table";
  table.appendChild(colgroup);
  table.appendChild(thead);
  table.appendChild(tbody);

  container.replaceChildren(table);

  // 手機版需求：階段／時間／招式／目標／類型／傷害／結果傷害要凍結在左邊，橫向捲動時保持可見。
  // 「招式」欄寬度是動態的（依內容撐開），沒辦法用固定 CSS 數字算 left 偏移，
  // 所以在表格實際畫出來之後，直接量測 header 儲存格的實際寬度來算。
  applyStickyOffsets(table, fixedCols);
}

/**
 * 依序累加固定欄的實際渲染寬度，算出每欄要凍結在左邊多少 px，套用到 header 跟 body 對應的儲存格。
 * @param {HTMLTableElement} table
 * @param {[string, number][]} fixedCols [className, 初始建議寬度][]，順序就是欄位由左到右的順序
 */
function applyStickyOffsets(table, fixedCols) {
  const headRow1 = table.querySelector("thead tr:first-child");
  let left = 0;
  for (const [cls] of fixedCols) {
    const th = headRow1.querySelector(`th.${cls}`);
    const px = `${left}px`;
    for (const el of table.querySelectorAll(`.${cls}`)) el.style.left = px;
    left += th ? th.getBoundingClientRect().width : 0;
  }
}
