// ============================================================
//  app.js — FlowTrack Quản Lí Dòng Tiền
// ============================================================
import {
  login, logout, register, onAuth, getUser,
  listenUser, updateName, sendMoney,
  listenTransactions, findUserByAddress,
} from "./db.js";

const $ = id => document.getElementById(id);

let currentUser   = null;
let allTxs        = [];
let unsubUser     = null;
let unsubTxs      = null;
let statsChart    = null;
let donutChart    = null;
let monthlyChart  = null;
let currentFilter = 'all';

// ════════════════ BOOT ════════════════
window.addEventListener('DOMContentLoaded', () => {
  // Splash animation
  setTimeout(() => {
    $('splash').classList.add('out');
    setTimeout(() => $('splash').style.display = 'none', 500);
  }, 1500);

  onAuth(async (fbUser) => {
    if (fbUser) {
      const userData = await getUser(fbUser.uid);
      if (!userData) { doLogout(); return; }
      currentUser = userData;
      startListeners(fbUser.uid);
      $('auth').classList.remove('on');
      $('app').classList.add('on');
      updateUserUI(currentUser);
      switchPage('home', document.querySelector('.nav-item'));
    } else {
      stopListeners();
      currentUser = null;
      allTxs = [];
      $('app').classList.remove('on');
      $('auth').classList.add('on');
    }
  });
});

function startListeners(uid) {
  stopListeners();
  unsubUser = listenUser(uid, (data) => {
    currentUser = data;
    updateUserUI(data);
    renderDashboard();
    renderReceivePage();
  });
  unsubTxs = listenTransactions(uid, (txs) => {
    allTxs = txs;
    renderDashboard();
    renderHistoryPage();
    renderCashflowPage();
    updateHistoryBadge();
  });
}
function stopListeners() {
  if (unsubUser) { unsubUser(); unsubUser = null; }
  if (unsubTxs)  { unsubTxs();  unsubTxs  = null; }
}

// ════════════════ AUTH ════════════════
function switchAuthTab(tab) {
  ['login','register'].forEach(t => {
    $(`tab-${t}`).classList.toggle('active', t === tab);
    $(`form-${t}`).classList.toggle('active', t === tab);
  });
  $('login-error').classList.remove('on');
  $('reg-error').classList.remove('on');
}
window.switchAuthTab = switchAuthTab;

async function doLogin() {
  const email = $('login-email').value.trim();
  const pw    = $('login-pw').value;
  if (!email || !pw) return showAuthErr('login-error', 'Vui lòng nhập đầy đủ thông tin.');
  const btn = $('login-btn');
  setLoading(btn, true, 'Đang đăng nhập...');
  try {
    await login(email, pw);
  } catch(e) {
    showAuthErr('login-error', mapFirebaseError(e.code));
  } finally {
    setLoading(btn, false, 'Đăng nhập');
  }
}
window.doLogin = doLogin;

async function doRegister() {
  const name  = $('reg-name').value.trim();
  const email = $('reg-email').value.trim();
  const pw    = $('reg-pw').value;
  if (!name || !email || !pw) return showAuthErr('reg-error', 'Vui lòng điền đầy đủ thông tin.');
  if (pw.length < 6) return showAuthErr('reg-error', 'Mật khẩu phải có ít nhất 6 ký tự.');
  const btn = $('reg-btn');
  setLoading(btn, true, 'Đang tạo...');
  try {
    await register(name, email, pw);
  } catch(e) {
    showAuthErr('reg-error', mapFirebaseError(e.code));
  } finally {
    setLoading(btn, false, 'Tạo tài khoản');
  }
}
window.doRegister = doRegister;

async function doLogout() {
  stopListeners();
  [statsChart, donutChart, monthlyChart].forEach(c => { if(c) c.destroy(); });
  statsChart = donutChart = monthlyChart = null;
  await logout();
}
window.doLogout = doLogout;

async function deleteAccount() {
  if (!confirm('Bạn chắc chắn muốn xóa tài khoản? Hành động này không thể khôi phục!')) return;
  if (!currentUser) return;
  try {
    const { db } = await import('./db.js');
    const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    await deleteDoc(doc(db, 'users', currentUser.uid));
    await doLogout();
  } catch(e) {
    showToast('Xóa tài khoản thất bại: ' + e.message, 'error');
  }
}
window.deleteAccount = deleteAccount;

