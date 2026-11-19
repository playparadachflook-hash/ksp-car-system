require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const db = require('./src/db');
const { generateCarBookingPdf, generateCarBoardPdf, generateReportSectionPdf } = require('./src/pdf');
const { registerMophProviderRoutes } = require('./src/mophAuth');

const app = express();
const PORT = Number(process.env.PORT || 3531);
const CAR_UPLOAD_DIR = path.join(__dirname, 'data', 'uploads', 'cars');
fs.mkdirSync(CAR_UPLOAD_DIR, { recursive: true });

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'ksp-car-system-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 12 },
  })
);

app.use('/uploads', express.static(path.join(__dirname, 'data', 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

function nowSql() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.isAdmin) {
    return res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบ (จัดรถ) เท่านั้น' });
  }
  next();
}

// ==================== AUTH ====================
app.get('/api/auth/me', async (req, res) => {
  res.json({ user: req.session.user || null });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'กรุณากรอก Username และ Password' });
  }
  const user = (await db.get('SELECT row_id, title, fname, lname, telephone, unit_id, usertype, puchai FROM personaldata WHERE puchai = ? AND rahuspan = ?', [String(username).trim(), String(password).trim()]));

  if (!user) {
    return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }

  const fullName = `${user.fname || ''} ${user.lname || ''}`.trim() || user.puchai;
  req.session.user = {
    row_id: user.row_id,
    username: user.puchai,
    fullName,
    unit_id: user.unit_id || 0,
    telephone: user.telephone || '',
    usertype: user.usertype || 'user',
    isAdmin: user.usertype === 'adminn',
  };
  res.json({ user: req.session.user });
});

