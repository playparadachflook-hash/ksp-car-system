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
  if (!state.user) openLoginModal();
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
  let fyHtml = '';
  for (let y = curYear + 1; y >= 2010; y--) {
    html += `<option value="${y}">${y + 543}</option>`;
    fyHtml += `<option value="${y + 543}">ปีงบประมาณ ${y + 543}</option>`;
  }
  document.getElementById('filterYear').innerHTML = html;
  document.getElementById('repYear').innerHTML = html;
  const fyEl = document.getElementById('repFiscalYear');
  if (fyEl) fyEl.innerHTML = fyHtml;
  const rdEl = document.getElementById('repDate');
  if (rdEl) rdEl.value = new Date().toISOString().slice(0, 10);
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
    if (tab === 'admin') loadAdminList(1);
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
              <button class="btn btn-outline btn-sm" onclick="viewBooking(${r.row_id})">${state.user?.isAdmin ? 'ดู/พิมพ์' : 'ดูรายละเอียด'}</button>
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
  if (!state.user?.isAdmin) {
    alert('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถดาวน์โหลดหรือพิมพ์เอกสารได้');
    return;
  }
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

async function openRequestDetailModal(id) {
  const r = await api(`/api/bookings/${id}`);
  const st = STATUS_MAP[r.b_status] || { label: `สถานะ ${r.b_status}`, cls: 'badge-1' };
  const unit = r.unit_name || r.unit_out || '-';
  const drivers = r.equipNames && r.equipNames.length ? r.equipNames.join(', ') : '-';
  const kmInfo = (r.start_km || r.stop_km || r.sum_km)
    ? `เริ่มต้น ${esc(r.start_km || 0)} - สิ้นสุด ${esc(r.stop_km || 0)} (รวม ${esc(r.sum_km || 0)} ก.ม.)`
    : '-';
  document.getElementById('reqDetailTitle').textContent = `รายละเอียดการขอใช้รถยนต์ #${r.row_id}`;
  document.getElementById('reqDetailBody').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;font-size:14px;">
      <div><strong>เลขที่รายการ:</strong> #${r.row_id}</div>
      <div><strong>สถานะ:</strong> <span class="badge ${st.cls}">${st.label}</span></div>
      <div><strong>วันที่ใช้รถ:</strong> ${fmtThaiDate(r.datemeet)}</div>
      <div><strong>เวลา:</strong> ${esc(r.s_time || '-')}${r.e_time ? ' - ' + esc(r.e_time) : ''}</div>
      <div style="grid-column:1/-1;"><strong>เรื่อง / ภารกิจ:</strong> ${esc(r.subject || '-')}</div>
      <div style="grid-column:1/-1;"><strong>สถานที่ไปราชการ:</strong> ${esc(r.perhead || '-')}</div>
      <div><strong>ผู้ขอใช้รถ:</strong> ${esc(r.numper || r.perbook || '-')}</div>
      <div><strong>เบอร์โทร:</strong> ${esc(r.tel || '-')}</div>
      <div><strong>หน่วยงาน:</strong> ${esc(unit)}</div>
      <div><strong>จำนวนผู้ร่วมเดินทาง:</strong> ${esc(r.passenger || '-')} คน</div>
      <div><strong>รถยนต์:</strong> ${esc(r.room_name || 'ยังไม่จัดรถ')}</div>
      <div><strong>พนักงานขับรถ (พขร.):</strong> ${esc(drivers)}</div>
      <div><strong>เลขไมล์:</strong> ${kmInfo}</div>
      <div><strong>ค่าน้ำมัน:</strong> ${r.oil ? `${Number(r.oil).toLocaleString()} บาท` : '-'}</div>
      <div style="grid-column:1/-1;"><strong>หมายเหตุ / รายละเอียดเพิ่มเติม:</strong> ${esc(r.memo || '-')}</div>
      <div style="grid-column:1/-1;"><strong>ความเห็นผู้ดูแลระบบ:</strong> ${esc(r.memo1 || '-')}</div>
    </div>
  `;
  document.getElementById('requestDetailModal').classList.remove('hidden');
}

function viewBooking(id) {
  if (state.user?.isAdmin) {
    openPdfModal(`ใบขออนุญาตใช้รถยนต์ราชการ #${id} (ขนาด A4)`, `/api/bookings/${id}/pdf`);
  } else {
    openRequestDetailModal(id).catch((err) => alert(err.message));
  }
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
function toggleReportMode() {
  const mode = document.getElementById('repMode').value;
  document.getElementById('repDate').classList.toggle('hidden', mode !== 'date');
  document.getElementById('repMonth').classList.toggle('hidden', mode !== 'month');
  document.getElementById('repYear').classList.toggle('hidden', mode !== 'month');
  document.getElementById('repFiscalYear').classList.toggle('hidden', mode !== 'fiscal');
}