function checkPwStrength() {
  const pw  = $('reg-pw').value;
  const bar = $('pw-bar');
  const hint= $('pw-hint');
  let score = 0;
  if (pw.length >= 6)           score++;
  if (pw.length >= 10)          score++;
  if (/[A-Z]/.test(pw))        score++;
  if (/[0-9]/.test(pw))        score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const pcts   = ['0%','20%','40%','65%','85%','100%'];
  const colors = ['transparent','#f87171','#fb923c','#fbbf24','#34d399','#34d399'];
  const labels = ['','Rất yếu','Yếu','Trung bình','Mạnh','Rất mạnh'];
  bar.style.width      = pcts[score];
  bar.style.background = colors[score];
  hint.textContent     = pw.length ? labels[score] : 'Độ mạnh';
}
window.checkPwStrength = checkPwStrength;

// ════════════════ USER UI ════════════════
function updateUserUI(user) {
  if (!user) return;
  const init = user.name?.[0]?.toUpperCase() ?? '?';
  ['sb-avatar','topnav-avatar','profile-avatar'].forEach(id => {
    const el = $(id); if (el) el.textContent = init;
  });
  $('sb-name').textContent         = user.name;
  $('sb-addr').textContent         = shortAddr(user.walletNumber);
  $('topnav-name').textContent     = user.name.split(' ').slice(-1)[0];
  $('profile-name').textContent    = user.name;
  $('profile-email').textContent   = user.email;
  $('profile-addr').textContent    = user.walletNumber;
  $('profile-edit-name').value     = user.name;
  $('profile-edit-email').value    = user.email;
  if ($('send-page-balance')) {
    $('send-page-balance').textContent = fmtVND(user.balance);
  }
}

// ════════════════ DASHBOARD ════════════════
function renderDashboard() {
  if (!currentUser) return;
  const txs = allTxs || [];
  const now = new Date();

  let totalRecv = 0, totalSent = 0, countRecv = 0, countSent = 0;
  txs.forEach(tx => {
    if (tx.type === 'recv') { totalRecv += tx.amount; countRecv++; }
    if (tx.type === 'send') { totalSent += tx.amount; countSent++; }
  });

  const monthTxs = txs.filter(tx => {
    const d = toDate(tx.createdAt);
    return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  $('stat-balance').textContent     = fmtVND(currentUser.balance);
  $('stat-received').textContent    = fmtVND(totalRecv);
  $('stat-sent').textContent        = fmtVND(totalSent);
  $('stat-recv-count').textContent  = `${countRecv} giao dịch`;
  $('stat-send-count').textContent  = `${countSent} giao dịch`;
  $('stat-month-count').textContent = monthTxs.length;
  $('stat-month-label').textContent = `GD tháng ${now.getMonth()+1}`;

  $('profile-stat-total').textContent = fmtVND(currentUser.balance);
  $('profile-stat-txs').textContent   = txs.length;
  $('profile-stat-recv').textContent  = fmtVND(totalRecv);
  if ($('send-page-balance')) $('send-page-balance').textContent = fmtVND(currentUser.balance);

  renderTxList('recent-tx', txs.slice(0, 5));
  renderStatsChart(txs);
  renderDonutChart(currentUser.balance, totalRecv, totalSent);
}

function updateHistoryBadge() {
  const now   = new Date();
  const today = allTxs.filter(tx => { const d = toDate(tx.createdAt); return d && sameDay(d, now); });
  const badge = $('history-badge');
  if (today.length > 0) { badge.textContent = today.length; badge.style.display = ''; }
  else badge.style.display = 'none';
}

// ════════════════ CASHFLOW PAGE ════════════════
function renderCashflowPage() {
  const txs = allTxs || [];
  let totalIn = 0, totalOut = 0;
  txs.forEach(tx => {
    if (tx.type === 'recv') totalIn  += tx.amount;
    if (tx.type === 'send') totalOut += tx.amount;
  });
  const net = totalIn - totalOut;

  const cfNet = $('cf-net');
  if (cfNet) {
    cfNet.textContent    = (net >= 0 ? '+' : '') + fmtVND(net);
    cfNet.style.color    = net >= 0 ? '#fff' : '#fca5a5';
  }
  if ($('cf-total-in'))  $('cf-total-in').textContent  = fmtVND(totalIn);
  if ($('cf-total-out')) $('cf-total-out').textContent = fmtVND(totalOut);
  if ($('cf-count'))     $('cf-count').textContent     = txs.length;

  // Monthly table & chart
  renderMonthlyChart(txs);
  renderFlowTable(txs);
}

function getMonthlyData(txs, months = 6) {
  const result = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = `${d.getMonth()+1}/${d.getFullYear()}`;
    const monthTxs = txs.filter(tx => {
      const td = toDate(tx.createdAt);
      return td && td.getMonth() === d.getMonth() && td.getFullYear() === d.getFullYear();
    });
    const income  = monthTxs.filter(t => t.type === 'recv').reduce((s,t) => s+t.amount, 0);
    const expense = monthTxs.filter(t => t.type === 'send').reduce((s,t) => s+t.amount, 0);
    result.push({ label, income, expense, net: income - expense, count: monthTxs.length });
  }
  return result;
}

function renderMonthlyChart(txs) {
  const ctx = $('monthly-chart');
  if (!ctx) return;
  if (monthlyChart) { monthlyChart.destroy(); monthlyChart = null; }
  const data = getMonthlyData(txs, 6);
  monthlyChart = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels: data.map(d => d.label),
      datasets: [
        { label: 'Nhận', data: data.map(d => d.income),  backgroundColor: 'rgba(52,211,153,.65)', borderColor: 'rgba(52,211,153,.9)', borderRadius: 6, borderWidth: 1.5 },
        { label: 'Gửi',  data: data.map(d => d.expense), backgroundColor: 'rgba(248,113,113,.55)', borderColor: 'rgba(248,113,113,.8)', borderRadius: 6, borderWidth: 1.5 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => ' ' + fmtVND(c.raw) } },
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#4d5e78', font: { size: 11, family: "'Be Vietnam Pro'" } } },
        y: {
          grid: { color: 'rgba(255,255,255,.04)' },
          ticks: { color: '#4d5e78', font: { size: 10, family: "'Be Vietnam Pro'" }, callback: v => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1000 ? (v/1000)+'k' : v },
        },
      },
    },
  });
}

