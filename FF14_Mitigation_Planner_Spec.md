# FF14 Mitigation Planner — 規格說明

> Draft / Prototype Specification  
> 本文件整理目前討論出的產品需求、資料模型、畫面結構與排版規則，作為後續開發基準。

---

## 1. 專案定位

FF14 團隊減傷／排軸規劃工具。

核心用途：

1. 匯入或建立副本攻擊時間軸。
2. 選擇玩家隊伍職業與等級。
3. 在時間軸上安排減傷技能。
4. 依技能 CD / Charges 等限制自動鎖定不可使用的格子。
5. 後續加入學者、賢者等職業的資源管理。
6. 計算減傷後的最終傷害。
7. 讓玩家快速檢查「這個攻擊用了哪些減傷」及「技能下一次可用時間」。

部署目標：**純前端、輕量化、GitHub Pages**。目前不需要後端。

---

# 2. 核心設計原則

## 2.1 使用真正的 HTML Table

核心 UI 必須使用：

```html
<table>
  <colgroup>...</colgroup>
  <thead>...</thead>
  <tbody>...</tbody>
</table>
```

不要使用 `div + CSS Grid` 模擬表格。

原因：

- Phase 使用 `rowspan`
- Mitigation 使用 `colspan`
- 每一列就是一個 Attack Event
- 每一欄就是一個資料欄或技能欄
- HTML table 與實際資料結構一致

---

# 3. 畫面結構

```text
┌─────────────────────────────────────────────────────────────┐
│ ☰ │ 匯入 CSV │ 重設 │ 排軸名稱                              │
├─────────────────────────────────────────────────────────────┤
│ Lv.70   9 jobs                                   提示文字 │
├───────┬────────┬──────────────┬────────┬──────┬──────┬──────┤
│ Phase │ Time   │ Action       │ Target │ Type │Damage│      │
│       │        │              │        │      │      │Mitig.│
├───────┼────────┼──────────────┼────────┼──────┼──────┼──────┤
│ P1    │ 00:04  │ AA           │ tank   │ phys │12000 │ □    │
│       │ 00:07  │ 阿斯卡隆之威 │ tank   │ phys │28000 │ ✓    │
│       │ 00:18  │ AA           │ tank   │ phys │12000 │ 🔒   │
└───────┴────────┴──────────────┴────────┴──────┴──────┴──────┘
```

---

# 4. Top Bar

```text
☰   匯入 CSV   重設   [排軸名稱]
```

### Hamburger

開啟左側設定面板：

- 排軸名稱
- 副本名稱
- 等級
- 隊伍職業

### 排軸名稱

例如：

```text
極月讀 Lv70 學者練習
```

Top Bar 與設定面板同步。

### 匯入 CSV

初期支援：

```text
Phase
Time
Action
Target
Type
Damage
```

### 重設

只清除玩家排入的 `SkillUsage[]`，不刪除副本資料。

---

# 5. 設定面板

## 基本資料

```text
名稱
副本
等級
```

## 隊伍職業

例如：

```text
☑ SCH  學者
☑ SGE  賢者
☐ WHM  白魔導士
☐ AST  占星術師
☐ PLD  騎士
...
```

勾選職業後，該職業技能加入 table；取消後移除。

---

# 6. 等級

支援：

```text
50 / 60 / 70 / 80 / 90 / 100
```

技能具有：

```ts
level: number
```

若：

```ts
skill.level > currentLevel
```

則不顯示。

---

# 7. Table 欄位

目前：

```text
Phase
Time
Action
Target
Type
Damage
Mitigation
```

## Phase

例如：

```text
P1
P2
P3
```

同一 Phase 使用真正的 HTML：

```html
rowspan
```

而不是每一列重複寫 P1。

## Time

資料以秒數儲存：

```ts
time: 13.24
```

畫面格式化成：

```text
00:13.24
```

## Action

王的攻擊名稱：

```text
AA
阿斯卡隆之威
百雷
邪龍魔炎
古代爆震
```

## Target

初期：

```text
tank
party
player
```

未來可擴充：

```text
MT
OT
random
specific
```

## Type

初期：

```text
physical
magic
```

未來可加入：

```text
true
```

## Damage

原始攻擊傷害：

```ts
damage: 51000
```

畫面：

```text
51,000
```

---

# 8. AttackEvent

建議資料模型：

```ts
interface AttackEvent {
  id: string;
  time: number;
  phase: string;
  action: string;
  target: string;
  type: "physical" | "magic" | "true";
  damage: DamageData | DamageData[];
  notes?: string;
}
```

例如：

```ts
{
  id: "event_001",
  time: 13.24,
  phase: "P1",
  action: "責難",
  target: "party",
  type: "magic",
  damage: {
    amount: 51000,
    kind: "hit"
  }
}
```

