// 共用格式化工具

/** 秒數 → 00:13.24（Spec §7 Time） */
export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  const sStr = s.toFixed(2).padStart(5, "0");
  return `${String(m).padStart(2, "0")}:${sStr}`;
}

/** 51000 → 51,000（Spec §7 Damage） */
export function formatDamage(amount) {
  return amount.toLocaleString("en-US");
}

/** "00:13.24" 或 "00:13" → 13.24 / 13（CSV 匯入用，Spec §23） */
export function parseTime(text) {
  const [m, s] = text.trim().split(":");
  return Number(m) * 60 + Number(s);
}

let counter = 0;
export function nextId(prefix) {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

/** 觸發瀏覽器下載一個 JSON 檔案（匯出場次用）。 */
export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