function renderFlowTable(txs) {
  const tbody = $('flow-table-body');
  if (!tbody) return;
  const data = getMonthlyData(txs, 6).reverse(); // newest first
  if (!data.some(d => d.count > 0)) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Chưa có dữ liệu</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(d => `
    <tr>
      <td>${d.label}</td>
      <td class="flow-positive">+${fmtVND(d.income)}</td>
      <td class="flow-negative">-${fmtVND(d.expense)}</td>
      <td class="${d.net >= 0 ? 'flow-positive' : 'flow-negative'}">${d.net >= 0 ? '+' : ''}${fmtVND(d.net)}</td>
      <td>${d.count}</td>
    </tr>`).join('');
}

// ════════════════ TX RENDER ════════════════
function renderTxList(containerId, txs) {
  const el = $(containerId);
  if (!el) return;
  if (!txs || !txs.length) { el.innerHTML = '<div class="empty-state">Chưa có giao dịch nào</div>'; return; }
  el.innerHTML = txs.map(txHTML).join('');
}

function txHTML(tx) {
  const isRecv = tx.type === 'recv';
  const sign   = isRecv ? '+' : '-';
  const cls    = isRecv ? 'tx-recv' : 'tx-send';
  const ico    = isRecv ? '↓' : '↑';
  const peer   = isRecv ? (tx.fromName ?? '—') : (tx.toName ?? '—');
  const label  = isRecv ? `Nhận từ ${peer}` : `Chuyển tới ${peer}`;
  const color  = isRecv ? 'var(--green)' : 'var(--red)';
  const date   = toDate(tx.createdAt);
  return `
  <div class="tx-item">
    <div class="tx-icon ${cls}">${ico}</div>
    <div>
      <div class="tx-title">${label}</div>
      <div class="tx-sub">${date ? fmtDate(date) : '—'}</div>
    </div>
    <div class="tx-right">
      <div class="tx-amount" style="color:${color}">${sign}${fmtVND(tx.amount)}</div>
      <div class="tx-usd">VNĐ</div>
    </div>
  </div>`;
}