---

# 9. DamageData

因為需要支援 Hit / DoT / Tick，不建議只存一個 number。

```ts
interface DamageData {
  amount: number;
  kind: "hit" | "dot" | "tick";
  duration?: number;
  interval?: number;
}
```

---

# 10. 多段傷害

例如三段攻擊：

```ts
damage: [
  {
    time: 26.22,
    amount: 18000,
    kind: "hit"
  },
  {
    time: 28.22,
    amount: 18000,
    kind: "hit"
  },
  {
    time: 30.04,
    amount: 18000,
    kind: "hit"
  }
]
```

UI 可以仍顯示一個機制：

```text
00:26.22  黃泉之槍
```

Engine 則知道實際有三段傷害。

---

# 11. DoT

不一定需要逐 Tick 儲存。

例如：

```ts
{
  amount: 5000,
  kind: "dot",
  duration: 15,
  interval: 3
}
```

Engine 可以展開成：

```text
60.00
63.00
66.00
69.00
72.00
```

---

# 12. Skill

技能資料與副本資料分離。

```ts
interface Skill {
  id: string;
  job: string;
  name: string;
  level: number;
  cooldown: number;
  charges?: number;
  icon?: string;
  group: string;
}
```

例如：

```ts
{
  id: "sch_illumination",
  job: "SCH",
  name: "幻光",
  level: 40,
  cooldown: 120,
  charges: 1,
  icon: "...",
  group: "mitigation"
}
```

---

# 13. SkillUsage

玩家排軸資料：

```ts
interface SkillUsage {
  skillId: string;
  eventId: string;
  time: number;
}
```

例如：

```ts
{
  skillId: "sch_illumination",
  eventId: "event_001",
  time: 13.24
}
```

---

# 14. 為什麼 Mitigation 不直接存進 AttackEvent

不建議：

```ts
mitigations: [
  "sch_lustrate",
  "sch_protraction"
]
```

因為：

- AttackEvent = 副本原始資料
- Skill = 技能資料
- SkillUsage = 玩家排軸

三者應分離。

關係：

```text
AttackEvent[]
      +
Skill[]
      +
SkillUsage[]
      ↓
Damage Engine
```

玩家取消技能時，不需要修改副本資料。

---

# 15. CD Lock

例如技能 CD = 120 秒：

```text
00:00  ✓
00:30  🔒
01:00  🔒
02:00  □
```

點擊 CD 中的格子不可新增 SkillUsage。

可提示：

```text
幻光 CD 中
下次可用：02:00
```

取消前面的技能後，後續 Lock 必須重新計算。

---

# 16. Charges

未來支援：

```ts
charges: 2
```

例如：

```text
00:00  ✓
00:30  ✓
00:45  🔒
```

需要另外建立 Charge regeneration 邏輯。

目前尚未實作。

---

# 17. 學者 / 賢者 Resource

後續重要功能。

需要支援：

- 學者資源
- 賢者資源
- 技能消耗
- 資源恢復

但目前已確認：

> **不要自動做「預留資源」。**

玩家自行決定是否保留資源。

工具只負責顯示／計算目前資源狀態。

---

# 18. Damage Engine

後續：

```text
Original Damage
      ↓
Active Mitigation
      ↓
Reduction
      ↓
Barrier
      ↓
Final Damage
```

例如：

```text
原始傷害 51,000
       ↓
幻光
       ↓
野戰治療陣
       ↓
最終傷害
```

精確 FF14 減傷公式尚待正式資料確認。

---

# 19. Mitigation UI

右側技能矩陣：

```text
┌────────────────────────────┐
│          Mitigation        │
├────┬────┬────┬────┬───────┤
│ 技能│ 技能│ 技能│ 技能│ 技能  │
├────┼────┼────┼────┼───────┤
│ □  │ □  │ ✓  │ 🔒 │ □     │
│ □  │ ✓  │ 🔒 │ □  │ □     │
└────┴────┴────┴────┴───────┘
```

狀態：

- `□` = 可以使用
- `✓` = 已排入
- `🔒` = CD 中

---

# 20. Header

兩層 Header。

第一層：

```text
Phase | Time | Action | Target | Type | Damage | Mitigation
```

第二層：

```text
                                      Skill Skill Skill Skill
```

Mitigation 使用：

```html
<th colspan="N">Mitigation</th>
```

技能各自一欄。

---

# 21. 排版

目標是：

> **Excel / Spreadsheet 型高密度矩陣。**

不是卡片式 UI。

建議初始欄寬：

```text
Phase   ~70px
Time    ~72px
Action  ~260–300px
Target  ~78px
Type    ~78px
Damage  ~88px
Skill   ~42–44px
```

這些是初始值，可依實際畫面調整。

---

# 22. Row Height

目標：

