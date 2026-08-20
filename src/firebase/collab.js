// 多人共編：全部小隊成員用同一組「邀請碼」登入同一個 Firebase Auth 帳號（共用密碼），
// 再輸入一個雙方約定的「房間代碼」加入同一份 Firestore 文件，之後場次設定
//（名稱／等級／職業／顯示分類／副本事件）與已排入的技能就會即時同步給房間內所有人。
//
// 設計取捨：一個房間＝一份 Firestore 文件（rooms/{roomId}），整份場次資料一起讀寫，
// 不拆子集合。代表「兩個人在同一瞬間改設定」時後寫入的人會覆蓋前一個人（last-write-wins）；
// 對這個工具的使用情境（小隊揪團排軸，通常是輪流編輯，不是逐格搶著點）來說已經夠用，
// 換取的是不用另外設計逐欄位合併的複雜度，也不需要 Cloud Functions（可以留在免費的 Spark 方案）。
//
// 安全性：Security Rules（見 firestore.rules）只檢查「有沒有登入」，沒有登入就完全不能讀寫；
// 因為大家共用同一個帳號，房間代碼本身不是存取控制，純粹是「大家要打同一個房間名稱才會同步」的
// 慣例（類似會議連結），不知道邀請碼的人不管猜不猜得到房間代碼都進不來。

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { auth, db } from "./init.js";

// 所有邀請碼共用的固定帳號；邀請碼本身就是這組帳號的密碼（在 Firebase Console 手動建立）。
const INVITE_EMAIL = "invite@ff14-mitigation-planner.local";

let unsubscribeRoom = null;
let currentRoomId = null;
let pushTimer = null;

/** 登入狀態改變時呼叫 callback(signedIn)；頁面載入時也會立刻呼叫一次目前狀態。 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, (user) => callback(!!user));
}

/** @param {string} code 使用者輸入的邀請碼 */
export async function signInWithInviteCode(code) {
  await signInWithEmailAndPassword(auth, INVITE_EMAIL, code);
}

export async function signOutCollab() {
  leaveRoom();
  await signOut(auth);
}

function roomIdFromInput(raw) {
  // Firestore 文件 ID 不能包含「/」，也不能剛好是「.」或「..」；其餘字元照留
  // （房間代碼給隊伍自己取，例如「幻朱雀A團」），並限制長度避免手滑貼太長的字串。
  let id = raw.trim().replace(/\//g, "-").slice(0, 200);
  if (id === "." || id === "..") id = `_${id}`;
  return id;
}

/**
 * 加入房間：訂閱該房間的即時更新。
 * @param {string} rawRoomId
 * @param {(data: any) => void} onRemoteUpdate 加入後、以及之後房間資料變動時都會呼叫（第一次讀取如果房間已存在也會呼叫一次）
 * @returns {Promise<{ roomId: string, existed: boolean, initialData: any }>}
 */
export function joinRoom(rawRoomId, onRemoteUpdate) {
  leaveRoom();
  const roomId = roomIdFromInput(rawRoomId);
  currentRoomId = roomId;
  const ref = doc(db, "rooms", roomId);
  return new Promise((resolve, reject) => {
    let first = true;
    unsubscribeRoom = onSnapshot(
      ref,
      (snap) => {
        if (first) {
          first = false;
          resolve({ roomId, existed: snap.exists(), initialData: snap.data() ?? null });
          if (!snap.exists()) return; // 新房間，交給呼叫端把本機目前資料當初始值 push 上去
        }
        onRemoteUpdate(snap.data());
      },
      (err) => {
        if (first) reject(err);
        else console.warn("共編房間同步失敗", err);
      }
    );
  });
}

/** 離開目前房間（不影響登入狀態）。 */
export function leaveRoom() {
  unsubscribeRoom?.();
  unsubscribeRoom = null;
  currentRoomId = null;
  clearTimeout(pushTimer);
}

/** 把目前場次的可共編欄位寫回房間（debounce 400ms，避免打字時每個字都寫一次）。 */
export function pushRoomState(data) {
  if (!currentRoomId) return;
  clearTimeout(pushTimer);
  const roomId = currentRoomId;
  pushTimer = setTimeout(() => {
    setDoc(doc(db, "rooms", roomId), { ...data, updatedAt: Date.now() }).catch((err) => {
      console.warn("共編資料寫入失敗", err);
    });
  }, 400);
}
