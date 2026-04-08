// ============================================================
//  db.js  —  Firebase config + database operations
//  Sổ Thu Chi — Quản lý doanh thu & chi phí
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── ⚠️  DÁN FIREBASE CONFIG CỦA BẠN VÀO ĐÂY ── //
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCd6t5MXFiqPBrm8q9mFtnKUaeAGA_QAL8",
  authDomain: "trading-97262.firebaseapp.com",
  projectId: "trading-97262",
  storageBucket: "trading-97262.firebasestorage.app",
  messagingSenderId: "919363505178",
  appId: "1:919363505178:web:af73cd8c02fb95572cd5a3",
};
// ─────────────────────────────────────────────── //

const app  = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

// ════════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════════

export async function register(name, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  await setDoc(doc(db, "users", cred.user.uid), {
    uid: cred.user.uid,
    name,
    email,
    createdAt: serverTimestamp(),
  });
  return cred.user;
}

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logout() {
  await signOut(auth);
}

export function onAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

// ════════════════════════════════════════════════
//  USER
// ════════════════════════════════════════════════

export async function getUser(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

export function listenUser(uid, callback) {
  return onSnapshot(doc(db, "users", uid), (snap) => {
    if (snap.exists()) callback(snap.data());
  });
}

export async function updateUserName(uid, name) {
  await updateDoc(doc(db, "users", uid), { name });
  if (auth.currentUser) await updateProfile(auth.currentUser, { displayName: name });
}

// ════════════════════════════════════════════════
//  ENTRIES (Thu / Chi)
// ════════════════════════════════════════════════

export async function addEntry(uid, data) {
  if (!data.amount || data.amount <= 0) throw new Error("Số tiền không hợp lệ");
  if (!data.type)  throw new Error("Loại không hợp lệ");
  if (!data.date)  throw new Error("Ngày không hợp lệ");
  const ref = await addDoc(collection(db, "entries"), {
    uid,
    type:      data.type,           // 'thu' | 'chi'
    amount:    Math.round(parseFloat(data.amount)),
    category:  data.category || "Khác",
    note:      data.note || "",
    date:      data.date,           // "YYYY-MM-DD"
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateEntry(entryId, data) {
  await updateDoc(doc(db, "entries", entryId), {
    type:     data.type,
    amount:   Math.round(parseFloat(data.amount)),
    category: data.category || "Khác",
    note:     data.note || "",
    date:     data.date,
  });
}

export async function deleteEntry(entryId) {
  await deleteDoc(doc(db, "entries", entryId));
}

export function listenEntries(uid, callback) {
  const q = query(collection(db, "entries"), where("uid", "==", uid));
  return onSnapshot(q, (snap) => {
    const entries = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        if (b.date !== a.date) return b.date.localeCompare(a.date);
        const ta = a.createdAt?.toMillis?.() ?? 0;
        const tb = b.createdAt?.toMillis?.() ?? 0;
        return tb - ta;
      });
    callback(entries);
  });
}

export { auth, db };

// ════════════════════════════════════════════════
//  DANH MỤC
// ════════════════════════════════════════════════
export const THU_CATEGORIES = [
  "Doanh thu bán hàng","Dịch vụ","Hoa hồng",
  "Tiền thưởng","Đầu tư","Hoàn tiền","Khác",
];
export const CHI_CATEGORIES = [
  "Nhập hàng / Nguyên liệu","Lương & Nhân sự","Thuê mặt bằng",
  "Marketing & Quảng cáo","Vận chuyển","Điện nước & Tiện ích",
  "Thiết bị & Công cụ","Thuế & Phí","Khác",
];

/*
=== FIRESTORE RULES ===
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    match /entries/{entryId} {
      allow read, write, delete: if request.auth != null && request.auth.uid == resource.data.uid;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.uid;
    }
  }
}
*/
