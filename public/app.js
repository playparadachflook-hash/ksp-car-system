const state = {
  user: null,
  vehicles: [],
  drivers: [],
  units: [],
  currentTab: 'list',
  mineOnly: false,
  viewMode: 'calendar',
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth() + 1,
  page: 1,
  masterType: null,
  masterEditId: null,
};

const STATUS_MAP = {
  0: { label: 'รออนุมัติ', cls: 'badge-1', calCls: 'st-1' },
  1: { label: 'อนุมัติแล้ว', cls: 'badge-6', calCls: 'st-6' },
  6: { label: 'ไม่อนุมัติ', cls: 'badge-0', calCls: 'st-0' },
  9: { label: 'ยกเลิกการจอง', cls: 'badge-9', calCls: 'st-9' },
};

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const THAI_FULL_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];
const THAI_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtThaiDate(iso) {
  if (!iso || iso.startsWith('0000')) return '-';
  const p = iso.slice(0, 10).split('-');
  if (p.length !== 3) return iso;
  const y = Number(p[0]) + 543;
  const m = THAI_MONTHS[Number(p[1]) - 1] || p[1];
  return `${Number(p[2])} ${m} ${String(y).slice(-2)}`;
}

async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาดในการเชื่อมต่อ');
  return data;
}

async function init() {
  await Promise.all([loadAuth(), loadStats(), loadMasterLists()]);
  populateYearDropdowns();
  setViewMode('calendar');
}

async function loadAuth() {
  const { user } = await api('/api/auth/me');
  state.user = user;
  renderAuth();
}

function renderAuth() {
  const area = document.getElementById('authArea');
  const adminBtns = document.querySelectorAll('.admin-only');
  const tabMine = document.getElementById('tabMine');
  const adminFormFields = document.getElementById('adminFormFields');
  const createNotice = document.getElementById('createAuthNotice');

  if (state.user) {
    area.innerHTML = `
      <span class="user-badge">👤 ${esc(state.user.fullName)} ${state.user.isAdmin ? '(ผู้จัดรถ/Admin)' : ''}</span>
      <button class="btn btn-white btn-sm" onclick="logout()">ออกจากระบบ</button>
    `;
    tabMine.classList.remove('hidden');
    createNotice.classList.add('hidden');
    adminBtns.forEach((b) => b.classList.toggle('hidden', !state.user.isAdmin));
    adminFormFields.classList.toggle('hidden', !state.user.isAdmin);
    if (!document.getElementById('fRowId').value) {
      document.getElementById('fNumper').value = state.user.fullName;
      document.getElementById('fTel').value = state.user.telephone || '';
      if (state.user.unit_id) document.getElementById('fUnitId').value = state.user.unit_id;
    }
  } else {
    area.innerHTML = `<button class="btn btn-white btn-sm" onclick="openLoginModal()">🔐 เข้าสู่ระบบ</button>`;
    tabMine.classList.add('hidden');
    adminBtns.forEach((b) => b.classList.add('hidden'));
    adminFormFields.classList.add('hidden');
    createNotice.classList.remove('hidden');
  }
}

async function loadStats() {
  const s = await api('/api/stats');
  document.getElementById('statTotal').textContent = s.total.toLocaleString();
  document.getElementById('statPending').textContent = s.pending.toLocaleString();
  document.getElementById('statApproved').textContent = s.approved.toLocaleString();
  document.getElementById('statRejected').textContent = s.rejected.toLocaleString();
  document.getElementById('statCancel').textContent = s.cancelled.toLocaleString();
  document.getElementById('ecoPaper').textContent = s.eco.paper.toLocaleString();
  document.getElementById('ecoBaht').textContent = s.eco.baht.toLocaleString();
  document.getElementById('ecoGhg').textContent = s.eco.ghg;
}