app.post('/api/auth/logout', async (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

registerMophProviderRoutes(app, {
  resolveSessionUser: async (profile, opdUser) => {
    const loginname = String(opdUser.loginname || '').trim();
    const firstTh = String(profile.firstname_th || '').trim();
    const lastTh = String(profile.lastname_th || '').trim();
    const titleTh = String(profile.special_title_th || profile.title_th || '').trim();
    const cols = 'row_id, title, fname, lname, telephone, unit_id, usertype, puchai';
    let user = (await db.get(`SELECT ${cols} FROM personaldata WHERE LOWER(puchai) = LOWER(?) LIMIT 1`, [loginname]));
    if (!user && firstTh && lastTh) {
      user = (await db.get(`SELECT ${cols} FROM personaldata WHERE fname LIKE ? AND lname LIKE ? LIMIT 1`, [`%${firstTh}%`, `%${lastTh}%`]));
    }
    if (!user) {
      const f = firstTh || String(opdUser.name || loginname).split(/\s+/)[0] || loginname;
      const l = lastTh || String(opdUser.name || '').split(/\s+/).slice(1).join(' ');
      const info = await db.run("INSERT INTO personaldata (title, fname, lname, telephone, unit_id, usertype, puchai, rahuspan) VALUES (?, ?, ?, '', 0, 'user', ?, '')", [titleTh, f, l, loginname || `moph_${Date.now()}`]);
      user = (await db.get(`SELECT ${cols} FROM personaldata WHERE row_id = ?`, [info.lastInsertRowid]));
    }
    const fullName = `${user.fname || ''} ${user.lname || ''}`.trim() || user.puchai;
    return {
      row_id: user.row_id,
      username: user.puchai,
      fullName,
      unit_id: user.unit_id || 0,
      telephone: user.telephone || '',
      usertype: user.usertype || 'user',
      isAdmin: user.usertype === 'adminn',
    };
  },
});

// ==================== STATS & ECO ====================
app.get('/api/stats', async (req, res) => {
  const total = (await db.get('SELECT COUNT(*) AS cnt FROM bookroom')).cnt;
  const statusRows = (await db.all('SELECT b_status, COUNT(*) AS cnt FROM bookroom GROUP BY b_status'));
  const counts = { 0: 0, 1: 0, 6: 0, 9: 0 };
  for (const r of statusRows) {
    counts[r.b_status] = r.cnt;
  }
  res.json({
    total,
    pending: counts[0] || 0,
    approved: counts[1] || 0,
    rejected: counts[6] || 0,
    cancelled: counts[9] || 0,
    eco: {
      paper: total,
      baht: Number((total * 0.45).toFixed(2)),
      ghg: Number(((total * 0.8049) / 180).toFixed(3)),
    },
  });
});

// ==================== BOOKINGS (bookroom) ====================
function buildBookingWhere(query, user) {
  const { month, year, status, room_id, unit_id, date, q, mine } = query;
  const where = [];
  const params = [];

  if (date) {
    where.push('b.datemeet = ?');
    params.push(date);
  } else {
    if (year) {
      where.push("DATE_FORMAT(b.datemeet, '%Y') = ?");
      params.push(String(year));
    }
    if (month && Number(month) > 0) {
      where.push("DATE_FORMAT(b.datemeet, '%m') = ?");
      params.push(String(month).padStart(2, '0'));
    }
  }
  if (status !== undefined && status !== '') {
    where.push('b.b_status = ?');
    params.push(Number(status));
  }
  if (room_id) {
    where.push('b.room_id = ?');
    params.push(Number(room_id));
  }
  if (unit_id) {
    where.push('b.unit_id = ?');
    params.push(Number(unit_id));
  }
  if (mine === '1' && user) {
    where.push('(b.perbook = ? OR b.user_id = ?)');
    params.push(user.fullName, user.row_id);
  }
  if (q && q.trim()) {
    const like = `%${q.trim()}%`;
    where.push('(b.subject LIKE ? OR b.perhead LIKE ? OR b.numper LIKE ? OR b.perbook LIKE ? OR CAST(b.row_id AS CHAR) LIKE ?)');
    params.push(like, like, like, like, like);
  }
  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  };
}

app.get('/api/bookings', async (req, res) => {
  const { whereSql, params } = buildBookingWhere(req.query, req.session.user);
  const totalRow = (await db.get(`SELECT COUNT(*) AS cnt FROM bookroom b ${whereSql}`, params));

  const pageNum = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(req.query.limit) || 50));
  const offset = (pageNum - 1) * pageSize;

  const rows = (await db.all(`SELECT b.*, r.name AS room_name, u.unit_name AS unit_name
       FROM bookroom b
       LEFT JOIN room r ON r.row_id = b.room_id
       LEFT JOIN unit_all u ON u.row_id = b.unit_id
       ${whereSql}
       ORDER BY COALESCE(NULLIF(b.datemeet, ''), substr(b.datereg, 1, 10)) DESC, b.row_id DESC
       LIMIT ? OFFSET ?`, [...params, pageSize, offset]));

  const equips = (await db.all('SELECT row_id, name FROM equip'));
  const equipMap = Object.fromEntries(equips.map((e) => [String(e.row_id), e.name]));

  const items = rows.map((row) => {
    const equipIds = (row.equip || '').split('|').filter(Boolean);
    return { ...row, equipIds, equipNames: equipIds.map((id) => equipMap[id] || id) };
  });

  res.json({
    items,
    total: totalRow.cnt,
    page: pageNum,
    limit: pageSize,
    totalPages: Math.ceil(totalRow.cnt / pageSize) || 1,
  });
});

app.get('/api/bookings/board/pdf', requireAdmin, async (req, res) => {
  const { whereSql, params } = buildBookingWhere(req.query, req.session.user);
  const rows = (await db.all(`SELECT b.*, r.name AS room_name, u.unit_name AS unit_name
       FROM bookroom b
       LEFT JOIN room r ON r.row_id = b.room_id
       LEFT JOIN unit_all u ON u.row_id = b.unit_id
       ${whereSql}
       ORDER BY b.datemeet DESC, b.row_id DESC
       LIMIT 200`, params));

  const equips = (await db.all('SELECT row_id, name FROM equip'));
  const equipMap = Object.fromEntries(equips.map((e) => [String(e.row_id), e.name]));
  const items = rows.map((row) => {
    const equipIds = (row.equip || '').split('|').filter(Boolean);
    return { ...row, equipIds, equipNames: equipIds.map((id) => equipMap[id] || id) };
  });

  const parts = [];
  if (req.query.year) parts.push(`ปี พ.ศ. ${Number(req.query.year) + 543}`);
  if (req.query.month && Number(req.query.month) > 0) parts.push(`เดือน ${req.query.month}`);
  parts.push(`จำนวน ${items.length} รายการ`);
  generateCarBoardPdf(items, parts.join(' | '), res, req.query.download === '1');
});