function getReportQueryString() {
  const mode = document.getElementById('repMode').value;
  const params = new URLSearchParams();
  if (mode === 'date') {
    const d = document.getElementById('repDate').value;
    if (d) params.set('date', d);
  } else if (mode === 'month') {
    const y = document.getElementById('repYear').value;
    const m = document.getElementById('repMonth').value;
    if (y) params.set('year', y);
    if (m && m !== '0') params.set('month', m);
  } else if (mode === 'fiscal') {
    const fy = document.getElementById('repFiscalYear').value;
    if (fy) params.set('fiscalYear', fy);
  }
  return params.toString();
}

function printReportSection(section, title) {
  const qs = getReportQueryString();
  const url = `/api/reports/pdf?section=${section}${qs ? '&' + qs : ''}`;
  openPdfModal(`${title} (ขนาด A4)`, url);
}

async function loadReports() {
  const qs = getReportQueryString();
  const data = await api(`/api/reports/summary${qs ? '?' + qs : ''}`);

  const renderTable = (title, section, headers, rowsHtml) => `
    <div class="report-box">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
        <h3 style="margin:0;">${title}</h3>
        ${state.user?.isAdmin ? `<button class="btn btn-outline btn-sm" onclick="printReportSection('${section}', '${title}')">🖨️ พิมพ์ / PDF</button>` : ''}
      </div>
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
    .map((r) => {
      const tripList = (r.trips || [])
        .map((t) => `<div style="font-size:12px;color:#334155;line-height:1.45;padding:1px 0;">${esc(t.line || `${fmtThaiDate(t.datemeet)} | ${t.place} (ผู้ขอใช้รถ: ${t.requester || '-'})`)}</div>`)
        .join('');
      return `<tr><td style="vertical-align:top"><strong>${esc(r.name)}</strong></td><td style="white-space:nowrap;vertical-align:top"><strong>${r.total}</strong> เที่ยว</td><td>${tripList || '-'}</td></tr>`;
    })
    .join('');

  const statusRows = data.byStatus
    .map((r) => `<tr><td>${(STATUS_MAP[r.b_status] || {}).label || r.b_status}</td><td>${r.total}</td></tr>`)
    .join('');

  const scopeRows = `
    <tr><td>ภายในจังหวัด</td><td>${data.internalCount}</td></tr>
    <tr><td>ไปต่างจังหวัด</td><td>${data.externalCount}</td></tr>
  `;

  document.getElementById('reportsContent').innerHTML =
    renderTable('รายงานสรุปตามพนักงานขับรถ (พขร.)', 'driver', ['ชื่อ พขร.', 'จำนวนเที่ยว', 'รายละเอียดการเดินทาง (วันเดือนปี / สถานที่ / ชื่อผู้ขอใช้รถ)'], drvRows) +
    renderTable('รายงานสรุปตามรถที่ให้บริการ', 'vehicle', ['รถยนต์', 'เที่ยว', 'ระยะทาง (ก.ม.)', 'น้ำมัน (บ.)'], vehRows) +
    renderTable('รายงานสรุปตามหน่วยงาน', 'department', ['หน่วยงาน', 'เที่ยว', 'ระยะทาง (ก.ม.)', 'น้ำมัน (บ.)'], deptRows) +
    renderTable('รายงานสรุปตามสถานะ & พื้นที่', 'status', ['รายการ', 'จำนวน (ครั้ง)'], statusRows + scopeRows);
}

// ==================== ADMIN APPROVAL & ASSIGNMENT ====================
async function loadAdminList(page = 1) {
  const params = new URLSearchParams({
    page,
    limit: 30,
    status: document.getElementById('adminFilterStatus').value,
    q: document.getElementById('adminFilterQ').value,
  });
  const data = await api(`/api/bookings?${params.toString()}`);
  const tbody = document.getElementById('adminTbody');

  if (!data.items.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#64748b;padding:24px;">ไม่พบรายการในสถานะที่เลือก</td></tr>';
  } else {
    tbody.innerHTML = data.items
      .map((r) => {
        const st = STATUS_MAP[r.b_status] || { label: r.b_status, cls: 'badge-1' };
        const unit = r.unit_name || r.unit_out || '-';
        const assignee = [...(r.equipNames || []), r.assigned_to || ''].filter(Boolean).join(', ') || '-';
        return `
          <tr>
            <td><strong>#${r.row_id}</strong></td>
            <td style="white-space:nowrap">${fmtThaiDate(r.datemeet)}<br><small style="color:#64748b">${esc(r.s_time || '')}-${esc(r.e_time || '')}</small></td>
            <td><strong>${esc(r.subject)}</strong>${r.perhead ? `<br><small style="color:#64748b">📍 ${esc(r.perhead)}</small>` : ''}</td>
            <td>${esc(unit)}<br><small style="color:#64748b">${esc(r.numper || r.perbook || '-')}</small></td>
            <td>${esc(r.room_name || '-')}</td>
            <td>${esc(assignee)}</td>
            <td><span class="badge ${st.cls}">${st.label}</span></td>
            <td style="white-space:nowrap">
              <button class="btn btn-outline btn-sm" onclick="viewBooking(${r.row_id})">👁️ ดู PDF</button>
              <button class="btn btn-primary btn-sm" onclick="openAdminActionModal(${r.row_id})">✅ อนุมัติ / จัดรถ</button>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  document.getElementById('adminPagination').innerHTML = `
    <div>ทั้งหมด <strong>${data.total.toLocaleString()}</strong> รายการ (หน้า ${data.page} / ${data.totalPages})</div>
    <div style="display:flex;gap:6px;">
      <button class="btn btn-outline btn-sm" ${data.page <= 1 ? 'disabled' : ''} onclick="loadAdminList(${data.page - 1})">◀ ก่อนหน้า</button>
      <button class="btn btn-outline btn-sm" ${data.page >= data.totalPages ? 'disabled' : ''} onclick="loadAdminList(${data.page + 1})">ถัดไป ▶</button>
    </div>
  `;
}

