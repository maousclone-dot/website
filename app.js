// ============================================================
//  app.js — Sổ Thu Chi
// ============================================================
import {
  login, logout, register, onAuth, getUser,
  listenUser, updateUserName,
  addEntry, updateEntry, deleteEntry, listenEntries,
  THU_CATEGORIES, CHI_CATEGORIES,
} from "./db.js";

const $ = id => document.getElementById(id);

let currentUser  = null;
let allEntries   = [];
let unsubUser    = null;
let unsubEntries = null;
let chart7d      = null;
let chartDonut   = null;
let chartMonthly = null;
let entryFilter  = 'all';
let editingType  = 'thu';

// ════════════════ BOOT ════════════════
window.addEventListener('DOMContentLoaded', () => {
  // Splash
  setTimeout(() => {
    $('splash').classList.add('out');
    setTimeout(() => $('splash').style.display = 'none', 500);
  }, 1400);

  onAuth(async (fbUser) => {
    if (fbUser) {
      const userData = await getUser(fbUser.uid);
      if (!userData) { doLogout(); return; }
      currentUser = userData;
      startListeners(fbUser.uid);
      $('auth').classList.remove('on');
      $('app').classList.add('on');
      updateUserUI(currentUser);
      gotoPage('dashboard', document.querySelector('.snav-item'));
    } else {
      stopListeners();
      currentUser = null;
      allEntries  = [];
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
  });
  unsubEntries = listenEntries(uid, (entries) => {
    allEntries = entries;
    renderAll();
    updateTodayBadge();
    populateMonthFilter();
  });
}
function stopListeners() {
  if (unsubUser)    { unsubUser();    unsubUser    = null; }
  if (unsubEntries) { unsubEntries(); unsubEntries = null; }
}

function renderAll() {
  renderDashboard();
  renderStats();
  renderLedger();
}

// ════════════════ AUTH ════════════════
window.switchAuthTab = (tab) => {
  ['login','reg'].forEach(t => {
    $(`atab-${t}`).classList.toggle('active', t === tab);
    $(`aform-${t}`).classList.toggle('active', t === tab);
  });
  $('l-err').textContent = '';
  $('r-err').textContent = '';
};

window.doLogin = async () => {
  const email = $('l-email').value.trim();
  const pw    = $('l-pw').value;
  if (!email || !pw) return showAuthErr('l-err','Vui lòng điền đầy đủ');
  const btn = $('l-btn');
  setLoading(btn, true, 'Đang đăng nhập...');
  try {
    await login(email, pw);
  } catch(e) {
    showAuthErr('l-err', mapFbErr(e.code));
  } finally {
    setLoading(btn, false, 'Đăng nhập');
  }
};

window.doRegister = async () => {
  const name  = $('r-name').value.trim();
  const email = $('r-email').value.trim();
  const pw    = $('r-pw').value;
  if (!name||!email||!pw) return showAuthErr('r-err','Vui lòng điền đầy đủ');
  if (pw.length < 6)      return showAuthErr('r-err','Mật khẩu ít nhất 6 ký tự');
  const btn = $('r-btn');
  setLoading(btn, true, 'Đang tạo...');
  try {
    await register(name, email, pw);
  } catch(e) {
    showAuthErr('r-err', mapFbErr(e.code));
  } finally {
    setLoading(btn, false, 'Tạo tài khoản');
  }
};

window.doLogout = async () => {
  stopListeners();
  [chart7d, chartDonut, chartMonthly].forEach(c => c?.destroy());
  chart7d = chartDonut = chartMonthly = null;
  await logout();
};

// ════════════════ USER UI ════════════════
function updateUserUI(user) {
  if (!user) return;
  const init = user.name?.[0]?.toUpperCase() ?? '?';
  $('sb-av').textContent   = init;
  $('sb-uname').textContent  = user.name;
  $('sb-uemail').textContent = user.email;
  if ($('s-name'))  $('s-name').value  = user.name;
  if ($('s-email')) $('s-email').value = user.email;
}

window.saveSettings = async () => {
  const name = $('s-name').value.trim();
  if (!name) return showToast('Tên không được để trống', 'err');
  const btn = $('s-save-btn');
  setLoading(btn, true, 'Đang lưu...');
  try {
    await updateUserName(currentUser.uid, name);
    showToast('✓ Đã lưu', 'ok');
  } catch(e) {
    showToast('Lỗi: ' + e.message, 'err');
  } finally {
    setLoading(btn, false, 'Lưu thay đổi');
  }
};

// ════════════════ NAVIGATION ════════════════
const PAGE_TITLES = {
  dashboard: 'Dashboard',
  stats:     'Thống kê',
  ledger:    'Sổ ghi chép',
  settings:  'Cài đặt',
};

window.gotoPage = (name, el) => {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.snav-item').forEach(n => n.classList.remove('active'));
  $(`page-${name}`)?.classList.add('active');
  if (el) el.classList.add('active');
  else document.querySelector(`.snav-item[onclick*="'${name}'"]`)?.classList.add('active');
  $('page-title').textContent = PAGE_TITLES[name] || name;
};

// ════════════════ MODAL ════════════════
window.openModal = (mode, entry = null) => {
  $('modal-overlay').classList.add('on');
  $('m-edit-id').value = entry?.id || '';
  $('modal-title').textContent = entry ? 'Sửa khoản' : 'Thêm khoản mới';
  $('modal-save-btn').textContent = entry ? 'Cập nhật' : 'Lưu';

  const type = entry?.type || 'thu';
  setEntryType(type);

  $('m-amount').value   = entry ? entry.amount : '';
  $('m-note').value     = entry?.note || '';
  $('m-date').value     = entry?.date || todayStr();
  $('m-amount-preview').textContent = entry ? fmtVND(entry.amount) : '';

  // Set category after populating select
  if (entry) {
    $('m-category').value = entry.category;
  }
};

window.closeModal = () => {
  $('modal-overlay').classList.remove('on');
};

window.setEntryType = (type) => {
  editingType = type;
  $('mtype-thu').classList.toggle('active', type === 'thu');
  $('mtype-chi').classList.toggle('active', type === 'chi');
  const cats = type === 'thu' ? THU_CATEGORIES : CHI_CATEGORIES;
  const sel  = $('m-category');
  const cur  = sel.value;
  sel.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
  if (cats.includes(cur)) sel.value = cur;
};

window.updateAmountPreview = () => {
  const v = parseFloat($('m-amount').value) || 0;
  $('m-amount-preview').textContent = v > 0 ? fmtVND(v) : '';
};

window.saveEntry = async () => {
  const editId = $('m-edit-id').value;
  const amount = parseFloat($('m-amount').value);
  const cat    = $('m-category').value;
  const date   = $('m-date').value;
  const note   = $('m-note').value.trim();

  if (!amount || amount <= 0) return showToast('Nhập số tiền hợp lệ', 'err');
  if (!date)                  return showToast('Chọn ngày', 'err');

  const btn = $('modal-save-btn');
  setLoading(btn, true, editId ? 'Đang cập nhật...' : 'Đang lưu...');
  try {
    const data = { type: editingType, amount, category: cat, date, note };
    if (editId) {
      await updateEntry(editId, data);
      showToast('✓ Đã cập nhật', 'ok');
    } else {
      await addEntry(currentUser.uid, data);
      showToast('✓ Đã thêm ' + (editingType === 'thu' ? 'khoản thu' : 'khoản chi'), 'ok');
    }
    closeModal();
  } catch(e) {
    showToast(e.message || 'Lỗi', 'err');
  } finally {
    setLoading(btn, false, editId ? 'Cập nhật' : 'Lưu');
  }
};

window.editEntry = (id) => {
  const entry = allEntries.find(e => e.id === id);
  if (entry) openModal('edit', entry);
};

window.deleteEntryUI = async (id) => {
  if (!confirm('Xóa khoản này?')) return;
  try {
    await deleteEntry(id);
    showToast('✓ Đã xóa', 'ok');
  } catch(e) {
    showToast('Lỗi xóa: ' + e.message, 'err');
  }
};

// ════════════════ DASHBOARD ════════════════
function renderDashboard() {
  const now   = new Date();
  const month = now.getMonth();
  const year  = now.getFullYear();

  let totalThu = 0, countThu = 0;
  let totalChi = 0, countChi = 0;
  let monthNet = 0, monthCount = 0;

  allEntries.forEach(e => {
    if (e.type === 'thu') { totalThu += e.amount; countThu++; }
    if (e.type === 'chi') { totalChi += e.amount; countChi++; }
    const d = new Date(e.date);
    if (d.getMonth() === month && d.getFullYear() === year) {
      monthNet += e.type === 'thu' ? e.amount : -e.amount;
      monthCount++;
    }
  });

  const net = totalThu - totalChi;
  $('kpi-net').textContent = fmtVND(net);
  $('kpi-net').style.color = net >= 0 ? 'var(--thu)' : 'var(--chi)';
  $('kpi-net-sub').textContent = net >= 0 ? '▲ Dương — tốt!' : '▼ Âm — cần chú ý';
  $('kpi-thu').textContent = fmtVND(totalThu);
  $('kpi-thu-sub').textContent = `${countThu} khoản`;
  $('kpi-chi').textContent = fmtVND(totalChi);
  $('kpi-chi-sub').textContent = `${countChi} khoản`;
  $('kpi-month').textContent = (monthNet >= 0 ? '+' : '') + fmtVND(monthNet);
  $('kpi-month').style.color = monthNet >= 0 ? 'var(--thu)' : 'var(--chi)';
  $('kpi-month-label').textContent = `Tháng ${month+1}/${year}`;
  $('kpi-month-sub').textContent = `${monthCount} giao dịch`;

  render7DChart();
  renderDonutChart(totalThu, totalChi, month, year);
  renderRecent();
}

function render7DChart() {
  const ctx = $('chart-7d');
  if (!ctx) return;
  if (chart7d) { chart7d.destroy(); chart7d = null; }
  const labels = [], thuData = [], chiData = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = dateStr(d);
    labels.push(d.getDate() + '/' + (d.getMonth()+1));
    const dayEntries = allEntries.filter(e => e.date === ds);
    thuData.push(dayEntries.filter(e => e.type==='thu').reduce((s,e) => s+e.amount, 0));
    chiData.push(dayEntries.filter(e => e.type==='chi').reduce((s,e) => s+e.amount, 0));
  }
  chart7d = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'Thu', data:thuData, backgroundColor:'rgba(34,197,94,.65)',  borderColor:'rgba(34,197,94,.9)',  borderRadius:5, borderWidth:1.5 },
        { label:'Chi', data:chiData, backgroundColor:'rgba(239,68,68,.55)',  borderColor:'rgba(239,68,68,.8)',  borderRadius:5, borderWidth:1.5 },
      ],
    },
    options: chartOpts(),
  });
}

