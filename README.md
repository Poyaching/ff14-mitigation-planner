# FF14 Mitigation Planner

團隊減傷／排軸規劃工具（草稿 / MVP 第一階段）。詳細規格見 [`FF14_Mitigation_Planner_Spec.md`](./FF14_Mitigation_Planner_Spec.md)。

## 目前完成範圍（對應 Spec §27 MVP）

- 真正的 HTML `<table>`，Phase 用 `rowspan`、Mitigation 表頭用 `colspan`
- AttackEvent / Skill / SkillUsage 三種資料分離
- 技能資料來源為 `ff14_mitigation_skills_normalized.json`（14 個職業、含技能圖示、多充能、
  減傷／護盾／治療數值），依職業拆分成 `skills/skill_<CODE>.json` 多個檔案（見下方「技能資料格式」），
  啟動時以迴圈 `fetch` 動態載入所有分檔並合併，新增職業只需新增對應分檔、不用改讀取邏輯，
  並依目前等級挑出每個技能生效中的版本（同一招式在不同等級會有不同 CD／充能／效果）
- Hamburger 設定面板：排軸名稱、副本名稱、等級、顯示分類（減傷／護盾／治療／其他）、
  隊伍職業勾選（依坦克／治療／近戰／遠程／法系分組）
- 等級篩選（技能 `level` 高於目前等級時隱藏欄位）
- 點擊技能格排入 / 取消 SkillUsage，CD Lock 自動計算並即時重新計算，支援多充能技能
- Mitigation 底下再依職業分組（colspan 表頭），方便找到特定職業的技能；技能表頭只顯示圖示
  與分類色條／充能數（×N），技能名稱、CD、目標、減傷或護盾數值改為 hover tooltip
- CD 中的格子區分「效果仍在持續涵蓋範圍內」與「純粹在等 CD」兩種底色
- 職業資源計量條與觸發技能分開呈現：「資源」欄位是唯讀計量條，旁邊另外有一個真正可點擊、有自己 CD 的
  觸發技能欄位
  - 學者「資源」＝以太超流（3 層、無自動回復）：`以太超流`技能欄位（CD 60s）／`轉化`重置滿層，
    `野戰治療陣`／`不屈不撓之策`／`生命活性法`／`深謀遠慮之策` 各消耗 1 層，`秘策` 可讓其中一次消耗免費；
    `能量吸收`（Energy Drain，10 級）已收錄在原始資料中
  - 賢者「蛇膽」（3 層、每 20 秒自動回 1 層）：`堅角清汁`／`寄生清汁`／`靈橡清汁`／`白牛清汁` 各消耗 1 層，
    `根素`（Rhizomata，74 級）補回 1 層，且一定顯示不受分類篩選影響
  - 依已排入的 SkillUsage 逐格自動計算並以圓點顯示（`src/engine/resource.js`）
- Damage／Mitigation 之間的「結果傷害」欄位：已接上簡化版計算（`src/engine/damage.js`），依目前排入的
  減傷技能（不含護盾）逐時間點算出隊伍實際受到的傷害，減傷之間採乘法疊加；因為 AttackEvent 沒有記錄
  「誰是坦克」，自身／單體類減傷簡化為只套用在 `target＝tank` 的事件上，條件式減傷（conditionalMitigation）
  暫不計算
- 深色主題，介面文字皆為中文
- 多場次：可另外新增／切換／刪除場次，所有場次自動存放在瀏覽器 localStorage
- 匯出全部場次成一個 JSON 檔／可再匯入回來（新場次會用新 id 加入，不會覆蓋現有場次）
- 匯入 CSV（`Phase,Time,Action,Target,Type,Damage`），Top Bar 提供「下載 CSV 範本」
  （[`duty-timeline-template.csv`](./duty-timeline-template.csv)）
- 重設（只清除 SkillUsage，不動副本資料）

尚未實作（見 Spec §28、§29）：DoT/Tick 展開、CSV 匯入多段傷害（同一擊多次的資料）、
結果傷害的條件式減傷（conditionalMitigation）與更精確的目標歸屬判斷。

## 本機預覽

因為使用原生 ES module（`<script type="module">`），需要透過本機伺服器開啟，不能直接用 `file://` 開啟 `index.html`。例如：

```bash
npx serve .
# 或
python -m http.server 8000
```

然後開啟瀏覽器造訪顯示的網址。