app.get('/api/bookings/:id/pdf', requireAdmin, async (req, res) => {
  const row = (await db.get(`SELECT b.*, r.name AS room_name, u.unit_name AS unit_name
       FROM bookroom b
       LEFT JOIN room r ON r.row_id = b.room_id
       LEFT JOIN unit_all u ON u.row_id = b.unit_id
       WHERE b.row_id = ?`, [Number(req.params.id)]));
  if (!row) return res.status(404).json({ error: 'ไม่พบข้อมูลใบขอใช้รถ' });

  const equips = (await db.all('SELECT row_id, name FROM equip'));
  const equipMap = Object.fromEntries(equips.map((e) => [String(e.row_id), e.name]));
  const equipIds = (row.equip || '').split('|').filter(Boolean);
  const booking = { ...row, equipIds, equipNames: equipIds.map((id) => equipMap[id] || id) };
  generateCarBookingPdf(booking, res, req.query.download === '1');
});

app.get('/api/bookings/:id', async (req, res) => {
  const row = (await db.get(`SELECT b.*, r.name AS room_name, u.unit_name AS unit_name
       FROM bookroom b
       LEFT JOIN room r ON r.row_id = b.room_id
       LEFT JOIN unit_all u ON u.row_id = b.unit_id
       WHERE b.row_id = ?`, [Number(req.params.id)]));
  if (!row) return res.status(404).json({ error: 'ไม่พบข้อมูลใบขอใช้รถ' });

  const equips = (await db.all('SELECT row_id, name FROM equip'));
  const equipMap = Object.fromEntries(equips.map((e) => [String(e.row_id), e.name]));
  const equipIds = (row.equip || '').split('|').filter(Boolean);
  res.json({ ...row, equipIds, equipNames: equipIds.map((id) => equipMap[id] || id) });
});

