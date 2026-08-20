// 多人共編登入／加入房間面板：邀請碼登入 + 房間代碼加入/離開。

/**
 * @param {{
 *   onSignIn: (code: string) => Promise<void>,
 *   onJoin: (roomId: string) => Promise<void>,
 *   onLeave: () => void,
 * }} opts
 */
export function initCollabPanel({ onSignIn, onJoin, onLeave }) {
  const loginRow = document.getElementById("collab-login-row");
  const roomRow = document.getElementById("collab-room-row");
  const codeInput = document.getElementById("invite-code-input");
  const loginBtn = document.getElementById("invite-login-btn");
  const roomInput = document.getElementById("room-id-input");
  const joinBtn = document.getElementById("join-room-btn");
  const leaveBtn = document.getElementById("leave-room-btn");
  const status = document.getElementById("collab-status");

  function resetRoomUi() {
    joinBtn.hidden = false;
    leaveBtn.hidden = true;
    roomInput.disabled = false;
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

  joinBtn.addEventListener("click", async () => {
    const roomId = roomInput.value.trim();
    if (!roomId) return;
    joinBtn.disabled = true;
    status.textContent = "連線中…";
    try {
      await onJoin(roomId);
      status.textContent = `已連線共編：${roomId}（職業／等級／分類／技能排入都會即時同步給房間內所有人）`;
      joinBtn.hidden = true;
      leaveBtn.hidden = false;
      roomInput.disabled = true;
    } catch (err) {
      status.textContent = `加入房間失敗（${err.code ?? err.message}）`;
      joinBtn.disabled = false;
    }
  });

  leaveBtn.addEventListener("click", () => {
    onLeave();
    status.textContent = "已離開共編，目前只存在本機";
    resetRoomUi();
  });

  /** 登入狀態改變時呼叫（含頁面載入時偵測到既有登入 session 的情況）。 */
  function setSignedIn(signedIn) {
    loginRow.hidden = signedIn;
    roomRow.hidden = !signedIn;
    if (signedIn) {
      status.textContent = "已登入，輸入房間代碼即可加入共編";
    } else {
      status.textContent = "";
      resetRoomUi();
      roomInput.value = "";
    }
  }

  /** 場次切換等情況下由外部強制中斷連線 UI（不呼叫 onLeave，由呼叫端自行處理實際離線）。 */
  function forceDisconnectUi() {
    if (leaveBtn.hidden) return; // 本來就沒連線
    resetRoomUi();
    status.textContent = "已切換場次，共編連線已中斷";
  }

  return { setSignedIn, forceDisconnectUi };
}