// ════════════════ HISTORY ════════════════
function filterTx(type, el) {
  document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  currentFilter = type;
  renderHistoryPage();
}
window.filterTx = filterTx;

function renderHistoryPage() {
  const filtered  = currentFilter === 'all' ? allTxs : allTxs.filter(t => t.type === currentFilter);
  const container = $('history-list');
  if (!container) return;

  // Update summary
  const sumEl = $('history-summary');
  if (sumEl) {
    if (filtered.length === 0) {
      sumEl.textContent = 'Không có giao dịch';
    } else {
      const total = filtered.reduce((s,t) => s + (t.type==='recv'?t.amount:-t.amount), 0);
      sumEl.textContent = `${filtered.length} giao dịch · Net: ${total >= 0 ? '+' : ''}${fmtVND(total)}`;
    }
  }

  if (!filtered.length) { container.innerHTML = '<div class="empty-state">Không có giao dịch</div>'; return; }
  let html = '', lastGroup = '';
  filtered.forEach(tx => {
    const d = toDate(tx.createdAt);
    const grp = d ? fmtGroup(d) : '—';
    if (grp !== lastGroup) { html += `<div class="group-label">${grp}</div>`; lastGroup = grp; }
    html += txHTML(tx);
  });
  container.innerHTML = html;
}

// ════════════════ CHARTS ════════════════
function renderStatsChart(txs) {
  const ctx = $('stats-chart');
  if (!ctx) return;
  if (statsChart) { statsChart.destroy(); statsChart = null; }
  const labels = [], recvData = [], sendData = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    labels.push(d.getDate() + '/' + (d.getMonth()+1));
    recvData.push(txs.filter(t => t.type==='recv' && sameDay(toDate(t.createdAt),d)).reduce((s,t)=>s+t.amount,0));
    sendData.push(txs.filter(t => t.type==='send' && sameDay(toDate(t.createdAt),d)).reduce((s,t)=>s+t.amount,0));
  }
  statsChart = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'Nhận', data:recvData, backgroundColor:'rgba(52,211,153,.65)', borderColor:'rgba(52,211,153,.9)',  borderRadius:5, borderWidth:1.5 },
        { label:'Gửi',  data:sendData, backgroundColor:'rgba(248,113,113,.55)', borderColor:'rgba(248,113,113,.8)', borderRadius:5, borderWidth:1.5 },
      ],
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: {
        legend:{display:false},
        tooltip:{callbacks:{label:c=>' '+fmtVND(c.raw)}},
      },
      scales: {
        x:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#4d5e78',font:{size:11,family:"'Be Vietnam Pro'"}}},
        y:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#4d5e78',font:{size:10,family:"'Be Vietnam Pro'"},callback:v=>v>=1e6?(v/1e6)+'M':v>=1000?(v/1000)+'k':v}},
      },
    },
  });
}

function renderDonutChart(balance, received, sent) {
  const ctx = $('donut-chart');
  if (!ctx) return;
  if (donutChart) { donutChart.destroy(); donutChart = null; }
  const total = received + balance;
  const pct = v => total > 0 ? Math.round(v/total*100)+'%' : '0%';
  $('dl-recv').textContent = pct(received);
  $('dl-sent').textContent = pct(sent);
  $('dl-bal').textContent  = pct(balance);
  donutChart = new Chart(ctx.getContext('2d'), {
    type: 'doughnut',
    data: {
      datasets:[{
        data:[received||0.01, sent||0, balance||0],
        backgroundColor:['rgba(52,211,153,.75)','rgba(248,113,113,.7)','rgba(96,165,250,.7)'],
        borderColor:'#161b27', borderWidth:3, hoverOffset:6,
      }],
    },
    options: {
      cutout:'68%',
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmtVND(c.raw)}}},
      animation:{duration:500},
    },
  });
}