function renderDonutChart(totalThu, totalChi, month, year) {
  const ctx = $('chart-donut');
  if (!ctx) return;
  if (chartDonut) { chartDonut.destroy(); chartDonut = null; }

  // Use current month data
  const mThu = allEntries.filter(e => {
    const d = new Date(e.date);
    return e.type==='thu' && d.getMonth()===month && d.getFullYear()===year;
  }).reduce((s,e) => s+e.amount, 0);
  const mChi = allEntries.filter(e => {
    const d = new Date(e.date);
    return e.type==='chi' && d.getMonth()===month && d.getFullYear()===year;
  }).reduce((s,e) => s+e.amount, 0);

  const total = mThu + mChi || 1;
  $('dl-thu').textContent = Math.round(mThu/total*100) + '%';
  $('dl-chi').textContent = Math.round(mChi/total*100) + '%';

  chartDonut = new Chart(ctx.getContext('2d'), {
    type: 'doughnut',
    data: {
      datasets:[{
        data: [mThu||0.01, mChi||0],
        backgroundColor:['rgba(34,197,94,.75)','rgba(239,68,68,.7)'],
        borderColor:'#111827', borderWidth:3, hoverOffset:6,
      }],
    },
    options: {
      cutout:'70%',
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmtVND(c.raw)}}},
      animation:{duration:400},
    },
  });
}