## 部署

純前端、無需後端，可直接部署至 GitHub Pages（將本專案 push 到 repo 後於 Settings → Pages 啟用即可）。

## 專案結構

```text
index.html
ff14_mitigation_skills_normalized.json  — 技能原始資料母檔（職業／等級／CD／充能／效果，欄位說明見下方）
skills/
  skill_<CODE>.json                     — 由母檔拆分出的分檔，CODE 為職業代碼（如 skill_SCH.json）
                                           或共用招式的角色分組代碼（skill_TANK.json／skill_MELEE.json／
                                           skill_CASTER.json），由 scripts/split-skills.js 產生，
                                           app 實際載入的是這裡的分檔而非母檔
scripts/
  split-skills.js                       — 一次性工具：把母檔依職業拆分成 skills/skill_<CODE>.json；
                                           母檔內容更新後，重新執行本腳本即可重新產生所有分檔
duty-timeline-template.csv              — CSV 匯入範本
src/
  app.js              — 進入點，狀態管理，場次（多場次／localStorage／匯出入）
  styles.css
  utils.js            — 時間／傷害格式化、下載 JSON
  data/
    sample-duty.js     — 範例 AttackEvent[]
    skills.js           — 依職業迴圈載入 skills/skill_<CODE>.json 並整理技能資料
                           （等級版本挑選、職業清單、分類、資源欄位設定）
    csv.js               — CSV → AttackEvent[]
    storage.js           — 場次的 localStorage 讀寫
  engine/
    cooldown.js          — CD Lock 計算（含多充能）
    resource.js           — 職業資源計量條計算（以太超流／蛇膽）
    damage.js              — 結果傷害計算（簡化版減傷疊加）
  ui/
    planner-table.js     — 主表格渲染
    settings-drawer.js   — 左側設定面板（含場次管理）
    toolbar.js            — Top Bar（匯入／重設／匯出入全部場次／CSV 範本／名稱同步）
```

## 技能資料格式

母檔 `ff14_mitigation_skills_normalized.json` 是單一 JSON 物件，結構如下：

```ts
{
  jobCodes:   Record<string, string>,  // 職業全名 → 職業代碼，例如 "學者": "SCH"
  roleGroups: Record<string, string>,  // 角色分組全名 → 角色代碼，例如 "坦": "TANK"
  skills:     Skill[],                 // 技能清單（見下方）
}
```

`jobCodes` 目前有 14 個職業：`SCH`（學者）、`SGE`（賢者）、`AST`（占星術師）、`WHM`（白魔道士）、
`DNC`（舞者）、`WAR`（戰士）、`PLD`（騎士）、`DRK`（暗黑騎士）、`GNB`（絕槍戰士）、`BRD`（吟遊詩人）、
`MNK`（武僧）、`MCH`（機工士）、`PCT`（繪靈法師）、`RDM`（赤魔道士）。

`roleGroups` 有 3 個角色分組：`TANK`（坦）、`MELEE`（近戰）、`CASTER`（法師）。沒有標記 `job`、
只標記 `roleGroup` 的技能是「整個角色共用」的技能（例如坦克共用的雪仇、鐵壁；近戰共用的牽制；
法師共用的昏亂），本專案載入時會把這些技能展開給該角色分組底下、資料中實際存在的每個職業。

執行 `node scripts/split-skills.js` 會把母檔的 `skills` 依 `job`（沒有 `job` 就用 `roleGroup`）
拆分成 `skills/skill_<CODE>.json`，每個分檔就是屬於該職業（或該共用分組）的 `Skill[]` 陣列，
結構跟母檔 `skills` 裡的元素完全一樣，只是不再包著 `jobCodes`／`roleGroups`／`skills` 這層外殼。
`src/data/skills.js` 啟動時會依 `JOB_NAME`／`ROLE_JOBS` 這兩份設定（各職業／角色分組代碼）
用迴圈把所有存在的分檔 `fetch` 回來合併，找不到的分檔（例如目前沒有共用招式的治療／遠程分組）
會視為空清單、不會報錯；新增職業時只需要在 `skills.js` 補上該職業設定、新增對應分檔即可，
不必修改讀取邏輯。若母檔內容有更新，重新執行一次 `split-skills.js` 即可重新產生所有分檔。

### Skill 物件欄位

