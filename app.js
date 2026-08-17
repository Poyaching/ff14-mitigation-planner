const state = {
  level: 70,
  jobs: ["SCH"],
  usages: {},
  events: [
    { id: "e0", time: 0, phase: "P1", action: "戰闘開始！", target: "party", type: "magic", damage: 0 },
    { id: "e1", time: 4, phase: "P1", action: "AA", target: "tank", type: "physical", damage: 12000 },
    { id: "e2", time: 7, phase: "P1", action: "阿斯卡隆之威", target: "tank", type: "physical", damage: 28000 },
    { id: "e3", time: 18, phase: "P1", action: "AA", target: "tank", type: "physical", damage: 12000 },
    { id: "e4", time: 24, phase: "P1", action: "AA", target: "tank", type: "physical", damage: 12000 },
    { id: "e5", time: 25, phase: "P1", action: "阿斯卡隆之威", target: "tank", type: "physical", damage: 28000 },
    { id: "e6", time: 31, phase: "P1", action: "AA", target: "tank", type: "physical", damage: 12000 },
    { id: "e7", time: 43, phase: "P1", action: "AA", target: "tank", type: "physical", damage: 12000 },
    { id: "e8", time: 54, phase: "P1", action: "百雷", target: "party", type: "magic", damage: 51000 },
    { id: "e9", time: 55, phase: "P1", action: "AA", target: "tank", type: "physical", damage: 12000 },
    { id: "e10", time: 62, phase: "P1", action: "邪龍魔炎", target: "party", type: "magic", damage: 48000 },
    { id: "e11", time: 63, phase: "P1", action: "AA", target: "tank", type: "physical", damage: 12000 },
    { id: "e12", time: 67, phase: "P1", action: "古代爆震", target: "party", type: "magic", damage: 42000 },
    { id: "e13", time: 68, phase: "P1", action: "AA", target: "tank", type: "physical", damage: 12000 },
    { id: "e14", time: 69, phase: "P1", action: "阿斯卡隆之威", target: "tank", type: "physical", damage: 28000 },
    { id: "e15", time: 93, phase: "P2", action: "聖鎖", target: "party", type: "magic", damage: 45000 },
    { id: "e16", time: 99, phase: "P2", action: "信仰(塔)", target: "party", type: "magic", damage: 60000 }
  ],
  jobsCatalog: [
    ["SCH", "學者"], ["SGE", "賢者"], ["WHM", "白魔導士"], ["AST", "占星術師"],
    ["PLD", "騎士"], ["WAR", "戰士"], ["DRK", "暗黑騎士"], ["GNB", "絕槍戰士"],
    ["BRD", "詩人"]
  ],
  skills: [
    ["s1", "SCH", "鼓舞激勵之策", 30, 0, "◈", "blue"],
    ["s2", "SCH", "野戰治療陣", 50, 30, "◇", "blue"],
    ["s3", "SCH", "幻光", 40, 120, "✦", "blue"],
    ["s4", "SCH", "不屈不撓之策", 40, 30, "✚", "blue"],
    ["s5", "SCH", "轉化", 60, 180, "△", "blue"],
    ["s6", "SGE", "Kerachole", 50, 30, "✧", "green"],
    ["s7", "SGE", "Haima", 70, 120, "◉", "green"],
    ["s8", "WHM", "節制", 80, 120, "✚", "green"],
    ["s9", "PLD", "聖光幕簾", 70, 120, "▣", "green"],
    ["s10", "WAR", "原初的勇猛", 76, 25, "◆", "green"],
    ["s11", "DRK", "暗影牆", 70, 120, "⬢", "green"],
    ["s12", "GNB", "石之心", 68, 25, "◇", "green"]
  ].map(x => ({
    id: x[0], job: x[1], name: x[2], level: x[3],
    cd: x[4], icon: x[5], group: x[6]
  }))
};

const $ = id => document.getElementById(id);

function fmt(t) {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(2).padStart(5, "0");
  return `${String(m).padStart(2, "0")}:${s}`;
}

function skills() {
  return state.skills.filter(s =>
    state.jobs.includes(s.job) && s.level <= state.level
  );
}

function used(skill, event) {
  return !!state.usages[`${skill.id}:${event.id}`];
}

function lastUse(skill, time) {
  return Object.keys(state.usages)
    .filter(key => key.startsWith(`${skill.id}:`))
    .map(key => state.events.find(e => e.id === key.split(":")[1])?.time)
    .filter(t => t != null && t < time)
    .sort((a, b) => b - a)[0] ?? null;
}

function status(skill, event) {
  if (used(skill, event)) return "used";
  const last = lastUse(skill, event.time);
  return last != null && event.time < last + skill.cd ? "locked" : "available";
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(window._toast);
  window._toast = setTimeout(() => toast.classList.remove("show"), 1800);
}

function toggleSkill(skill, event) {
  const key = `${skill.id}:${event.id}`;

  if (used(skill, event)) {
    delete state.usages[key];
    render();
    return;
  }

  if (status(skill, event) === "locked") {
    showToast(`${skill.name} CD 中｜下次可用 ${fmt(lastUse(skill, event.time) + skill.cd)}`);
    return;
  }

  state.usages[key] = true;
  render();
}

function renderJobs() {
  $("jobs").innerHTML = state.jobsCatalog.map(job => `
    <label class="job">
      <input type="checkbox" data-job="${job[0]}" ${state.jobs.includes(job[0]) ? "checked" : ""}>
      <code>${job[0]}</code>
      <span>${job[1]}</span>
    </label>
  `).join("");

  document.querySelectorAll("[data-job]").forEach(input => {
    input.onchange = () => {
      if (input.checked) {
        if (!state.jobs.includes(input.dataset.job)) state.jobs.push(input.dataset.job);
      } else {
        state.jobs = state.jobs.filter(job => job !== input.dataset.job);
      }
      render();
    };
  });
}

