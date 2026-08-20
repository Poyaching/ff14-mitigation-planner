// Firebase 初始化（多人共編用）。
// apiKey 等設定值不是機密（Firebase 官方文件明確說明可以放在前端程式碼裡，
// 瀏覽器本來就看得到），真正的存取控制交給 Firestore Security Rules + Authentication，
// 見專案根目錄 firestore.rules。

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCbt-cJiKTwixlC13CRT20Kog7WAPGYLdo",
  authDomain: "ff14-mitigation-planner.firebaseapp.com",
  projectId: "ff14-mitigation-planner",
  storageBucket: "ff14-mitigation-planner.firebasestorage.app",
  messagingSenderId: "435003633142",
  appId: "1:435003633142:web:ef0780d6d00e5d85ed2bd7",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