async function loadMasterLists() {
  const [vehicles, drivers, units] = await Promise.all([
    api('/api/vehicles'),
    api('/api/drivers'),
    api('/api/units'),
  ]);
  state.vehicles = vehicles;
  state.drivers = drivers;
  state.units = units;

  const vOptions = vehicles.map((v) => `<option value="${v.row_id}">${esc(v.name)}</option>`).join('');
  document.getElementById('filterVehicle').innerHTML = `<option value="">-- รถทุกคัน --</option>${vOptions}`;
  document.getElementById('fRoomId').innerHTML = `<option value="0">-- เลือกรถยนต์ --</option>${vOptions}`;

  const unitOptions = units.map((u) => `<option value="${u.row_id}">${esc(u.unit_name)}</option>`).join('');
  document.getElementById('fUnitId').innerHTML = `<option value="0">-- เลือกหน่วยงาน --</option>${unitOptions}`;

  document.getElementById('fEquipChecks').innerHTML = drivers
    .map((d) => `<label><input type="checkbox" name="equipCheck" value="${d.row_id}" /> ${esc(d.name)}</label>`)
    .join('');
}

function populateYearDropdowns() {
  const curYear = new Date().getFullYear();
  let html = '<option value="">-- ทุกปี --</option>';
  for (let y = curYear + 1; y >= 2010; y--) {
    html += `<option value="${y}">${y + 543}</option>`;
  }
  document.getElementById('filterYear').innerHTML = html;
  document.getElementById('repYear').innerHTML = html;
}

// ==================== TABS ====================
document.getElementById('navTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-btn');
  if (!btn) return;
  switchTab(btn.dataset.tab);
});

function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-view').forEach((v) => v.classList.add('hidden'));

  if (tab === 'list' || tab === 'mine') {
    state.mineOnly = tab === 'mine';
    document.getElementById('listTitle').textContent = state.mineOnly
      ? 'รายการขอใช้รถของฉัน'
      : state.viewMode === 'calendar'
      ? 'ปฏิทินรายการขอใช้รถยนต์'
      : 'รายการขอใช้รถยนต์';
    document.getElementById('view-list').classList.remove('hidden');
    if (state.viewMode === 'calendar') loadCalendar();
    else loadBookings(1);
  } else {
    document.getElementById(`view-${tab}`).classList.remove('hidden');
    if (tab === 'create' && !document.getElementById('fDatemeet').value) {
      document.getElementById('fDatemeet').value = new Date().toISOString().slice(0, 10);
    }
    if (tab === 'reports') loadReports();
    if (tab === 'vehicles') renderVehicles();
    if (tab === 'drivers') renderDrivers();
    if (tab === 'units') renderUnits();
    if (tab === 'users') loadUsers();
  }
}

// ==================== CALENDAR & BOOKINGS LIST ====================
function setViewMode(mode) {
  state.viewMode = mode;
  document.getElementById('btnViewCal').classList.toggle('active', mode === 'calendar');
  document.getElementById('btnViewTable').classList.toggle('active', mode === 'table');
  document.getElementById('calendarContainer').classList.toggle('hidden', mode !== 'calendar');
  document.getElementById('tableContainer').classList.toggle('hidden', mode !== 'table');
  document.getElementById('listTitle').textContent = state.mineOnly
    ? 'รายการขอใช้รถของฉัน'
    : mode === 'calendar'
    ? 'ปฏิทินรายการขอใช้รถยนต์'
    : 'รายการขอใช้รถยนต์';

  if (mode === 'calendar') loadCalendar();
  else loadBookings(1);
}

function applyFilters() {
  const fy = document.getElementById('filterYear').value;
  const fm = Number(document.getElementById('filterMonth').value || 0);
  if (state.viewMode === 'calendar') {
    if (fy) state.calYear = Number(fy);
    if (fm > 0) state.calMonth = fm;
    loadCalendar();
  } else {
    loadBookings(1);
  }
}

function shiftCalMonth(delta) {
  state.calMonth += delta;
  if (state.calMonth > 12) {
    state.calMonth = 1;
    state.calYear += 1;
  } else if (state.calMonth < 1) {
    state.calMonth = 12;
    state.calYear -= 1;
  }
  loadCalendar();
}

function goCalToday() {
  const now = new Date();
  state.calYear = now.getFullYear();
  state.calMonth = now.getMonth() + 1;
  loadCalendar();
}