function renderRecent() {
  const el = $('recent-list');
  if (!el) return;
  const recent = allEntries.slice(0, 10);
  el.innerHTML = recent.length ? recent.map(entryHTML).join('') : '<div class="empty">Chưa có khoản nào</div>';
}

// ════════════════ STATS ════════════════
function renderStats() {
  const txs = allEntries;
  let totalThu = 0, totalChi = 0;
  txs.forEach(e => {
    if (e.type==='thu') totalThu += e.amount;
    if (e.type==='chi') totalChi += e.amount;
  });
  const net = totalThu - totalChi;

  $('st-net').textContent   = (net >= 0 ? '+' : '') + fmtVND(net);
  $('st-net').style.color   = net >= 0 ? 'var(--thu)' : 'var(--chi)';
  $('st-thu').textContent   = fmtVND(totalThu);
  $('st-chi').textContent   = fmtVND(totalChi);
  $('st-count').textContent = txs.length;

  renderMonthlyChart();
  renderMonthlyTable();
  renderCatBreakdown();
}

function getMonthly(months = 6) {
  const result = [];
  const now = new Date();
  for (let i = months-1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const mes = allEntries.filter(e => e.date.startsWith(ym));
    const thu  = mes.filter(e=>e.type==='thu').reduce((s,e)=>s+e.amount,0);
    const chi  = mes.filter(e=>e.type==='chi').reduce((s,e)=>s+e.amount,0);
    result.push({ label:`T${d.getMonth()+1}/${d.getFullYear()}`, thu, chi, net:thu-chi, count:mes.length });
  }
  return result;
}