function calcAaSumKm() {
  const s = Number(document.getElementById('aaStartKm').value || 0);
  const e = Number(document.getElementById('aaStopKm').value || 0);
  if (e > s && s > 0) {
    document.getElementById('aaSumKm').value = e - s;
  }
}

async function openAdminActionModal(id) {
  const r = await api(`/api/bookings/${id}`);
  document.getElementById('aaRowId').textContent = r.row_id;
  document.getElementById('aaId').value = r.row_id;
  document.getElementById('aaSummary').innerHTML = `
    <strong>เรื่อง:</strong> ${esc(r.subject)} (${esc(r.perhead || '-')})<br>
    <strong>หน่วยงาน:</strong> ${esc(r.unit_name || r.unit_out || '-')} | <strong>ผู้ขอ:</strong> ${esc(r.numper || '-')} | <strong>วันที่:</strong> ${fmtThaiDate(r.datemeet)}
  `;
  document.getElementById('aaStatus').value = String(r.b_status ?? 0);
  document.getElementById('aaRoomId').innerHTML =
    '<option value="0">-- ยังไม่ระบุรถ --</option>' +
    state.vehicles.map((v) => `<option value="${v.row_id}" ${v.row_id === r.room_id ? 'selected' : ''}>${esc(v.name)}</option>`).join('');
  document.getElementById('aaAssignedTo').value = r.assigned_to || '';
  document.getElementById('aaTtime').value = r.t_time || '';
  document.getElementById('aaStartKm').value = r.start_km || '';
  document.getElementById('aaStopKm').value = r.stop_km || '';
  document.getElementById('aaSumKm').value = r.sum_km || '';
  document.getElementById('aaOil').value = r.oil || '';
  document.getElementById('aaBillOil').value = r.bill_oil || '';
  document.getElementById('aaMemo1').value = r.memo1 || '';

  document.getElementById('aaEquipChecks').innerHTML = state.drivers
    .map((d) => `<label><input type="checkbox" name="aaEquip" value="${d.row_id}" ${r.equipIds.includes(String(d.row_id)) ? 'checked' : ''} /> ${esc(d.name)}</label>`)
    .join('');

  document.getElementById('adminActionModal').classList.remove('hidden');
}