async function loadCalendar() {
  const y = state.calYear;
  const m = state.calMonth;
  document.getElementById('calMonthLabel').textContent = `${THAI_FULL_MONTHS[m - 1]} พ.ศ. ${y + 543}`;
  document.getElementById('filterYear').value = String(y);
  document.getElementById('filterMonth').value = String(m);

  const params = new URLSearchParams({
    page: 1,
    limit: 500,
    year: y,
    month: m,
    q: document.getElementById('filterQ').value,
    status: document.getElementById('filterStatus').value,
    room_id: document.getElementById('filterVehicle').value,
    mine: state.mineOnly ? '1' : '0',
  });
  const data = await api(`/api/bookings?${params.toString()}`);

  const byDate = {};
  for (const r of data.items) {
    const d = (r.datemeet || '').slice(0, 10);
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(r);
  }

  const firstDay = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const prevMonthDays = new Date(y, m - 1, 0).getDate();
  const todayIso = new Date().toISOString().slice(0, 10);

  let html = THAI_DAYS.map((d, idx) => {
    const cls = idx === 0 ? 'sun' : idx === 6 ? 'sat' : '';
    return `<div class="cal-day-head ${cls}">${d}</div>`;
  }).join('');

  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  for (let cell = 0; cell < totalCells; cell++) {
    const dayNum = cell - firstDay + 1;
    let cellClass = 'cal-cell';
    let displayNum = dayNum;
    let isoDate = '';

    if (dayNum <= 0) {
      cellClass += ' other-month';
      displayNum = prevMonthDays + dayNum;
    } else if (dayNum > daysInMonth) {
      cellClass += ' other-month';
      displayNum = dayNum - daysInMonth;
    } else {
      isoDate = `${y}-${String(m).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      if (isoDate === todayIso) cellClass += ' today';
    }

    const dayItems = isoDate ? byDate[isoDate] || [] : [];
    const visibleItems = dayItems.slice(0, 4);
    const hiddenCount = dayItems.length - visibleItems.length;

    const itemsHtml = visibleItems
      .map((r) => {
        const st = STATUS_MAP[r.b_status] || { calCls: 'st-1' };
        const title = `#${r.row_id} ${r.subject}${r.perhead ? ' - ' + r.perhead : ''}`;
        return `<div class="cal-item ${st.calCls}" title="${esc(title)}" onclick="viewBooking(${r.row_id})">
          <strong>#${r.row_id}</strong> ${esc(r.subject)}
        </div>`;
      })
      .join('');

    const moreHtml = hiddenCount > 0
      ? `<div class="cal-more" onclick="openDayInTable('${isoDate}')">+ อีก ${hiddenCount} รายการ</div>`
      : '';

    html += `
      <div class="${cellClass}">
        <div class="cal-cell-top">
          <span class="cal-day-num">${displayNum}</span>
          ${dayItems.length ? `<span class="cal-count">${dayItems.length} คัน</span>` : ''}
        </div>
        ${itemsHtml}
        ${moreHtml}
      </div>
    `;
  }

  document.getElementById('calendarGrid').innerHTML = html;
}

function openDayInTable(isoDate) {
  setViewMode('table');
  loadBookings(1, isoDate);
}