同一招式會有「多個等級節點」（每次數值／效果隨等級成長就多一筆），並非最終技能列表；
本專案在 `src/data/skills.js` 會依目前設定的等級，取「等級 ≤ 目前等級」中最大的那個節點使用。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | string | 技能節點唯一 ID（`skill_` + 雜湊）。同一招式不同等級節點的 `id` 不同。 |
| `job` | string？ | 所屬職業代碼（對應 `jobCodes` 的值）。角色共用技能沒有這個欄位，改用 `roleGroup`。 |
| `roleGroup` | string？ | 角色分組代碼（`TANK`／`MELEE`／`CASTER`），只有角色共用技能才有。 |
| `sourceRole` | string | 原始資料裡的職業／角色顯示名稱。語言不統一（部份是日文如「タンク」，部份已是中文如「學者」），僅供除錯對照，不建議直接顯示。 |
| `name` | `{ ja, en, de, fr, ko, zhCN }` | 六種語言的技能名稱。本專案主要用 `zhCN` 顯示、`en` 產生穩定的 slug id。 |
| `level` | number | 這個節點生效的等級門檻。 |
| `iconUrl` | string | 技能圖示網址（xivapi.com）。 |
| `ability` | boolean | `true`＝技能（Ability，走專屬冷卻）；`false`＝法術（Spell，走一般 GCD，`cooldown` 通常是 2.5）。 |
| `assign` | enum | 目標範圍：`SELF` 自身／`RANGE_PARTY` 隊伍範圍／`SINGLE_PARTY` 隊伍單體／`SINGLE_ENEMY` 敵方單體／`RANGE_ENEMY` 敵方範圍。 |
| `charges` | number | 同時可持有的充能數（多數是 1）。 |
| `cooldown` | number | 冷卻時間（秒）。 |
| `precondition` | string？ | 前置條件（日文，`\|` 分隔多個可能的前置 buff），例如幹預需要先有鐵壁／預警其中之一。只有少數技能有這個欄位。 |
| `resource` | `{ mp }`？ | 施放所需 MP，目前只出現在會消耗 MP 的治療咒文上。 |
| `availability` | `{ duration, skill }`？ | 只有在另一個技能（`skill`，日文名）效果期間（`duration` 秒）內才能使用，例如慰藉只有在熾天召喚期間可用。 |
| `effects` | object | 技能效果數值，見下方。 |

### `effects` 子欄位

一個技能可能同時具備多種效果：

| 欄位 | 型別 | 說明 |
|---|---|---|
| `duration` | number | 效果／增益持續時間（秒）。 |
| `mitigation` | `{ duration, magic, physical, unique, block?, parry? }` | 減傷。`magic`／`physical`／`unique` 是「傷害倍率」而非百分比（`0.9` ＝傷害變成 90%，即減傷 10%）；`unique` 通常對應特殊／真傷；`block`／`parry` 是額外的格擋／招架加成。 |
| `barrier` | `{ effect: { amount, duration? }, buff?: { duration, multiplier }, additional?: { duration, amount } }` | 護盾。`effect.amount` 是護盾潛力值；`buff` 是額外的治療量加成（`multiplier` 為百分比）；`additional` 是額外附加的護盾量。 |
| `healing` | `{ heal?, hot?: { duration, amount }, target?, duration?, timesHealBuffed?, moreHeal?, addHealBuffed?, healRatio? }` | 治療。`heal` 直接治療潛力值；`hot` 持續治療（duration/amount 為秒數與每跳潛力值）；`target` 是套用對象的內部代碼；`timesHealBuffed`／`moreHeal`／`addHealBuffed`／`healRatio` 都是不同情境下的治療量加成係數。 |
| `hpBuff` | `{ duration, multiplier }` | 提升最大 HP 的倍率（例如戰士戰栗）。 |
| `criticalMitigation` | `{ duration, magic, physical, unique }` | 額外的必殺減傷效果，通常持續時間比主要減傷短，是主減傷效果的加強版。 |
| `conditionalMitigation` | `{ magic, physical, unique }` | 需要搭配 `precondition` 才會生效的額外減傷。 |

本專案（`src/data/skills.js`）依 `effects` 內容把技能歸成四類（`group`）：有 `mitigation` 就是「減傷」、
其次 `barrier` 是「護盾」、其次 `healing` 是「治療」，其餘算「其他」，作為設定面板的分類篩選依據。
