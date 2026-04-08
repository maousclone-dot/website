// ============================================================
//  db.js  —  Firebase config + tất cả database operations
//  Vaultr — Ví điện tử VNĐ
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
  collection,
  query,
  where,
  limit,
  onSnapshot,
  serverTimestamp,
  runTransaction,
  getDocs,
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

// Số VNĐ tặng khi tạo tài khoản mới (demo)
export const INITIAL_BALANCE = 1000000; // 1.000.000 VNĐ

// ════════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════════

export async function register(name, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });

  const walletNumber = await genWalletNumber();

  await setDoc(doc(db, "users", cred.user.uid), {
    uid: cred.user.uid,
    name,
    email,
    walletNumber,
    balance: INITIAL_BALANCE,
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
//  USER DATA
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

export async function updateName(uid, name) {
  await updateDoc(doc(db, "users", uid), { name });
  if (auth.currentUser) {
    await updateProfile(auth.currentUser, { displayName: name });
  }
}

// ════════════════════════════════════════════════
//  TRANSACTIONS
// ════════════════════════════════════════════════

export async function sendMoney(senderUid, toAddress, amount) {
  amount = Math.round(parseFloat(amount));
  if (!amount || amount <= 0) throw new Error("Số tiền không hợp lệ");
  if (!toAddress)             throw new Error("Số tài khoản không hợp lệ");

  const clean = toAddress.trim().toLowerCase();
  if (!clean) throw new Error("Số tài khoản không hợp lệ");

  const recipQ = query(
    collection(db, "users"),
    where("walletNumber", "==", clean),
    limit(1)
  );

  const recipSnap = await getDocs(recipQ);
  if (recipSnap.empty) throw new Error("Số tài khoản không tồn tại");

  const recipDoc = recipSnap.docs[0];
  const recipUid = recipDoc.id;

  if (recipUid === senderUid) throw new Error("Không thể chuyển cho chính mình");

  const senderRef = doc(db, "users", senderUid);
  const recipRef  = doc(db, "users", recipUid);

  await runTransaction(db, async (tx) => {
    const senderSnap = await tx.get(senderRef);
    const recipSnap2 = await tx.get(recipRef);

    const senderBal = senderSnap.data().balance ?? 0;
    if (senderBal < amount) throw new Error("Số dư không đủ");

    const recipBal = recipSnap2.data().balance ?? 0;

    tx.update(senderRef, { balance: senderBal - amount });
    tx.update(recipRef,  { balance: recipBal  + amount });
  });

  const txHash     = randomHash();
  const now        = serverTimestamp();
  const recipData  = recipDoc.data();
  const senderData = await getUser(senderUid);

  await addDoc(collection(db, "transactions"), {
    uid:       senderUid,
    type:      "send",
    amount,
    toAddress: clean,
    toName:    recipData.name ?? "",
    txHash,
    createdAt: now,
  });

  await addDoc(collection(db, "transactions"), {
    uid:         recipUid,
    type:        "recv",
    amount,
    fromAddress: senderData?.walletNumber ?? "",
    fromName:    senderData?.name ?? "",
    txHash,
    createdAt:   now,
  });

  return txHash;
}

export function listenTransactions(uid, callback) {
  const q = query(
    collection(db, "transactions"),
    where("uid", "==", uid),
    limit(50)
  );
  return onSnapshot(q, (snap) => {
    const txs = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? 0;
        const tb = b.createdAt?.toMillis?.() ?? 0;
        return tb - ta;
      });
    callback(txs);
  });
}

export async function findUserByAddress(address) {
  if (!address) return null;
  const clean = address.trim().toLowerCase();
  if (!clean)   return null;

  const q = query(
    collection(db, "users"),
    where("walletNumber", "==", clean),
    limit(1)
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;

  return { uid: snap.docs[0].id, ...snap.docs[0].data() };
}

// ════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════

async function genWalletNumber() {
  while (true) {
    const num = Math.floor(10000000000000 + Math.random() * 90000000000000).toString();
    const q   = query(
      collection(db, "users"),
      where("walletNumber", "==", num),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return num;
  }
}

function randomHash() {
  return "0x" + Array.from({ length: 64 }, () =>
    "0123456789abcdef"[Math.floor(Math.random() * 16)]
  ).join("");
}

export { auth, db };

// ════════════════════════════════════════════════
//  FIRESTORE SECURITY RULES
// ════════════════════════════════════════════════
/*
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null;
    }
    match /transactions/{txId} {
      allow read, write: if request.auth != null;
    }
  }
}
*/