function render() {
  renderJobs();

  const ss = skills();
  const n = ss.length;

  $("levelText").textContent = state.level;
  $("jobCount").textContent = state.jobs.length;

  let html = `
    <div class="row headerTop" style="--n:${n}">
      <div class="cell leftHeader">Phase</div>
      <div class="cell leftHeader">Time</div>
      <div class="cell actionHeader">Action</div>
      <div class="cell dataHeader">Target</div>
      <div class="cell dataHeader">Type</div>
      <div class="cell dataHeader damageHeader">Damage</div>
  `;

  let i = 0;
  while (i < n) {
    const group = ss[i].group;
    const start = i;
    while (i < n && ss[i].group === group) i++;
    html += `
      <div class="cell group ${group}" style="grid-column:${7 + start} / ${7 + i}">
        Mitigation
      </div>
    `;
  }
  html += `</div>`;

  html += `
    <div class="row headerBottom" style="--n:${n}">
      <div class="cell"></div>
      <div class="cell"></div>
      <div class="cell"></div>
      <div class="cell"></div>
      <div class="cell"></div>
      <div class="cell"></div>
  `;

  ss.forEach(skill => {
    html += `
      <div class="cell skillHead ${skill.group}" title="${skill.name}">
        <div class="skillIcon">${skill.icon}</div>
      </div>
    `;
  });
  html += `</div>`;

  for (const event of state.events) {
    html += `
      <div class="row" style="--n:${n}">
        <div class="cell phaseCell">${event.phase}</div>
        <div class="cell timeCell"><span class="timePrimary">${fmt(event.time)}</span></div>
        <div class="cell actionCell">${event.action}</div>
        <div class="cell dataCell">${event.target}</div>
        <div class="cell dataCell">${event.type}</div>
        <div class="cell dataCell damageCell">${event.damage ? event.damage.toLocaleString() : "-"}</div>
    `;

    ss.forEach(skill => {
      const st = status(skill, event);
      const locked = st === "locked";
      const next = locked ? fmt(lastUse(skill, event.time) + skill.cd) : "";

      html += `
        <div
          class="cell skillCell ${skill.group} ${st}"
          data-skill="${skill.id}"
          data-event="${event.id}"
          title="${locked ? `CD 中｜下次可用 ${next}` : skill.name}"
        >
          <button class="box" type="button">
            ${st === "used" ? "✓" : locked ? "🔒" : ""}
          </button>
        </div>
      `;
    });

    html += `</div>`;
  }

  $("sheet").innerHTML = html;

  document.querySelectorAll(".skillCell[data-skill]").forEach(cell => {
    cell.onclick = () => {
      const skill = ss.find(s => s.id === cell.dataset.skill);
      const event = state.events.find(e => e.id === cell.dataset.event);
      toggleSkill(skill, event);
    };
  });
}

$("menuBtn").onclick = () => $("drawer").classList.add("open");
$("closeBtn").onclick = () => $("drawer").classList.remove("open");

$("level").onchange = event => {
  state.level = Number(event.target.value);
  render();
};

$("planName").oninput = event => {
  $("drawerName").value = event.target.value;
};

$("drawerName").oninput = event => {
  $("planName").value = event.target.value;
};

$("resetBtn").onclick = () => {
  state.usages = {};
  render();
  showToast("已清除排軸");
};

$("importBtn").onclick = () => $("fileInput").click();

$("fileInput").onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;

  const lines = (await file.text()).split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    showToast("CSV 沒有資料");
    return;
  }

  const header = lines.shift().split(",").map(x => x.trim());

  const findColumn = (...names) => {
    for (const name of names) {
      const index = header.findIndex(h => h.toLowerCase() === name.toLowerCase());
      if (index >= 0) return index;
    }
    return -1;
  };

  const timeIndex = findColumn("Time", "時間");
  const actionIndex = findColumn("Action", "攻擊名稱");
  const phaseIndex = findColumn("Phase", "phase");
  const targetIndex = findColumn("Target", "target", "被攻擊對象");
  const typeIndex = findColumn("Type", "type", "攻擊類型");
  const damageIndex = findColumn("Damage", "damage", "攻擊傷害");

  if (timeIndex < 0 || actionIndex < 0) {
    showToast("CSV 至少需要 Time / Action 欄位");
    return;
  }

  function parseTime(value) {
    const parts = String(value).trim().split(":").map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return Number(value);
  }

  state.events = lines.map((line, index) => {
    const cols = line.split(",");
    const time = parseTime(cols[timeIndex] ?? "0");
    return {
      id: `csv-${Date.now()}-${index}`,
      time,
      phase: phaseIndex >= 0 ? (cols[phaseIndex] || "P1") : "P1",
      action: cols[actionIndex] || "Unknown",
      target: targetIndex >= 0 ? (cols[targetIndex] || "-") : "-",
      type: typeIndex >= 0 ? (cols[typeIndex] || "-") : "-",
      damage: damageIndex >= 0
        ? Number(String(cols[damageIndex] || "0").replace(/,/g, "")) || 0
        : 0
    };
  }).filter(event => Number.isFinite(event.time))
    .sort((a, b) => a.time - b.time);

  state.usages = {};
  render();
  showToast(`已匯入 ${state.events.length} 筆事件`);
};

render();