async function submitAdminAction(e) {
  e.preventDefault();
  const id = document.getElementById('aaId').value;
  const equipIds = Array.from(document.querySelectorAll('input[name="aaEquip"]:checked')).map((c) => c.value);
  await api(`/api/bookings/${id}/approve`, {
    method: 'PATCH',
    body: JSON.stringify({
      b_status: Number(document.getElementById('aaStatus').value),
      room_id: Number(document.getElementById('aaRoomId').value || 0),
      equipIds,
      assigned_to: document.getElementById('aaAssignedTo').value,
      t_time: document.getElementById('aaTtime').value,
      start_km: document.getElementById('aaStartKm').value,
      stop_km: document.getElementById('aaStopKm').value,
      sum_km: document.getElementById('aaSumKm').value,
      oil: document.getElementById('aaOil').value,
      bill_oil: document.getElementById('aaBillOil').value,
      memo1: document.getElementById('aaMemo1').value,
    }),
  });
  closeModal('adminActionModal');
  await loadStats();
  loadAdminList(1);
}

// ==================== MASTER CRUD ====================
function carPhotoUrl(pic) {
  if (!pic) return '';
  const s = String(pic).trim();
  if (s.startsWith('/uploads/') || s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:image/')) {
    return s;
  }
  if (/^\d+$/.test(s)) {
    return `/uploads/cars/${s}.jpg`;
  }
  return '';
}

function previewCarPhoto(url, title) {
  document.getElementById('reqDetailTitle').textContent = title || 'รูปรถยนต์';
  document.getElementById('reqDetailBody').innerHTML = `<div style="text-align:center;"><img src="${esc(url)}" style="max-width:100%;max-height:70vh;border-radius:12px;" /></div>`;
  document.getElementById('reqDetailModal').classList.remove('hidden');
}