async function loadBookings(page = 1, exactDate = '') {
  state.page = page;
  const params = new URLSearchParams({
    page,
    limit: 30,
    date: exactDate,
    q: document.getElementById('filterQ').value,
    year: exactDate ? '' : document.getElementById('filterYear').value,
    month: exactDate ? '0' : document.getElementById('filterMonth').value,
    status: document.getElementById('filterStatus').value,
    room_id: document.getElementById('filterVehicle').value,
    mine: state.mineOnly ? '1' : '0',
  });

  const data = await api(`/api/bookings?${params.toString()}`);
  const tbody = document.getElementById('bookingsTbody');

  if (!data.items.length) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#64748b;padding:24px;">ไม่พบรายการขอใช้รถยนต์</td></tr>';
  } else {
    tbody.innerHTML = data.items
      .map((r) => {
        const st = STATUS_MAP[r.b_status] || { label: `สถานะ ${r.b_status}`, cls: 'badge-1' };
        const unit = r.unit_name || r.unit_out || '-';
        const drivers = r.equipNames.length ? r.equipNames.join(', ') : '-';
        const canEdit = state.user && (state.user.isAdmin || r.perbook === state.user.fullName || r.user_id === state.user.row_id);
        const kmOil = [r.sum_km ? `${r.sum_km} ก.ม.` : '', r.oil ? `${r.oil} บ.` : ''].filter(Boolean).join(' / ') || '-';
        return `
          <tr>
            <td><strong>#${r.row_id}</strong></td>
            <td style="white-space:nowrap">${fmtThaiDate(r.datemeet)}</td>
            <td style="white-space:nowrap">${esc(r.s_time || '')}${r.e_time ? ' - ' + esc(r.e_time) : ''}</td>
            <td>${esc(r.room_name || '-')}</td>
            <td><strong>${esc(r.subject)}</strong>${r.perhead ? `<br><small style="color:#64748b">📍 ${esc(r.perhead)}</small>` : ''}</td>
            <td>${esc(unit)}</td>
            <td>${esc(r.numper || r.perbook || '-')}</td>
            <td>${esc(drivers)}</td>
            <td style="white-space:nowrap">${esc(kmOil)}</td>
            <td><span class="badge ${st.cls}">${st.label}</span></td>
            <td class="no-print" style="white-space:nowrap">
              <button class="btn btn-outline btn-sm" onclick="viewBooking(${r.row_id})">ดู/พิมพ์</button>
              ${canEdit ? `<button class="btn btn-primary btn-sm" onclick="editBooking(${r.row_id})">แก้ไข</button>` : ''}
              ${state.user?.isAdmin ? `<button class="btn btn-danger btn-sm" onclick="deleteBooking(${r.row_id})">ลบ</button>` : ''}
            </td>
          </tr>
        `;
      })
      .join('');
  }

  document.getElementById('pagination').innerHTML = `
    <div>ทั้งหมด <strong>${data.total.toLocaleString()}</strong> รายการ (หน้า ${data.page} / ${data.totalPages})</div>
    <div style="display:flex;gap:6px;">
      <button class="btn btn-outline btn-sm" ${data.page <= 1 ? 'disabled' : ''} onclick="loadBookings(${data.page - 1})">◀ ก่อนหน้า</button>
      <button class="btn btn-outline btn-sm" ${data.page >= data.totalPages ? 'disabled' : ''} onclick="loadBookings(${data.page + 1})">ถัดไป ▶</button>
    </div>
  `;
}

function resetFilters() {
  document.getElementById('filterQ').value = '';
  document.getElementById('filterStatus').value = '';
  document.getElementById('filterVehicle').value = '';
  if (state.viewMode === 'calendar') {
    goCalToday();
  } else {
    document.getElementById('filterYear').value = '';
    document.getElementById('filterMonth').value = '0';
    loadBookings(1);
  }
}

document.getElementById('filterQ').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') applyFilters();
});

// ==================== A4 PDF MODAL ====================
function openPdfModal(title, pdfUrl) {
  const modal = document.getElementById('detailModal');
  const frame = document.getElementById('pdfFrame');
  const loading = document.getElementById('pdfLoading');
  const dlBtn = document.getElementById('pdfDownloadBtn');
  const newTabBtn = document.getElementById('pdfNewTabBtn');

  document.getElementById('pdfModalTitle').textContent = title;
  const sep = pdfUrl.includes('?') ? '&' : '?';
  dlBtn.href = `${pdfUrl}${sep}download=1`;
  newTabBtn.href = pdfUrl;

  loading.classList.remove('hidden');
  frame.onload = () => loading.classList.add('hidden');
  frame.src = pdfUrl;
  modal.classList.remove('hidden');
}

function closePdfModal() {
  document.getElementById('pdfFrame').src = 'about:blank';
  closeModal('detailModal');
}

function printPdfFrame() {
  const frame = document.getElementById('pdfFrame');
  try {
    frame.contentWindow.focus();
    frame.contentWindow.print();
  } catch {
    window.open(document.getElementById('pdfNewTabBtn').href, '_blank');
  }
}

function viewBooking(id) {
  openPdfModal(`ใบขออนุญาตใช้รถยนต์ราชการ #${id} (ขนาด A4)`, `/api/bookings/${id}/pdf`);
}

function printBoard() {
  const params = new URLSearchParams({
    q: document.getElementById('filterQ').value,
    year: document.getElementById('filterYear').value,
    month: document.getElementById('filterMonth').value,
    status: document.getElementById('filterStatus').value,
    room_id: document.getElementById('filterVehicle').value,
  });
  openPdfModal('ตารางการใช้รถยนต์ราชการ (ขนาด A4 แนวนอน)', `/api/bookings/board/pdf?${params.toString()}`);
}

// ==================== CREATE / EDIT BOOKING ====================
function toggleUnitType() {
  const isExt = document.querySelector('input[name="unitType"]:checked').value === 'external';
  document.getElementById('fgUnitInternal').classList.toggle('hidden', isExt);
  document.getElementById('fgUnitExternal').classList.toggle('hidden', !isExt);
}