app.post('/api/bookings', requireAuth, async (req, res) => {
  const b = req.body;
  if (!b.subject || !b.numper) {
    return res.status(400).json({ error: 'กรุณากรอกเรื่องที่ขอไปราชการ และชื่อผู้ขอใช้รถ' });
  }
  const now = nowSql();
  const equipStr = Array.isArray(b.equipIds) && b.equipIds.length ? `${b.equipIds.join('|')}|` : '';
  const unitId = b.unit_out ? 0 : Number(b.unit_id || 0);
  const perbook = b.perbook || req.session.user.fullName;

  const info = (await db.run(`INSERT INTO bookroom (
        datereg, subject, perhead, numper, passenger, tel, room_id,
        datemeet, s_time, e_time, t_time, equip, food, memo, memo1,
        perbook, b_status, from_ip, unit_out, unit_id,
        start_km, stop_km, sum_km, oil, bill_oil, user_id, d_update
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [now,
      b.subject.trim(),
      (b.perhead || '').trim(),
      b.numper.trim(),
      String(b.passenger || '').trim(),
      (b.tel || '').trim(),
      Number(b.room_id || 0),
      b.datemeet || now.slice(0, 10),
      b.s_time || '08:30',
      b.e_time || '16:30',
      b.t_time || '',
      req.session.user.isAdmin ? equipStr : '',
      '',
      (b.memo || '').trim(),
      req.session.user.isAdmin ? (b.memo1 || '').trim() : '',
      perbook,
      req.session.user.isAdmin && b.b_status !== undefined ? Number(b.b_status) : 0,
      req.ip || '',
      (b.unit_out || '').trim(),
      unitId,
      req.session.user.isAdmin ? String(b.start_km || '') : '',
      req.session.user.isAdmin ? String(b.stop_km || '') : '',
      req.session.user.isAdmin ? String(b.sum_km || '') : '',
      req.session.user.isAdmin ? String(b.oil || '') : '',
      req.session.user.isAdmin ? String(b.bill_oil || '') : '',
      req.session.user.row_id,
      now]));

  res.status(201).json({ row_id: info.lastInsertRowid });
});

app.put('/api/bookings/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const existing = (await db.get('SELECT * FROM bookroom WHERE row_id = ?', [id]));
  if (!existing) return res.status(404).json({ error: 'ไม่พบข้อมูลใบขอใช้รถ' });

  const isOwner = existing.perbook === req.session.user.fullName || existing.user_id === req.session.user.row_id;
  if (!req.session.user.isAdmin && !isOwner) {
    return res.status(403).json({ error: 'ไม่มีสิทธิ์แก้ไขใบขอใช้รถนี้' });
  }

  const b = req.body;
  const now = nowSql();
  const unitId = b.unit_out ? 0 : Number(b.unit_id ?? existing.unit_id);
  const equipStr = Array.isArray(b.equipIds)
    ? b.equipIds.length
      ? `${b.equipIds.join('|')}|`
      : ''
    : existing.equip;

  (await db.run(`UPDATE bookroom SET
      subject = ?, perhead = ?, numper = ?, passenger = ?, tel = ?,
      room_id = ?, datemeet = ?, s_time = ?, e_time = ?, t_time = ?,
      equip = ?, memo = ?, memo1 = ?, b_status = ?,
      unit_out = ?, unit_id = ?, start_km = ?, stop_km = ?, sum_km = ?, oil = ?, bill_oil = ?, d_update = ?
    WHERE row_id = ?`, [b.subject ?? existing.subject,
    b.perhead ?? existing.perhead,
    b.numper ?? existing.numper,
    b.passenger !== undefined ? String(b.passenger) : existing.passenger,
    b.tel ?? existing.tel,
    Number(b.room_id ?? existing.room_id),
    b.datemeet ?? existing.datemeet,
    b.s_time ?? existing.s_time,
    b.e_time ?? existing.e_time,
    req.session.user.isAdmin ? (b.t_time ?? existing.t_time) : existing.t_time,
    req.session.user.isAdmin ? equipStr : existing.equip,
    b.memo ?? existing.memo,
    req.session.user.isAdmin ? (b.memo1 ?? existing.memo1) : existing.memo1,
    req.session.user.isAdmin ? Number(b.b_status ?? existing.b_status) : existing.b_status,
    b.unit_out !== undefined ? b.unit_out : existing.unit_out,
    unitId,
    req.session.user.isAdmin ? String(b.start_km ?? existing.start_km ?? '') : existing.start_km,
    req.session.user.isAdmin ? String(b.stop_km ?? existing.stop_km ?? '') : existing.stop_km,
    req.session.user.isAdmin ? String(b.sum_km ?? existing.sum_km ?? '') : existing.sum_km,
    req.session.user.isAdmin ? String(b.oil ?? existing.oil ?? '') : existing.oil,
    req.session.user.isAdmin ? String(b.bill_oil ?? existing.bill_oil ?? '') : existing.bill_oil,
    now,
    id]));

  res.json({ ok: true });
});

app.patch('/api/bookings/:id/approve', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const existing = (await db.get('SELECT * FROM bookroom WHERE row_id = ?', [id]));
  if (!existing) return res.status(404).json({ error: 'ไม่พบข้อมูลใบขอใช้รถ' });

  const { b_status, room_id, equipIds, assigned_to, t_time, start_km, stop_km, sum_km, oil, bill_oil, memo1 } = req.body;
  const equipStr = Array.isArray(equipIds) ? (equipIds.length ? `${equipIds.join('|')}|` : '') : existing.equip;

  (await db.run(`UPDATE bookroom SET
      b_status = ?, room_id = ?, equip = ?, assigned_to = ?,
      t_time = ?, start_km = ?, stop_km = ?, sum_km = ?, oil = ?, bill_oil = ?,
      memo1 = ?, d_update = ?
    WHERE row_id = ?`, [Number(b_status ?? existing.b_status),
    room_id !== undefined ? Number(room_id) : existing.room_id,
    equipStr,
    (assigned_to ?? existing.assigned_to ?? '').trim(),
    t_time !== undefined ? String(t_time) : (existing.t_time || ''),
    start_km !== undefined ? String(start_km) : (existing.start_km || ''),
    stop_km !== undefined ? String(stop_km) : (existing.stop_km || ''),
    sum_km !== undefined ? String(sum_km) : (existing.sum_km || ''),
    oil !== undefined ? String(oil) : (existing.oil || ''),
    bill_oil !== undefined ? String(bill_oil) : (existing.bill_oil || ''),
    memo1 !== undefined ? memo1 : existing.memo1,
    nowSql(),
    id]));
  res.json({ ok: true });
});

app.delete('/api/bookings/:id', requireAdmin, async (req, res) => {
  (await db.run('DELETE FROM bookroom WHERE row_id = ?', [Number(req.params.id)]));
  res.json({ ok: true });
});

// ==================== REPORTS ====================
function buildReportFilter(query, col = 'b.datemeet') {
  const { date, year, month, fiscalYear } = query;
  const where = [];
  const params = [];
  const desc = [];

  if (date) {
    where.push(`${col} = ?`);
    params.push(date);
    desc.push(`วันที่ ${date}`);
  } else if (fiscalYear) {
    const fy = Number(fiscalYear); // e.g. 2569 -> CE 2026 -> 2025-10-01 to 2026-09-30
    const ce = fy > 2400 ? fy - 543 : fy;
    const start = `${ce - 1}-10-01`;
    const end = `${ce}-09-30`;
    where.push(`${col} >= ? AND ${col} <= ?`);
    params.push(start, end);
    desc.push(`ปีงบประมาณ ${ce + 543} (${start} ถึง ${end})`);
  } else {
    if (year) {
      where.push(`DATE_FORMAT(${col}, '%Y') = ?`);
      params.push(String(year));
      desc.push(`ปี พ.ศ. ${Number(year) + 543}`);
    }
    if (month && Number(month) > 0) {
      where.push(`DATE_FORMAT(${col}, '%m') = ?`);
      params.push(String(month).padStart(2, '0'));
      desc.push(`เดือน ${month}`);
    }
  }
  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
    filterDesc: desc.join(' | ') || 'ข้อมูลทั้งหมด',
  };
}

async function getCarReportData(query) {
  const { whereSql, params, filterDesc } = buildReportFilter(query);

  const byDepartment = (await db.all(`SELECT COALESCE(NULLIF(u.unit_name, ''), NULLIF(b.unit_out, ''), 'ไม่ระบุหน่วยงาน') AS name,
              COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN TRIM(b.sum_km) REGEXP '^[0-9]+(\\.[0-9]+)?$' THEN CAST(TRIM(b.sum_km) AS DECIMAL(12,2)) ELSE 0 END), 0) AS total_km,
              COALESCE(SUM(CASE WHEN TRIM(b.oil) REGEXP '^[0-9]+(\\.[0-9]+)?$' THEN CAST(TRIM(b.oil) AS DECIMAL(12,2)) ELSE 0 END), 0) AS total_oil
       FROM bookroom b
       LEFT JOIN unit_all u ON u.row_id = b.unit_id
       ${whereSql}
       GROUP BY name
       ORDER BY total DESC`, params));

  const byVehicle = (await db.all(`SELECT COALESCE(r.name, 'ยังไม่จัดรถ') AS name,
              COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN TRIM(b.sum_km) REGEXP '^[0-9]+(\\.[0-9]+)?$' THEN CAST(TRIM(b.sum_km) AS DECIMAL(12,2)) ELSE 0 END), 0) AS total_km,
              COALESCE(SUM(CASE WHEN TRIM(b.oil) REGEXP '^[0-9]+(\\.[0-9]+)?$' THEN CAST(TRIM(b.oil) AS DECIMAL(12,2)) ELSE 0 END), 0) AS total_oil
       FROM bookroom b
       LEFT JOIN room r ON r.row_id = b.room_id
       ${whereSql}
       GROUP BY b.room_id, r.name
       ORDER BY total DESC`, params));

  const byStatus = (await db.all(`SELECT b.b_status, COUNT(*) AS total FROM bookroom b ${whereSql} GROUP BY b.b_status`, params));

  const equips = (await db.all('SELECT row_id, name FROM equip ORDER BY row_id'));
  const rows = (await db.all(`SELECT row_id, datemeet, subject, perhead, numper, perbook, equip, unit_out FROM bookroom b ${whereSql} ORDER BY b.datemeet DESC, b.row_id DESC`, params));

  const mShort = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const fmtShort = (iso) => {
    if (!iso || String(iso).startsWith('0000')) return '-';
    const p = String(iso).slice(0, 10).split('-');
    if (p.length !== 3) return String(iso);
    return `${Number(p[2])} ${mShort[Number(p[1]) - 1] || p[1]} ${Number(p[0]) + 543}`;
  };

  const byDriver = equips.map((e) => {
    const matched = rows.filter((t) => (t.equip || '').split('|').includes(String(e.row_id)));
    const tripsList = matched.map((t, idx) => {
      const dateStr = fmtShort(t.datemeet);
      const place = (t.perhead || t.subject || '-').trim();
      const requester = (t.numper || t.perbook || '-').trim();
      return {
        row_id: t.row_id,
        datemeet: t.datemeet,
        dateStr,
        place,
        requester,
        line: `${idx + 1}. ${dateStr} | ${place} (ผู้ขอใช้รถ: ${requester})`,
      };
    });
    return {
      row_id: e.row_id,
      name: e.name,
      total: matched.length,
      tripsSummary: tripsList.map((t) => t.line).join('\n') || '-',
      trips: tripsList,
    };
  });

  return {
    filterDesc,
    byDepartment,
    byVehicle,
    byStatus,
    byDriver,
    internalCount: rows.filter((t) => !t.unit_out).length,
    externalCount: rows.filter((t) => !!t.unit_out).length,
  };
}

app.get('/api/reports/summary', async (req, res) => {
  res.json(await getCarReportData(req.query));
});

app.get('/api/reports/pdf', requireAdmin, async (req, res) => {
  const { section = 'driver', download } = req.query;
  const data = await getCarReportData(req.query);
  const isDl = download === '1';

  if (section === 'driver') {
    const cols = [
      { label: 'ลำดับ', w: 34, align: 'center' },
      { label: 'ชื่อพนักงานขับรถ (พขร.)', w: 125 },
      { label: 'จำนวนเที่ยว', w: 52, align: 'center' },
      { label: 'รายละเอียดการเดินทาง (วันเดือนปี / สถานที่ / ชื่อผู้ขอใช้รถ)', w: 312 },
    ];
    const rows = data.byDriver.map((d, i) => [i + 1, d.name, d.total, d.tripsSummary || '-']);
    return generateReportSectionPdf('รายงานสรุปตามพนักงานขับรถ (พขร.)', data.filterDesc, cols, rows, res, isDl);
  }
  if (section === 'vehicle') {
    const cols = [
      { label: 'ลำดับ', w: 42, align: 'center' },
      { label: 'รถที่ให้บริการ', w: 230 },
      { label: 'จำนวนเที่ยว', w: 80, align: 'center' },
      { label: 'ระยะทาง (ก.ม.)', w: 85, align: 'right' },
      { label: 'ค่าน้ำมัน (บาท)', w: 86, align: 'right' },
    ];
    const rows = data.byVehicle.map((v, i) => [i + 1, v.name, v.total, Number(v.total_km).toLocaleString(), Number(v.total_oil).toLocaleString()]);
    return generateReportSectionPdf('รายงานสรุปตามรถที่ให้บริการ', data.filterDesc, cols, rows, res, isDl);
  }
  if (section === 'department') {
    const cols = [
      { label: 'ลำดับ', w: 42, align: 'center' },
      { label: 'หน่วยงาน', w: 230 },
      { label: 'จำนวนเที่ยว', w: 80, align: 'center' },
      { label: 'ระยะทาง (ก.ม.)', w: 85, align: 'right' },
      { label: 'ค่าน้ำมัน (บาท)', w: 86, align: 'right' },
    ];
    const rows = data.byDepartment.map((d, i) => [i + 1, d.name, d.total, Number(d.total_km).toLocaleString(), Number(d.total_oil).toLocaleString()]);
    return generateReportSectionPdf('รายงานสรุปการใช้รถตามหน่วยงาน', data.filterDesc, cols, rows, res, isDl);
  }
  const STATUS_NAMES = { 0: 'รออนุมัติ', 1: 'อนุมัติแล้ว', 6: 'ไม่อนุมัติ', 9: 'ยกเลิกการจอง' };
  const cols = [
    { label: 'รายการ', w: 350 },
    { label: 'จำนวน (ครั้ง)', w: 173, align: 'center' },
  ];
  const rows = [
    ...data.byStatus.map((s) => [STATUS_NAMES[s.b_status] || s.b_status, s.total]),
    ['ภายในจังหวัด', data.internalCount],
    ['ไปต่างจังหวัด', data.externalCount],
  ];
  return generateReportSectionPdf('รายงานสรุปตามสถานะและพื้นที่', data.filterDesc, cols, rows, res, isDl);
});

// ==================== VEHICLES (room) ====================
function removeOldCarFile(picPath) {
  if (!picPath || !String(picPath).startsWith('/uploads/cars/')) return;
  const full = path.join(__dirname, 'data', picPath.replace(/^\/+/, ''));
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch {}
}

function saveCarPicture(picture, existing = '') {
  if (picture === '__REMOVE__') {
    removeOldCarFile(existing);
    return '';
  }
  if (!picture) return existing || '';
  const m = String(picture).match(/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/i);
  if (m) {
    const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
    const fname = `car_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    fs.writeFileSync(path.join(CAR_UPLOAD_DIR, fname), Buffer.from(m[2], 'base64'));
    removeOldCarFile(existing);
    return `/uploads/cars/${fname}`;
  }
  return String(picture);
}