// ════════════════ SEND ════════════════
let addrTimer = null;
async function onAddressInput() {
  clearTimeout(addrTimer);
  const addr    = $('send-addr').value.trim();
  const preview = $('addr-preview');
  if (!addr) { preview.style.display = 'none'; return; }
  preview.className = 'addr-preview';
  preview.style.display = 'flex';
  preview.textContent = 'Đang tìm...';
  addrTimer = setTimeout(async () => {
    try {
      const found = await findUserByAddress(addr);
      if (found) {
        preview.className = 'addr-preview';
        preview.innerHTML = `<span>✓</span> <strong>${found.name}</strong> — ${shortAddr(found.walletNumber)}`;
      } else {
        preview.className = 'addr-preview err';
        preview.textContent = '✗ Số tài khoản không tồn tại';
      }
    } catch {
      preview.className = 'addr-preview err';
      preview.textContent = '✗ Lỗi kết nối';
    }
  }, 500);
}
window.onAddressInput = onAddressInput;

function updateSendPreview() {
  const amt = parseFloat($('send-amount').value) || 0;
  $('send-usd').textContent   = amt > 0 ? fmtVND(amt) : 'Nhập số tiền cần chuyển';
  $('send-total').textContent = amt > 0 ? fmtVND(amt) : '—';
}
window.updateSendPreview = updateSendPreview;

function setMax() {
  if (!currentUser) return;
  $('send-amount').value = currentUser.balance;
  updateSendPreview();
}
window.setMax = setMax;

async function handleSend() {
  const addrRaw = $('send-addr').value.trim();
  const amt     = parseFloat($('send-amount').value);
  if (!addrRaw)         return showToast('Vui lòng nhập số tài khoản nhận', 'error');
  if (!amt || amt <= 0) return showToast('Vui lòng nhập số tiền hợp lệ', 'error');
  if (!currentUser)     return;
  if (amt > currentUser.balance) return showToast('Số dư không đủ!', 'error');
  const btn = $('send-btn');
  setLoading(btn, true, 'Đang xử lý...');
  try {
    await sendMoney(currentUser.uid, addrRaw, amt);
    $('send-addr').value = '';
    $('send-amount').value = '';
    $('addr-preview').style.display = 'none';
    updateSendPreview();
    showToast(`✓ Đã chuyển ${fmtVND(amt)} thành công!`, 'success');
    setTimeout(() => switchPage('history', document.querySelector('[onclick*="history"]')), 1200);
  } catch(e) {
    showToast(e.message || 'Giao dịch thất bại', 'error');
  } finally {
    setLoading(btn, false, 'Xác nhận chuyển →');
  }
}
window.handleSend = handleSend;

// ════════════════ RECEIVE ════════════════
function renderReceivePage() {
  if (!currentUser) return;
  const addrEl = $('recv-addr');
  if (addrEl) addrEl.textContent = currentUser.walletNumber;
  const wrap = $('qr-wrap-inner');
  if (!wrap) return;
  wrap.innerHTML = '';
  try {
    new QRCode(wrap, { text:`flowtrack:${currentUser.walletNumber}`, width:144, height:144, colorDark:'#0f1117', colorLight:'#ffffff' });
  } catch {
    wrap.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=144x144&data=${encodeURIComponent('flowtrack:'+currentUser.walletNumber)}&color=0f1117&bgcolor=ffffff" width="144" height="144" style="border-radius:8px">`;
  }
}

function copyAddress() {
  if (!currentUser) return;
  navigator.clipboard.writeText(currentUser.walletNumber)
    .then(() => showToast('✓ Đã sao chép số tài khoản!', 'success'))
    .catch(()  => showToast('Sao chép thất bại', 'error'));
}
window.copyAddress = copyAddress;

// ════════════════ PROFILE ════════════════
async function saveProfile() {
  const name = $('profile-edit-name').value.trim();
  if (!name) return showToast('Tên không được để trống!', 'error');
  if (!currentUser) return;
  const btn = $('save-profile-btn');
  setLoading(btn, true, 'Đang lưu...');
  try {
    await updateName(currentUser.uid, name);
    showToast('✓ Đã lưu thông tin!', 'success');
  } catch(e) {
    showToast('Lưu thất bại: ' + e.message, 'error');
  } finally {
    setLoading(btn, false, 'Lưu thay đổi');
  }
}
window.saveProfile = saveProfile;