function renderMonthlyChart() {
  const ctx = $('chart-monthly');
  if (!ctx) return;
  if (chartMonthly) { chartMonthly.destroy(); chartMonthly = null; }
  const data = getMonthly(6);
  chartMonthly = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels: data.map(d => d.label),
      datasets: [
        { label:'Thu', data:data.map(d=>d.thu), backgroundColor:'rgba(34,197,94,.65)', borderColor:'rgba(34,197,94,.9)',  borderRadius:6, borderWidth:1.5 },
        { label:'Chi', data:data.map(d=>d.chi), backgroundColor:'rgba(239,68,68,.55)', borderColor:'rgba(239,68,68,.8)',  borderRadius:6, borderWidth:1.5 },
      ],
    },
    options: chartOpts(),
  });
}

function renderMonthlyTable() {
  const tbody = $('monthly-tbody');
  if (!tbody) return;
  const data = getMonthly(12).reverse();
  if (!data.some(d => d.count > 0)) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">Chưa có dữ liệu</td></tr>';
    return;
  }
  tbody.innerHTML = data.filter(d=>d.count>0).map(d => `
    <tr>
      <td>${d.label}</td>
      <td class="col-thu">+${fmtVND(d.thu)}</td>
      <td class="col-chi">-${fmtVND(d.chi)}</td>
      <td class="${d.net>=0?'col-thu':'col-chi'}">${d.net>=0?'+':''}${fmtVND(d.net)}</td>
      <td>${d.count}</td>
    </tr>`).join('');
}

function renderCatBreakdown() {
  renderCatList('cat-thu-list', 'thu');
  renderCatList('cat-chi-list', 'chi');
}

function renderCatList(elId, type) {
  const el = $(elId);
  if (!el) return;
  const entries = allEntries.filter(e => e.type === type);
  if (!entries.length) { el.innerHTML = '<div class="empty">Chưa có dữ liệu</div>'; return; }
  const catMap = {};
  entries.forEach(e => { catMap[e.category] = (catMap[e.category]||0) + e.amount; });
  const total = Object.values(catMap).reduce((s,v) => s+v, 0);
  const sorted = Object.entries(catMap).sort((a,b) => b[1]-a[1]);
  el.innerHTML = sorted.map(([cat, amt]) => {
    const pct = total > 0 ? Math.round(amt/total*100) : 0;
    const color = type === 'thu' ? 'var(--thu)' : 'var(--chi)';
    return `
    <div class="cat-row">
      <div class="cat-info">
        <span class="cat-name">${cat}</span>
        <span class="cat-pct">${pct}%</span>
      </div>
      <div class="cat-bar-wrap">
        <div class="cat-bar" style="width:${pct}%;background:${color}"></div>
      </div>
      <div class="cat-amt">${fmtVND(amt)}</div>
    </div>`;
  }).join('');
}