app.get('/api/vehicles', async (req, res) => {
  res.json((await db.all('SELECT * FROM room ORDER BY row_id ASC')));
});

app.post('/api/vehicles', requireAdmin, async (req, res) => {
  const { name, brand, car_no, numper, tel, picture } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'กรุณาระบุชื่อ/ทะเบียนรถ' });
  const picPath = saveCarPicture(picture, '');
  const info = (await db.run('INSERT INTO room (name, brand, car_no, numper, tel, picture, d_update) VALUES (?, ?, ?, ?, ?, ?, ?)', [name.trim(), brand || '', car_no || '', numper || '0', tel || '', picPath, nowSql()]));
  res.status(201).json({ row_id: info.lastInsertRowid, picture: picPath });
});

app.put('/api/vehicles/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { name, brand, car_no, numper, tel, picture } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'กรุณาระบุชื่อ/ทะเบียนรถ' });
  const cur = (await db.get('SELECT picture FROM room WHERE row_id = ?', [id]));
  const picPath = saveCarPicture(picture, cur ? cur.picture : '');
  (await db.run('UPDATE room SET name = ?, brand = ?, car_no = ?, numper = ?, tel = ?, picture = ?, d_update = ? WHERE row_id = ?', [name.trim(), brand || '', car_no || '', numper || '0', tel || '', picPath, nowSql(), id]));
  res.json({ ok: true, picture: picPath });
});