function copyProfileAddr() {
  if (!currentUser) return;
  navigator.clipboard.writeText(currentUser.walletNumber)
    .then(() => showToast('✓ Đã sao chép!', 'success'))
    .catch(()  => showToast('Sao chép thất bại', 'error'));
}
window.copyProfileAddr = copyProfileAddr;

// ════════════════ NAVIGATION ════════════════
const PAGE_TITLES = {
  home:     'Dashboard',
  cashflow: 'Dòng tiền',
  send:     'Chuyển tiền',
  receive:  'Nhận tiền',
  history:  'Lịch sử giao dịch',
  profile:  'Hồ sơ',
};

function switchPage(name, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const page = $(`page-${name}`);
  if (page) page.classList.add('active');
  if (el) el.classList.add('active');
  else {
    const found = document.querySelector(`.nav-item[onclick*="'${name}'"]`);
    if (found) found.classList.add('active');
  }
  $('page-label').textContent = PAGE_TITLES[name] || name;
  if (!currentUser) return;
  if (name === 'home')     { renderDashboard(); }
  if (name === 'cashflow') { renderCashflowPage(); }
  if (name === 'history')  { renderHistoryPage(); }
  if (name === 'receive')  { renderReceivePage(); }
  if (name === 'profile')  { updateUserUI(currentUser); }
  if (name === 'send')     { updateUserUI(currentUser); }
}
window.switchPage = switchPage;

// ════════════════ TOAST ════════════════
let toastTimer;
function showToast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast on ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 3500);
}

// ════════════════ HELPERS ════════════════
function showAuthErr(id, msg) {
  const el = $(id);
  el.textContent = msg;
  el.classList.add('on');
  setTimeout(() => el.classList.remove('on'), 4000);
}

function setLoading(btn, loading, text) {
  btn.disabled = loading;
  btn.innerHTML = loading ? `<span class="spinner"></span>${text}` : text;
}

function shortAddr(addr) {
  if (!addr) return '';
  const s = String(addr);
  if (s.length !== 14) return s;
  return s.slice(0,4)+' '+s.slice(4,8)+' '+s.slice(8,12)+' '+s.slice(12);
}

function fmtVND(val) {
  return (val ?? 0).toLocaleString('vi-VN', { style:'currency', currency:'VND' });
}

function toDate(ts) {
  if (!ts) return null;
  if (ts.toDate)  return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  if (typeof ts === 'number') return new Date(ts);
  return null;
}

function fmtDate(date) {
  if (!date) return '—';
  const now = new Date();
  if (sameDay(date, now)) return 'Hôm nay · ' + date.toLocaleTimeString('vi',{hour:'2-digit',minute:'2-digit'});
  const yd = new Date(now); yd.setDate(now.getDate()-1);
  if (sameDay(date, yd)) return 'Hôm qua · ' + date.toLocaleTimeString('vi',{hour:'2-digit',minute:'2-digit'});
  return date.toLocaleDateString('vi') + ' · ' + date.toLocaleTimeString('vi',{hour:'2-digit',minute:'2-digit'});
}

function fmtGroup(date) {
  if (!date) return '—';
  const now = new Date();
  if (sameDay(date, now)) return 'Hôm nay';
  const yd = new Date(now); yd.setDate(now.getDate()-1);
  if (sameDay(date, yd)) return 'Hôm qua';
  return date.toLocaleDateString('vi',{day:'2-digit',month:'2-digit',year:'numeric'});
}

function sameDay(a, b) {
  if (!a || !b) return false;
  return a.getDate()===b.getDate() && a.getMonth()===b.getMonth() && a.getFullYear()===b.getFullYear();
}

function mapFirebaseError(code) {
  const map = {
    'auth/user-not-found':         'Email không tồn tại.',
    'auth/wrong-password':         'Mật khẩu không đúng.',
    'auth/email-already-in-use':   'Email này đã được đăng ký.',
    'auth/invalid-email':          'Email không hợp lệ.',
    'auth/weak-password':          'Mật khẩu quá yếu.',
    'auth/too-many-requests':      'Quá nhiều lần thử. Thử lại sau.',
    'auth/network-request-failed': 'Lỗi mạng. Kiểm tra kết nối.',
    'auth/invalid-credential':     'Email hoặc mật khẩu không đúng.',
  };
  return map[code] || 'Đã xảy ra lỗi. Vui lòng thử lại.';
}