```text
約 38px / event
```

原因是副本可能有大量事件，需要在一個畫面看到較多時間軸。

---

# 23. CSV

初期：

```csv
Phase,Time,Action,Target,Type,Damage
P1,00:04,AA,tank,physical,12000
P1,00:07,阿斯卡隆之威,tank,physical,28000
P1,00:54,百雷,party,magic,51000
```

轉換成：

```ts
AttackEvent[]
```

CSV 只負責副本資料，不包含玩家排軸結果。

---

# 24. 建議專案結構

```text
/
├── index.html
├── src/
│   ├── app.ts
│   ├── models/
│   │   ├── attack-event.ts
│   │   ├── damage.ts
│   │   ├── skill.ts
│   │   └── skill-usage.ts
│   ├── engine/
│   │   ├── cooldown.ts
│   │   ├── charges.ts
│   │   ├── resource.ts
│   │   └── damage.ts
│   └── ui/
│       ├── planner-table.ts
│       ├── settings-drawer.ts
│       └── toolbar.ts
├── data/
│   ├── jobs/
│   │   ├── sch.json
│   │   ├── sge.json
│   │   └── ...
│   └── duties/
│       └── extreme-tsukuyomi.json
└── README.md
```

---

# 25. 技術方向

目前適合：

```text
TypeScript
+
原生 HTML
+
CSS
```

不需要：

```text
Backend
Database Server
API Server
```

部署：

```text
GitHub Pages
```

資料直接放：

```text
JSON
CSV
```

---

# 26. Framework

目前沒有必要使用 React / Vue / Svelte。

因為核心 UI 是高度規則化的資料表。

若未來增加：

- 複雜拖曳
- 多版本排軸
- Undo / Redo
- 大量狀態管理
- 多人協作

再考慮 framework。

目前優先保持輕量。

---

# 27. MVP

第一階段：

## 資料

- AttackEvent
- Skill
- SkillUsage

## UI

- Hamburger
- 基本資料
- 等級
- 職業勾選
- 真正 HTML table
- Phase / Time / Action / Target / Type / Damage
- Mitigation skill columns

## Engine

- Level filter
- CD Lock
- Skill Usage
- Cancel / Recalculate

## Import

- CSV

---

# 28. 第二階段

加入：

- Charges
- 多段 Hit
- DoT / Tick
- Resource
- 學者資源
- 賢者資源
- 手動 Resource Reservation

---

# 29. 第三階段

加入：

- Mitigation calculation
- Barrier calculation
- Final Damage
- 多個減傷疊加
- Overmitigation / wasted mitigation 顯示

---

# 30. 尚未決定

以下先不要寫死：

1. FF14 正式技能資料來源
2. 技能圖示來源
3. 精確減傷疊加公式
4. Barrier 計算方式
5. 多段傷害最終資料格式
6. DoT 是否在 UI 展開
7. Charges regeneration 模型
8. Resource 精確模型
9. Target 完整 enum
10. 是否支援拖曳技能
11. 是否支援直接輸入時間
12. 是否支援排軸版本儲存／匯出

---

# 31. 開發順序

```text
① Table Layout
       ↓
② AttackEvent / Skill / SkillUsage
       ↓
③ 職業 + 等級
       ↓
④ CD Lock / Charges
       ↓
⑤ Resource
       ↓
⑥ Damage Engine
       ↓
⑦ CSV / JSON import & export
```

目前不要先做 Damage Engine。

第一優先是把：

> **副本事件 × 技能**

做成穩定、高密度、可操作的表格。

---

# 32. 使用流程

```text
開啟網站
  ↓
Hamburger
  ↓
選擇副本
  ↓
選擇等級
  ↓
勾選隊伍職業
  ↓
載入 / 匯入副本時間軸
  ↓
Table 顯示 Attack Events
  ↓
點擊技能格
  ↓
建立 SkillUsage
  ↓
後續 CD 自動 Lock
  ↓
繼續排軸
  ↓
取消技能時重新計算
  ↓
完成減傷軸
```

---

# 33. 核心資料關係

```text
             ┌──────────────┐
             │   Duty Data  │
             └──────┬───────┘
                    │
                    ▼
             ┌──────────────┐
             │ AttackEvent[]│
             └──────┬───────┘
                    │
                    │
┌──────────────┐    │    ┌──────────────┐
│   Skill[]    │────┼────│ SkillUsage[] │
└──────────────┘    │    └──────┬───────┘
                    │           │
                    └─────┬─────┘
                          ▼
                  ┌──────────────┐
                  │ DamageEngine │
                  └──────┬───────┘
                         ▼
                  ┌──────────────┐
                  │ Final Damage │
                  └──────────────┘
```

最重要的架構原則：

> **副本資料、技能資料、玩家排軸資料、計算結果四者分離。**