// ════════════════ LEDGER ════════════════
window.filterEntries = (type, el) => {
  document.querySelectorAll('.fpill').forEach(p => p.classList.remove('active'));
  el?.classList.add('active');
  entryFilter = type;
  renderLedger();
};

function populateMonthFilter() {
  const sel = $('month-filter');
  if (!sel) return;
  const months = new Set(allEntries.map(e => e.date.slice(0,7)));
  const sorted = [...months].sort().reverse();
  const cur = sel.value;
  sel.innerHTML = '<option value="">Tất cả tháng</option>' +
    sorted.map(m => {
      const [y, mo] = m.split('-');
      return `<option value="${m}">Tháng ${parseInt(mo)}/${y}</option>`;
    }).join('');
  if (months.has(cur)) sel.value = cur;
}

window.renderLedger = () => {
  let entries = allEntries;
  if (entryFilter !== 'all') entries = entries.filter(e => e.type === entryFilter);

  const search = $('search-input')?.value.trim().toLowerCase();
  if (search) entries = entries.filter(e =>
    e.note.toLowerCase().includes(search) ||
    e.category.toLowerCase().includes(search) ||
    fmtVND(e.amount).includes(search)
  );

  const monthVal = $('month-filter')?.value;
  if (monthVal) entries = entries.filter(e => e.date.startsWith(monthVal));

  // Summary bar
  const totalThu = entries.filter(e=>e.type==='thu').reduce((s,e)=>s+e.amount,0);
  const totalChi = entries.filter(e=>e.type==='chi').reduce((s,e)=>s+e.amount,0);
  const sumBar = $('ledger-sum-bar');
  if (sumBar) {
    sumBar.innerHTML = `
      <span class="lsb-item thu-text"><b>Thu:</b> ${fmtVND(totalThu)}</span>
      <span class="lsb-sep">·</span>
      <span class="lsb-item chi-text"><b>Chi:</b> ${fmtVND(totalChi)}</span>
      <span class="lsb-sep">·</span>
      <span class="lsb-item ${totalThu-totalChi>=0?'thu-text':'chi-text'}"><b>Còn lại:</b> ${fmtVND(totalThu-totalChi)}</span>
      <span class="lsb-count">${entries.length} khoản</span>
    `;
  }

  const el = $('ledger-list');
  if (!el) return;
  if (!entries.length) { el.innerHTML = '<div class="empty">Không tìm thấy khoản nào</div>'; return; }

  let html = '', lastDate = '';
  entries.forEach(e => {
    if (e.date !== lastDate) {
      const d = new Date(e.date + 'T00:00:00');
      const dayEntries = allEntries.filter(x => x.date === e.date);
      const dayThu = dayEntries.filter(x=>x.type==='thu').reduce((s,x)=>s+x.amount,0);
      const dayChi = dayEntries.filter(x=>x.type==='chi').reduce((s,x)=>s+x.amount,0);
      html += `
      <div class="date-group">
        <span class="dg-label">${fmtDateGroup(d)}</span>
        <span class="dg-stats">
          <span class="thu-text">+${fmtVND(dayThu)}</span>
          <span class="dg-sep">·</span>
          <span class="chi-text">-${fmtVND(dayChi)}</span>
        </span>
      </div>`;
      lastDate = e.date;
    }
    html += entryHTML(e);
  });
  el.innerHTML = html;
};

