// 一次性工具：把 ff14_mitigation_skills_normalized.json 依「職業」／「共用招式所屬角色分類（roleGroup）」
// 拆分成 skills/skill_<CODE>.json 多個檔案，供 src/data/skills.js 用迴圈動態讀取。
// 之後若要更新資料，直接修改對應的 skill_<CODE>.json 即可；若母檔（ff14_mitigation_skills_normalized.json）
// 有更新，重新執行本腳本（node scripts/split-skills.js）即可重新產生所有分檔。

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SOURCE = path.join(ROOT, "ff14_mitigation_skills_normalized.json");
const OUT_DIR = path.join(ROOT, "skills");

const raw = JSON.parse(fs.readFileSync(SOURCE, "utf8"));

/** @type {Map<string, any[]>} */
const byCode = new Map();
for (const s of raw.skills) {
  const code = s.job || s.roleGroup; // 有 job 就依職業分檔，否則依共用的 roleGroup 分檔
  if (!code) {
    console.warn("略過：找不到 job／roleGroup", s.id);
    continue;
  }
  if (!byCode.has(code)) byCode.set(code, []);
  byCode.get(code).push(s);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [code, skills] of byCode) {
  const file = path.join(OUT_DIR, `skill_${code}.json`);
  fs.writeFileSync(file, JSON.stringify(skills, null, 2) + "\n", "utf8");
  console.log(`寫入 ${file}（${skills.length} 筆）`);
}

console.log(`完成，共 ${byCode.size} 個檔案，${raw.skills.length} 筆技能。`);
