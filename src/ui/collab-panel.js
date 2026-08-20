// 多人共編登入／加入房間面板：邀請碼登入（登入後顯示綠燈狀態，可點擊切換帳號） + 房間代碼加入/離開。
//
// 畫面狀態完全從 signedIn／connected 這兩個布林值推導（syncRoomRowUi），不再靠散落各處手動
// 設定 disabled／hidden——先前就是因為某個分支忘記重置 disabled，導致按鈕卡住點了沒反應。

export function initCollabPanel({ onSignIn, onSignOut, onJoin, onLeave }) {
  const loginRow = document.getElementById("collab-login-row");
  const accountStatus = document.getElementById("collab-account-status");
  const codeInput = document.getElementById("invite-code-input");
  const loginBtn = document.getElementById("invite-login-btn");
  const roomInput = document.getElementById("room-id-input");
  const joinBtn = document.getElementById("join-room-btn");
  const leaveBtn = document.getElementById("leave-room-btn");
  const status = document.getElementById("collab-status");

  let signedIn = false;
  let connected = false; // 是不是已經加入某個房間（不是「登入」，是「加入房間」成功之後）

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
    try {
      await onSignIn(code);
      codeInput.value = "";
    } catch (err) {
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
    if (signedIn) {
      // 已經連線中的話（例如 token 換發重觸發這個 callback）不要蓋掉正在顯示的連線狀態文字。
      if (!connected) status.textContent = "已登入，輸入房間代碼即可加入共編";
    } else {
      connected = false; // 登出視同離開房間
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