function entryHTML(e) {
  const isThu  = e.type === 'thu';
  const sign   = isThu ? '+' : '-';
  const cls    = isThu ? 'ico-thu' : 'ico-chi';
  const ico    = isThu ? '↑' : '↓';
  const color  = isThu ? 'var(--thu)' : 'var(--chi)';
  return `
  <div class="entry-row">
    <div class="entry-ico ${cls}">${ico}</div>
    <div class="entry-mid">
      <div class="entry-cat">${e.category}</div>
      <div class="entry-note">${e.note || '<span style="opacity:.4">Không có ghi chú</span>'}</div>
    </div>
    <div class="entry-right">
      <div class="entry-amt" style="color:${color}">${sign}${fmtVND(e.amount)}</div>
      <div class="entry-date">${fmtDateShort(new Date(e.date+'T00:00:00'))}</div>
    </div>
    <div class="entry-actions">
      <button onclick="editEntry('${e.id}')" title="Sửa">✎</button>
      <button onclick="deleteEntryUI('${e.id}')" title="Xóa" class="del-btn">✕</button>
    </div>
  </div>`;
}

function updateTodayBadge() {
  const today = todayStr();
  const count = allEntries.filter(e => e.date === today).length;
  const badge = $('today-badge');
  if (count > 0) { badge.textContent = count; badge.style.display = ''; }
  else badge.style.display = 'none';
}

// ════════════════ CHARTS SHARED OPTIONS ════════════════
function chartOpts() {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: c => ' ' + fmtVND(c.raw) } },
    },
    scales: {
      x: { grid:{color:'rgba(255,255,255,.03)'}, ticks:{color:'#6b7280',font:{size:11,family:"'DM Sans'"}} },
      y: { grid:{color:'rgba(255,255,255,.03)'}, ticks:{color:'#6b7280',font:{size:10,family:"'DM Sans'"},callback:v=>v>=1e6?(v/1e6).toFixed(1)+'M':v>=1000?(v/1000)+'k':v} },
    },
    animation: { duration: 400 },
  };
}

// ════════════════ TOAST ════════════════
let toastT;
function showToast(msg, type='') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast on ${type}`;
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), 3200);
}

// ════════════════ HELPERS ════════════════
function showAuthErr(id, msg) {
  const el = $(id);
  el.textContent = msg;
  setTimeout(() => el.textContent = '', 4000);
}

function setLoading(btn, loading, text) {
  btn.disabled  = loading;
  btn.innerHTML = loading ? `<span class="spinner"></span>${text}` : text;
}

function fmtVND(v) {
  return (v ?? 0).toLocaleString('vi-VN', { style:'currency', currency:'VND' });
}

function todayStr() {
  return dateStr(new Date());
}

function dateStr(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth()+1).padStart(2,'0') + '-' +
    String(d.getDate()).padStart(2,'0');
}

function fmtDateGroup(d) {
  const now = new Date();
  const yd  = new Date(now); yd.setDate(now.getDate()-1);
  if (sameDay(d,now)) return 'Hôm nay, ' + d.toLocaleDateString('vi',{day:'numeric',month:'long'});
  if (sameDay(d,yd))  return 'Hôm qua, '  + d.toLocaleDateString('vi',{day:'numeric',month:'long'});
  return d.toLocaleDateString('vi',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
}

function fmtDateShort(d) {
  return d.toLocaleDateString('vi',{day:'2-digit',month:'2-digit',year:'numeric'});
}

function sameDay(a,b) {
  return a.getDate()===b.getDate() && a.getMonth()===b.getMonth() && a.getFullYear()===b.getFullYear();
}

function mapFbErr(code) {
  const m = {
    'auth/user-not-found':       'Email không tồn tại',
    'auth/wrong-password':       'Mật khẩu không đúng',
    'auth/email-already-in-use': 'Email đã được đăng ký',
    'auth/invalid-email':        'Email không hợp lệ',
    'auth/weak-password':        'Mật khẩu quá yếu',
    'auth/too-many-requests':    'Thử lại sau',
    'auth/invalid-credential':   'Email hoặc mật khẩu sai',
  };
  return m[code] || 'Đã xảy ra lỗi, thử lại';
}