function calcSumKm() {
  const s = Number(document.getElementById('fStartKm').value || 0);
  const e = Number(document.getElementById('fStopKm').value || 0);
  if (e > s && s > 0) {
    document.getElementById('fSumKm').value = e - s;
  }
}

function resetBookingForm() {
  document.getElementById('bookingForm').reset();
  document.getElementById('fRowId').value = '';
  document.getElementById('bookingFormTitle').textContent = 'แบบบันทึกขออนุญาตใช้รถยนต์ราชการ';
  document.getElementById('fDatemeet').value = new Date().toISOString().slice(0, 10);
  document.querySelector('input[name="unitType"][value="internal"]').checked = true;
  toggleUnitType();
  if (state.user) {
    document.getElementById('fNumper').value = state.user.fullName;
    document.getElementById('fTel').value = state.user.telephone || '';
    if (state.user.unit_id) document.getElementById('fUnitId').value = state.user.unit_id;
  }
}

async function editBooking(id) {
  const r = await api(`/api/bookings/${id}`);
  switchTab('create');
  document.getElementById('bookingFormTitle').textContent = `แก้ไขใบขอใช้รถ #${r.row_id}`;
  document.getElementById('fRowId').value = r.row_id;

  const isExt = !!r.unit_out;
  document.querySelector(`input[name="unitType"][value="${isExt ? 'external' : 'internal'}"]`).checked = true;
  toggleUnitType();
  document.getElementById('fUnitId').value = r.unit_id || 0;
  document.getElementById('fUnitOut').value = r.unit_out || '';
  document.getElementById('fRoomId').value = r.room_id || 0;
  document.getElementById('fSubject').value = r.subject || '';
  document.getElementById('fPerhead').value = r.perhead || '';
  document.getElementById('fPassenger').value = r.passenger || '';
  document.getElementById('fNumper').value = r.numper || '';
  document.getElementById('fTel').value = r.tel || '';
  document.getElementById('fDatemeet').value = (r.datemeet || '').slice(0, 10);
  document.getElementById('fStime').value = r.s_time || '08:30';
  document.getElementById('fEtime').value = r.e_time || '16:30';
  document.getElementById('fMemo').value = r.memo || '';

  if (state.user?.isAdmin) {
    document.getElementById('fStatus').value = String(r.b_status ?? 0);
    document.getElementById('fTtime').value = r.t_time || '';
    document.getElementById('fStartKm').value = r.start_km || '';
    document.getElementById('fStopKm').value = r.stop_km || '';
    document.getElementById('fSumKm').value = r.sum_km || '';
    document.getElementById('fOil').value = r.oil || '';
    document.getElementById('fBillOil').value = r.bill_oil || '';
    document.getElementById('fMemo1').value = r.memo1 || '';
    document.querySelectorAll('input[name="equipCheck"]').forEach((cb) => {
      cb.checked = r.equipIds.includes(cb.value);
    });
  }
}