app.delete('/api/vehicles/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const cur = (await db.get('SELECT picture FROM room WHERE row_id = ?', [id]));
  if (cur) removeOldCarFile(cur.picture);
  (await db.run('DELETE FROM room WHERE row_id = ?', [id]));
  res.json({ ok: true });
});

// ==================== DRIVERS (equip) ====================
app.get('/api/drivers', async (req, res) => {
  res.json((await db.all('SELECT * FROM equip ORDER BY row_id ASC')));
});

app.post('/api/drivers', requireAdmin, async (req, res) => {
  const { name, tel } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'กรุณาระบุชื่อพนักงานขับรถ' });
  const info = (await db.run('INSERT INTO equip (name, tel, d_update) VALUES (?, ?, ?)', [name.trim(), tel || '', nowSql()]));
  res.status(201).json({ row_id: info.lastInsertRowid });
});

app.put('/api/drivers/:id', requireAdmin, async (req, res) => {
  const { name, tel } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'กรุณาระบุชื่อพนักงานขับรถ' });
  (await db.run('UPDATE equip SET name = ?, tel = ?, d_update = ? WHERE row_id = ?', [name.trim(), tel || '', nowSql(), Number(req.params.id)]));
  res.json({ ok: true });
});

app.delete('/api/drivers/:id', requireAdmin, async (req, res) => {
  (await db.run('DELETE FROM equip WHERE row_id = ?', [Number(req.params.id)]));
  res.json({ ok: true });
});

