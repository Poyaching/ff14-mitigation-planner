// 多人共編登入／加入房間面板：邀請碼登入（登入後顯示綠燈狀態，可點擊切換帳號） + 房間代碼加入/離開。
//
// 畫面狀態完全從 signedIn／connected 這兩個布林值推導（syncRoomRowUi），不再靠散落各處手動
// 設定 disabled／hidden——先前就是因為某個分支忘記重置 disabled，導致按鈕卡住點了沒反應。

export function initCollabPanel({ onSignIn, onSignOut, onJoin, onLeave }) {
  const loginRow = document.getElementById("collab-login-row");
  const accountStatus = document.getElementById("collab-account-status");
  const accountCode = document.getElementById("collab-account-code");
  const codeInput = document.getElementById("invite-code-input");
  const loginBtn = document.getElementById("invite-login-btn");
  const roomRow = document.getElementById("collab-room-row");
  const roomInput = document.getElementById("room-id-input");
  const joinBtn = document.getElementById("join-room-btn");
  const leaveBtn = document.getElementById("leave-room-btn");
  const status = document.getElementById("collab-status");

  let signedIn = false;
  let connected = false; // 是不是已經加入某個房間（不是「登入」，是「加入房間」成功之後）
  let currentCode = ""; // 這次登入用的邀請碼，拿來顯示在綠燈狀態旁邊（例如「🟢 20260820」）

  /** 房號輸入框／加入／離開鈕的可用狀態統一由這裡決定：沒登入或已連線中都不能碰房號欄位。 */
  function syncRoomRowUi() {
    const canJoin = signedIn && !connected;
    roomInput.disabled = !canJoin;
    joinBtn.hidden = connected;
    joinBtn.disabled = !canJoin;
    leaveBtn.hidden = !connected;
  }

  loginBtn.addEventListener("click", async () => {
    const code = codeInput.value;
    if (!code) return;
    loginBtn.disabled = true;
    status.textContent = "登入中…";
    // 先記住這次輸入的碼：onSignIn 觸發登入後，setSignedIn 可能在 await 還沒 resolve 前就先被呼叫
    // （Firebase 的登入狀態監聽器跟這裡的 promise 誰先誰後不保證），要先準備好才不會漏顯示。
    currentCode = code;
    try {
      await onSignIn(code);
      codeInput.value = "";
    } catch (err) {
      currentCode = ""; // 登入失敗不算數
      status.textContent = `邀請碼錯誤或登入失敗（${err.code ?? err.message}）`;
    } finally {
      loginBtn.disabled = false;
    }
  });

  accountStatus.addEventListener("click", async () => {
    accountStatus.disabled = true;
    try {
      await onSignOut();
    } finally {
      accountStatus.disabled = false;
    }
  });

  joinBtn.addEventListener("click", async () => {
    const roomId = roomInput.value.trim();
    if (!roomId) return;
    joinBtn.disabled = true;
    status.textContent = "連線中…";
    try {
      await onJoin(roomId);
      connected = true;
      status.textContent = `已連線共編：${roomId}（職業／等級／分類／技能排入都會即時同步給房間內所有人）`;
    } catch (err) {
      status.textContent = `加入房間失敗（${err.code ?? err.message}）`;
    } finally {
      syncRoomRowUi();
    }
  });

  leaveBtn.addEventListener("click", () => {
    onLeave();
    connected = false;
    status.textContent = "已離開共編，目前只存在本機";
    syncRoomRowUi();
  });

  /** 登入狀態改變時呼叫（含頁面載入時偵測到既有登入 session 的情況）。 */
  function setSignedIn(nextSignedIn) {
    signedIn = nextSignedIn;
    loginRow.hidden = signedIn;
    accountStatus.hidden = !signedIn;
    roomRow.hidden = !signedIn; // 房號區塊只在登入後才出現，未登入時整個藏起來，不是灰掉而已
    if (signedIn) {
      // 重新整理頁面後，Firebase 只會記得「有登入」，不會記得密碼本身（currentCode 是空的），
      // 這種情況下沒有實際輸入過的邀請碼可以顯示，退回顯示通用的「邀請碼」字樣。
      accountCode.textContent = currentCode || "邀請碼";
      // 已經連線中的話（例如 token 換發重觸發這個 callback）不要蓋掉正在顯示的連線狀態文字。
      if (!connected) status.textContent = "已登入，輸入房間代碼即可加入共編";
    } else {
      connected = false; // 登出視同離開房間
      currentCode = "";
      status.textContent = "";
      roomInput.value = "";
    }
    syncRoomRowUi();
  }

  /** 場次切換等情況下由外部強制中斷連線 UI（不呼叫 onLeave，由呼叫端自行處理實際離線）。 */
  function forceDisconnectUi() {
    if (!connected) return; // 本來就沒連線
    connected = false;
    status.textContent = "已切換場次，共編連線已中斷";
    syncRoomRowUi();
  }

  return { setSignedIn, forceDisconnectUi };
}