async function submitBooking(e) {
  e.preventDefault();
  if (!state.user) return openLoginModal();

  const id = document.getElementById('fRowId').value;
  const isExt = document.querySelector('input[name="unitType"]:checked').value === 'external';
  const equipIds = Array.from(document.querySelectorAll('input[name="equipCheck"]:checked')).map((c) => c.value);

  const payload = {
    unit_id: isExt ? 0 : Number(document.getElementById('fUnitId').value || 0),
    unit_out: isExt ? document.getElementById('fUnitOut').value : '',
    room_id: Number(document.getElementById('fRoomId').value || 0),
    subject: document.getElementById('fSubject').value,
    perhead: document.getElementById('fPerhead').value,
    passenger: document.getElementById('fPassenger').value,
    numper: document.getElementById('fNumper').value,
    tel: document.getElementById('fTel').value,
    datemeet: document.getElementById('fDatemeet').value,
    s_time: document.getElementById('fStime').value,
    e_time: document.getElementById('fEtime').value,
    memo: document.getElementById('fMemo').value,
    equipIds,
    b_status: Number(document.getElementById('fStatus').value || 0),
    t_time: document.getElementById('fTtime').value,
    start_km: document.getElementById('fStartKm').value,
    stop_km: document.getElementById('fStopKm').value,
    sum_km: document.getElementById('fSumKm').value,
    oil: document.getElementById('fOil').value,
    bill_oil: document.getElementById('fBillOil').value,
    memo1: document.getElementById('fMemo1').value,
  };

  try {
    if (id) {
      await api(`/api/bookings/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      alert('บันทึกการแก้ไขเรียบร้อยแล้ว');
    } else {
      await api('/api/bookings', { method: 'POST', body: JSON.stringify(payload) });
      alert('บันทึกคำขอใช้รถยนต์เรียบร้อยแล้ว');
    }
    resetBookingForm();
    await loadStats();
    switchTab('list');
  } catch (err) {
    alert(err.message);
  }
}

async function deleteBooking(id) {
  if (!confirm(`ยืนยันการลบใบขอใช้รถ #${id} ?`)) return;
  await api(`/api/bookings/${id}`, { method: 'DELETE' });
  await loadStats();
  loadBookings(state.page);
}

// ==================== REPORTS ====================
async function loadReports() {
  const year = document.getElementById('repYear').value;
  const month = document.getElementById('repMonth').value;
  const data = await api(`/api/reports/summary?year=${year}&month=${month}`);

  const renderTable = (title, headers, rowsHtml) => `
    <div class="report-box">
      <h3>${title}</h3>
      <div class="table-wrap">
        <table>
          <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${rowsHtml || '<tr><td colspan="4">ไม่มีข้อมูล</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;

  const deptRows = data.byDepartment
    .map((r) => `<tr><td>${esc(r.name)}</td><td>${r.total}</td><td>${Number(r.total_km).toLocaleString()}</td><td>${Number(r.total_oil).toLocaleString()}</td></tr>`)
    .join('');

  const vehRows = data.byVehicle
    .map((r) => `<tr><td>${esc(r.name)}</td><td>${r.total}</td><td>${Number(r.total_km).toLocaleString()}</td><td>${Number(r.total_oil).toLocaleString()}</td></tr>`)
    .join('');

  const drvRows = data.byDriver
    .map((r) => `<tr><td>${esc(r.name)}</td><td>${r.total}</td></tr>`)
    .join('');

  const statusRows = data.byStatus
    .map((r) => `<tr><td>${(STATUS_MAP[r.b_status] || {}).label || r.b_status}</td><td>${r.total}</td></tr>`)
    .join('');

  const scopeRows = `
    <tr><td>ภายในจังหวัด</td><td>${data.internalCount}</td></tr>
    <tr><td>ไปต่างจังหวัด</td><td>${data.externalCount}</td></tr>
  `;

  document.getElementById('reportsContent').innerHTML =
    renderTable('สรุปตามสถานะ & พื้นที่', ['รายการ', 'จำนวน (ครั้ง)'], statusRows + scopeRows) +
    renderTable('สรุปตามพนักงานขับรถ (พขร.)', ['ชื่อ พขร.', 'จำนวนเที่ยว'], drvRows) +
    renderTable('สรุปตามรถที่ให้บริการ', ['รถยนต์', 'เที่ยว', 'ระยะทาง (ก.ม.)', 'น้ำมัน (บ.)'], vehRows) +
    renderTable('สรุปตามหน่วยงาน', ['หน่วยงาน', 'เที่ยว', 'ระยะทาง (ก.ม.)', 'น้ำมัน (บ.)'], deptRows);
}

// ==================== MASTER CRUD ====================
function renderVehicles() {
  document.getElementById('vehiclesTbody').innerHTML = state.vehicles
    .map(
      (v) => `
      <tr>
        <td>${v.row_id}</td>
        <td><strong>${esc(v.name)}</strong></td>
        <td>${esc(v.brand || '-')}</td>
        <td>${esc(v.car_no || '-')}</td>
        <td>${esc(v.numper || '-')}</td>
        <td>${esc(v.tel || '-')}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="openMasterModal('vehicle', ${v.row_id})">แก้ไข</button>
          <button class="btn btn-danger btn-sm" onclick="deleteMaster('vehicles', ${v.row_id}, renderVehicles)">ลบ</button>
        </td>
      </tr>`
    )
    .join('');
}

function renderDrivers() {
  document.getElementById('driversTbody').innerHTML = state.drivers
    .map(
      (d) => `
      <tr>
        <td>${d.row_id}</td>
        <td><strong>${esc(d.name)}</strong></td>
        <td>${esc(d.tel || '-')}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="openMasterModal('driver', ${d.row_id})">แก้ไข</button>
          <button class="btn btn-danger btn-sm" onclick="deleteMaster('drivers', ${d.row_id}, renderDrivers)">ลบ</button>
        </td>
      </tr>`
    )
    .join('');
}

function renderUnits() {
  document.getElementById('unitsTbody').innerHTML = state.units
    .map(
      (u) => `
      <tr>
        <td>${u.row_id}</td>
        <td>${esc(u.unit_code || '-')}</td>
        <td><strong>${esc(u.unit_name)}</strong></td>
        <td>${esc(u.unit_head || '-')}</td>
        <td>${esc(u.tel || '-')}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="openMasterModal('unit', ${u.row_id})">แก้ไข</button>
          <button class="btn btn-danger btn-sm" onclick="deleteMaster('units', ${u.row_id}, renderUnits)">ลบ</button>
        </td>
      </tr>`
    )
    .join('');
}

let cachedUsers = [];
async function loadUsers() {
  cachedUsers = await api('/api/users');
  document.getElementById('usersTbody').innerHTML = cachedUsers
    .map(
      (u) => `
      <tr>
        <td>${u.row_id}</td>
        <td><strong>${esc(u.title)}${esc(u.fname)} ${esc(u.lname)}</strong></td>
        <td>${esc(u.puchai)}</td>
        <td>${esc(u.unit_name || '-')}</td>
        <td>${esc(u.telephone || '-')}</td>
        <td><span class="badge ${u.usertype === 'adminn' ? 'badge-1' : 'badge-6'}">${u.usertype === 'adminn' ? 'ผู้จัดรถ/Admin' : 'ผู้ใช้ทั่วไป'}</span></td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="openMasterModal('user', ${u.row_id})">แก้ไข</button>
          <button class="btn btn-danger btn-sm" onclick="deleteMaster('users', ${u.row_id}, loadUsers)">ลบ</button>
        </td>
      </tr>`
    )
    .join('');
}

function openMasterModal(type, id = null) {
  state.masterType = type;
  state.masterEditId = id;
  const form = document.getElementById('masterForm');
  const title = document.getElementById('masterModalTitle');

  if (type === 'vehicle') {
    const item = id ? state.vehicles.find((x) => x.row_id === id) : {};
    title.textContent = id ? 'แก้ไขข้อมูลรถยนต์' : 'เพิ่มรถยนต์';
    form.innerHTML = `
      <div class="form-group"><label>ทะเบียน / ชื่อรถ *</label><input name="name" required value="${esc(item.name || '')}" /></div>
      <div class="form-group"><label>ยี่ห้อ</label><input name="brand" value="${esc(item.brand || '')}" /></div>
      <div class="form-group"><label>เลขตัวถัง</label><input name="car_no" value="${esc(item.car_no || '')}" /></div>
      <div class="form-group"><label>จำนวนที่นั่ง</label><input name="numper" value="${esc(item.numper || '')}" /></div>
      <div class="form-group"><label>เบอร์โทร</label><input name="tel" value="${esc(item.tel || '')}" /></div>
      <div class="form-actions"><button class="btn btn-primary full-btn" type="submit">บันทึก</button></div>
    `;
  } else if (type === 'driver') {
    const item = id ? state.drivers.find((x) => x.row_id === id) : {};
    title.textContent = id ? 'แก้ไขข้อมูล พขร.' : 'เพิ่มพนักงานขับรถ (พขร.)';
    form.innerHTML = `
      <div class="form-group"><label>ชื่อ-นามสกุล พขร. *</label><input name="name" required value="${esc(item.name || '')}" /></div>
      <div class="form-group"><label>เบอร์โทร</label><input name="tel" value="${esc(item.tel || '')}" /></div>
      <div class="form-actions"><button class="btn btn-primary full-btn" type="submit">บันทึก</button></div>
    `;
  } else if (type === 'unit') {
    const item = id ? state.units.find((x) => x.row_id === id) : {};
    title.textContent = id ? 'แก้ไขหน่วยงาน' : 'เพิ่มหน่วยงาน';
    form.innerHTML = `
      <div class="form-group"><label>รหัสหน่วยงาน</label><input name="unit_code" value="${esc(item.unit_code || '')}" /></div>
      <div class="form-group"><label>ชื่อหน่วยงาน *</label><input name="unit_name" required value="${esc(item.unit_name || '')}" /></div>
      <div class="form-group"><label>หัวหน้าหน่วยงาน</label><input name="unit_head" value="${esc(item.unit_head || '')}" /></div>
      <div class="form-group"><label>เบอร์โทร</label><input name="tel" value="${esc(item.tel || '')}" /></div>
      <div class="form-actions"><button class="btn btn-primary full-btn" type="submit">บันทึก</button></div>
    `;
  } else if (type === 'user') {
    const item = id ? cachedUsers.find((x) => x.row_id === id) : {};
    title.textContent = id ? 'แก้ไขผู้ใช้งาน' : 'เพิ่มผู้ใช้งาน';
    const unitOpts = state.units.map((u) => `<option value="${u.row_id}" ${u.row_id === item.unit_id ? 'selected' : ''}>${esc(u.unit_name)}</option>`).join('');
    form.innerHTML = `
      <div class="form-group"><label>คำนำหน้า</label><input name="title" value="${esc(item.title || '')}" /></div>
      <div class="form-group"><label>ชื่อ *</label><input name="fname" required value="${esc(item.fname || '')}" /></div>
      <div class="form-group"><label>นามสกุล</label><input name="lname" value="${esc(item.lname || '')}" /></div>
      <div class="form-group"><label>หน่วยงาน</label><select name="unit_id"><option value="0">-- เลือก --</option>${unitOpts}</select></div>
      <div class="form-group"><label>เบอร์โทร</label><input name="telephone" value="${esc(item.telephone || '')}" /></div>
      <div class="form-group"><label>Username *</label><input name="puchai" required value="${esc(item.puchai || '')}" /></div>
      <div class="form-group"><label>Password ${id ? '(เว้นว่างหากไม่เปลี่ยน)' : '*'}</label><input name="rahuspan" type="password" ${id ? '' : 'required'} /></div>
      <div class="form-group"><label>สิทธิ์การใช้งาน</label>
        <select name="usertype">
          <option value="user" ${item.usertype !== 'adminn' ? 'selected' : ''}>ผู้ใช้ทั่วไป</option>
          <option value="adminn" ${item.usertype === 'adminn' ? 'selected' : ''}>ผู้ดูแลระบบ (จัดรถ)</option>
        </select>
      </div>
      <div class="form-actions"><button class="btn btn-primary full-btn" type="submit">บันทึก</button></div>
    `;
  }

  document.getElementById('masterModal').classList.remove('hidden');
}

async function submitMaster(e) {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target).entries());
  const endpointMap = { vehicle: 'vehicles', driver: 'drivers', unit: 'units', user: 'users' };
  const ep = endpointMap[state.masterType];

  try {
    if (state.masterEditId) {
      await api(`/api/${ep}/${state.masterEditId}`, { method: 'PUT', body: JSON.stringify(fd) });
    } else {
      await api(`/api/${ep}`, { method: 'POST', body: JSON.stringify(fd) });
    }
    closeModal('masterModal');
    await loadMasterLists();
    if (state.masterType === 'vehicle') renderVehicles();
    if (state.masterType === 'driver') renderDrivers();
    if (state.masterType === 'unit') renderUnits();
    if (state.masterType === 'user') loadUsers();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteMaster(ep, id, refreshFn) {
  if (!confirm('ยืนยันการลบข้อมูลนี้ ?')) return;
  await api(`/api/${ep}/${id}`, { method: 'DELETE' });
  await loadMasterLists();
  refreshFn();
}

// ==================== LOGIN / MODALS ====================
function openLoginModal() {
  document.getElementById('loginError').classList.add('hidden');
  document.getElementById('loginModal').classList.remove('hidden');
  document.getElementById('loginUser').focus();
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

async function submitLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById('loginError');
  errEl.classList.add('hidden');
  try {
    await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('loginUser').value,
        password: document.getElementById('loginPass').value,
      }),
    });
    closeModal('loginModal');
    await loadAuth();
    if (state.viewMode === 'calendar') loadCalendar();
    else loadBookings(state.page);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}

async function logout() {
  await api('/api/auth/logout', { method: 'POST' });
  state.user = null;
  renderAuth();
  switchTab('list');
}

init();