// ==================== UNITS (unit_all) ====================
app.get('/api/units', async (req, res) => {
  res.json((await db.all('SELECT * FROM unit_all ORDER BY unit_name ASC')));
});

app.post('/api/units', requireAdmin, async (req, res) => {
  const { unit_code, unit_name, unit_head, tel } = req.body;
  if (!unit_name || !unit_name.trim()) return res.status(400).json({ error: 'กรุณาระบุชื่อหน่วยงาน' });
  const info = (await db.run('INSERT INTO unit_all (unit_code, unit_name, unit_head, tel, d_update) VALUES (?, ?, ?, ?, ?)', [unit_code || '', unit_name.trim(), unit_head || '', tel || '', nowSql()]));
  res.status(201).json({ row_id: info.lastInsertRowid });
});

app.put('/api/units/:id', requireAdmin, async (req, res) => {
  const { unit_code, unit_name, unit_head, tel } = req.body;
  if (!unit_name || !unit_name.trim()) return res.status(400).json({ error: 'กรุณาระบุชื่อหน่วยงาน' });
  (await db.run('UPDATE unit_all SET unit_code = ?, unit_name = ?, unit_head = ?, tel = ?, d_update = ? WHERE row_id = ?', [unit_code || '', unit_name.trim(), unit_head || '', tel || '', nowSql(), Number(req.params.id)]));
  res.json({ ok: true });
});