function renderVehicles() {
  document.getElementById('vehiclesTbody').innerHTML = state.vehicles
    .map((v) => {
      const picUrl = carPhotoUrl(v.picture);
      const thumbHtml = picUrl
        ? `<img class="car-thumb" src="${esc(picUrl)}" alt="${esc(v.name)}" onclick="previewCarPhoto('${esc(picUrl)}', '${esc(v.name)}')" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div class="car-thumb-empty" style="display:none">🚗</div>`
        : `<div class="car-thumb-empty" title="ยังไม่มีรูปรถ">🚗</div>`;
      return `
      <tr>
        <td>${v.row_id}</td>
        <td>${thumbHtml}</td>
        <td><strong>${esc(v.name)}</strong></td>
        <td>${esc(v.brand || '-')}</td>
        <td>${esc(v.car_no || '-')}</td>
        <td>${esc(v.numper || '-')}</td>
        <td>${esc(v.tel || '-')}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="openMasterModal('vehicle', ${v.row_id})">แก้ไข</button>
          <button class="btn btn-danger btn-sm" onclick="deleteMaster('vehicles', ${v.row_id}, renderVehicles)">ลบ</button>
        </td>
      </tr>`;
    })
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
    const picUrl = carPhotoUrl(item.picture);
    title.textContent = id ? 'แก้ไขข้อมูลรถยนต์' : 'เพิ่มรถยนต์';
    form.innerHTML = `
      <div class="form-group"><label>ทะเบียน / ชื่อรถ *</label><input name="name" required value="${esc(item.name || '')}" /></div>
      <div class="form-group"><label>ยี่ห้อ</label><input name="brand" value="${esc(item.brand || '')}" /></div>
      <div class="form-group"><label>เลขตัวถัง</label><input name="car_no" value="${esc(item.car_no || '')}" /></div>
      <div class="form-group"><label>จำนวนที่นั่ง</label><input name="numper" value="${esc(item.numper || '')}" /></div>
      <div class="form-group"><label>เบอร์โทร</label><input name="tel" value="${esc(item.tel || '')}" /></div>
      <div class="form-group car-pic-box">
        <label>รูปรถยนต์</label>
        <input type="hidden" name="picture" id="carPicData" value="${esc(picUrl)}" />
        <input type="file" id="carPicFile" accept="image/*" onchange="onCarPicSelected(this)" />
        <div id="carPicPreviewWrap" class="${picUrl ? '' : 'hidden'}">
          <img id="carPicPreview" class="car-pic-preview" src="${esc(picUrl)}" alt="รูปรถยนต์" />
          <div style="margin-top:6px;">
            <button type="button" class="btn btn-danger btn-sm" onclick="removeCarPic()">🗑️ ลบรูปรถ</button>
          </div>
        </div>
      </div>
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

async function onCarPicSelected(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const maxW = 1000;
      const scale = img.width > maxW ? maxW / img.width : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      document.getElementById('carPicData').value = dataUrl;
      document.getElementById('carPicPreview').src = dataUrl;
      document.getElementById('carPicPreviewWrap').classList.remove('hidden');
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function removeCarPic() {
  document.getElementById('carPicData').value = '__REMOVE__';
  document.getElementById('carPicFile').value = '';
  document.getElementById('carPicPreview').src = '';
  document.getElementById('carPicPreviewWrap').classList.add('hidden');
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
function toggleLoginPass() {
  const el = document.getElementById('loginPass');
  if (el) el.type = el.type === 'password' ? 'text' : 'password';
}

function openLoginModal() {
  document.getElementById('loginError').classList.add('hidden');
  const closeBtn = document.querySelector('#loginModal .close-btn');
  if (closeBtn) closeBtn.classList.toggle('hidden', !state.user);
  document.getElementById('loginModal').classList.remove('hidden');
  const saved = localStorage.getItem('ksp_remember_user');
  const rem = document.getElementById('loginRemember');
  if (saved && rem) { document.getElementById('loginUser').value = saved; rem.checked = true; }
  document.getElementById('loginUser').focus();
}

function closeModal(id) {
  if (id === 'loginModal' && !state.user) return;
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
    const rem = document.getElementById('loginRemember');
    if (rem && rem.checked) localStorage.setItem('ksp_remember_user', document.getElementById('loginUser').value.trim());
    else localStorage.removeItem('ksp_remember_user');
    await loadAuth();
    closeModal('loginModal');
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
  openLoginModal();
}

init();