app.delete('/api/units/:id', requireAdmin, async (req, res) => {
  (await db.run('DELETE FROM unit_all WHERE row_id = ?', [Number(req.params.id)]));
  res.json({ ok: true });
});

// ==================== USERS (personaldata) ====================
app.get('/api/users', requireAdmin, async (req, res) => {
  const rows = (await db.all(`SELECT p.row_id, p.title, p.fname, p.lname, p.telephone, p.unit_id, p.usertype, p.puchai, u.unit_name
       FROM personaldata p
       LEFT JOIN unit_all u ON u.row_id = p.unit_id
       ORDER BY p.row_id DESC`));
  res.json(rows);
});

app.post('/api/users', requireAdmin, async (req, res) => {
  const { title, fname, lname, telephone, unit_id, usertype, puchai, rahuspan } = req.body;
  if (!fname || !puchai || !rahuspan) {
    return res.status(400).json({ error: 'กรุณากรอก ชื่อ, Username และ Password' });
  }
  try {
    const info = (await db.run(`INSERT INTO personaldata (title, fname, lname, telephone, unit_id, usertype, puchai, rahuspan, d_update)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [title || '', fname.trim(), lname || '', telephone || '', Number(unit_id || 0), usertype === 'adminn' ? 'adminn' : 'user', puchai.trim(), rahuspan.trim(), nowSql()]));
    res.status(201).json({ row_id: info.lastInsertRowid });
  } catch {
    res.status(400).json({ error: 'Username นี้มีอยู่ในระบบแล้ว' });
  }
});

app.put('/api/users/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const existing = (await db.get('SELECT * FROM personaldata WHERE row_id = ?', [id]));
  if (!existing) return res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });

  const { title, fname, lname, telephone, unit_id, usertype, puchai, rahuspan } = req.body;
  (await db.run(`UPDATE personaldata SET title = ?, fname = ?, lname = ?, telephone = ?, unit_id = ?, usertype = ?, puchai = ?, rahuspan = ?, d_update = ? WHERE row_id = ?`, [title ?? existing.title,
    fname ?? existing.fname,
    lname ?? existing.lname,
    telephone ?? existing.telephone,
    Number(unit_id ?? existing.unit_id),
    usertype === 'adminn' ? 'adminn' : 'user',
    puchai ?? existing.puchai,
    rahuspan ? rahuspan : existing.rahuspan,
    nowSql(),
    id]));
  res.json({ ok: true });
});

app.delete('/api/users/:id', requireAdmin, async (req, res) => {
  (await db.run('DELETE FROM personaldata WHERE row_id = ?', [Number(req.params.id)]));
  res.json({ ok: true });
});

app.get('*', async (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`KSP Car System running at http://0.0.0.0:${PORT}`);
});
