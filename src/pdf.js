const path = require('path');
const PDFDocument = require('pdfkit');

const FONT_REG = path.join(__dirname, '..', 'fonts', 'Sarabun-Regular.ttf');
const FONT_BOLD = path.join(__dirname, '..', 'fonts', 'Sarabun-Bold.ttf');

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const THAI_SHORT_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

const STATUS_INFO = {
  0: { label: 'รออนุมัติ', color: '#b45309', bg: '#fef3c7' },
  1: { label: 'อนุมัติแล้ว', color: '#15803d', bg: '#dcfce7' },
  6: { label: 'ไม่อนุมัติ', color: '#b91c1c', bg: '#fee2e2' },
  9: { label: 'ยกเลิกการจอง', color: '#7e22ce', bg: '#f3e8ff' },
};

function fmtThaiDateFull(iso) {
  if (!iso || String(iso).startsWith('0000')) return '-';
  const p = String(iso).slice(0, 10).split('-');
  if (p.length !== 3) return String(iso);
  const y = Number(p[0]) + 543;
  const m = THAI_MONTHS[Number(p[1]) - 1] || p[1];
  return `${Number(p[2])} ${m} ${y}`;
}

function fmtThaiDateShort(iso) {
  if (!iso || String(iso).startsWith('0000')) return '-';
  const p = String(iso).slice(0, 10).split('-');
  if (p.length !== 3) return String(iso);
  const y = Number(p[0]) + 543;
  const m = THAI_SHORT_MONTHS[Number(p[1]) - 1] || p[1];
  return `${Number(p[2])} ${m} ${String(y).slice(-2)}`;
}

function generateCarBookingPdf(booking, res, download = false) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 38, bottom: 38, left: 45, right: 45 },
    info: {
      Title: `ใบขออนุญาตใช้รถยนต์ราชการ #${booking.row_id}`,
      Author: 'โรงพยาบาลโคกศรีสุพรรณ',
    },
  });

  const filename = `car-booking-${booking.row_id}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${filename}"`);
  doc.pipe(res);

  doc.registerFont('Sarabun', FONT_REG);
  doc.registerFont('Sarabun-Bold', FONT_BOLD);

  const pageW = doc.page.width;
  const left = 45;
  const contentW = pageW - left * 2; // 505.28
  const st = STATUS_INFO[booking.b_status] || { label: `สถานะ ${booking.b_status}`, color: '#334155', bg: '#e2e8f0' };

  // ===== OFFICIAL HEADER (บันทึกข้อความ / ใบขออนุญาตใช้รถยนต์ราชการ) =====
  doc.fillColor('#0f172a').font('Sarabun-Bold').fontSize(17)
    .text('ใบขออนุญาตใช้รถยนต์ราชการ', left, 38, { width: contentW, align: 'center' });
  doc.font('Sarabun').fontSize(11).fillColor('#334155')
    .text('โรงพยาบาลโคกศรีสุพรรณ อำเภอโคกศรีสุพรรณ จังหวัดสกลนคร', left, 61, { width: contentW, align: 'center' });

  // Top-right badge & doc ref
  doc.roundedRect(left + contentW - 135, 36, 135, 42, 5).fillAndStroke('#f8fafc', '#cbd5e1');
  doc.fillColor('#64748b').font('Sarabun').fontSize(8.5)
    .text(`เลขที่คำขอ #${booking.row_id}`, left + contentW - 135, 41, { width: 135, align: 'center' });
  doc.roundedRect(left + contentW - 118, 56, 100, 15, 7).fill(st.bg);
  doc.fillColor(st.color).font('Sarabun-Bold').fontSize(8.5)
    .text(st.label, left + contentW - 118, 57, { width: 100, align: 'center' });

  doc.moveTo(left, 88).lineTo(left + contentW, 88).lineWidth(1.2).stroke('#0f172a');

  // ===== MEMO META =====
  let y = 98;
  const unitText = booking.unit_name || booking.unit_out || '-';
  const dateReqText = booking.datereg ? fmtThaiDateFull(booking.datereg) : fmtThaiDateFull(booking.datemeet);

  doc.fillColor('#0f172a').font('Sarabun-Bold').fontSize(10.5).text('ส่วนราชการ', left, y, { continued: true })
    .font('Sarabun').text(`  ${unitText} โรงพยาบาลโคกศรีสุพรรณ`);
  y += 18;
  doc.font('Sarabun-Bold').text('วันที่', left, y, { continued: true })
    .font('Sarabun').text(`  ${dateReqText}`);
  y += 18;
  doc.font('Sarabun-Bold').text('เรื่อง', left, y, { continued: true })
    .font('Sarabun').text(`  ขออนุญาตใช้รถยนต์ราชการ (${booking.subject || '-'})`);
  y += 18;
  doc.font('Sarabun-Bold').text('เรียน', left, y, { continued: true })
    .font('Sarabun').text('  ผู้อำนวยการโรงพยาบาลโคกศรีสุพรรณ');
  y += 24;

  // ===== BODY PARAGRAPH =====
  const tripDate = fmtThaiDateFull(booking.datemeet);
  const timeTxt = `${booking.s_time || '-'} น. ถึง ${booking.e_time || '-'} น.`;
  const paxTxt = booking.passenger ? `${booking.passenger} คน` : '-';
  const telTxt = booking.tel ? ` (โทร. ${booking.tel})` : '';

  doc.font('Sarabun').fontSize(10.5).fillColor('#0f172a')
    .text(
      `        ข้าพเจ้า ${booking.numper || '-'}${telTxt} สังกัด ${unitText} มีความประสงค์ขออนุญาตใช้รถยนต์ราชการ ` +
      `เพื่อไปราชการเรื่อง "${booking.subject || '-'}" ณ ${booking.perhead || '-'} ` +
      `มีผู้ร่วมเดินทางจำนวน ${paxTxt} ในวันที่ ${tripDate} ตั้งแต่เวลา ${timeTxt}`,
      left,
      y,
      { width: contentW, align: 'justify', lineGap: 4 }
    );
  y = doc.y + 10;

  if (booking.memo) {
    doc.font('Sarabun-Bold').fontSize(10).text('หมายเหตุ: ', left, y, { continued: true })
      .font('Sarabun').text(booking.memo);
    y = doc.y + 8;
  }

  // Requester signature on right
  y += 8;
  doc.font('Sarabun').fontSize(10)
    .text('ลงชื่อ .................................................... ผู้ขออนุญาต', left + 210, y, { width: 280, align: 'center' })
    .text(`( ${booking.numper || '............................................'} )`, left + 210, y + 17, { width: 280, align: 'center' });
  y += 42;

  // ===== SECTION 2: VEHICLE & DRIVER ASSIGNMENT TABLE =====
  doc.roundedRect(left, y, contentW, 22, 4).fill('#e0f2fe');
  doc.fillColor('#0369a1').font('Sarabun-Bold').fontSize(11)
    .text('ส่วนที่ 2 : การจัดสรรรถยนต์ พนักงานขับรถ และบันทึกการเดินทาง (สำหรับงานยานพาหนะ)', left + 10, y + 4);
  y += 24;

  const labelW = 155;
  const valW = contentW - labelW;
  const driverNames = (booking.equipNames && booking.equipNames.length) ? booking.equipNames.join(', ') : '-';
  const assignee = [driverNames !== '-' ? driverNames : '', booking.assigned_to || ''].filter(Boolean).join(' / ') || '-';
  const kmText = `ไมล์ไป: ${booking.start_km || '-'}  |  ไมล์กลับ: ${booking.stop_km || '-'}  |  รวมระยะทาง: ${booking.sum_km || '-'} ก.ม.`;
  const oilText = `${booking.oil ? `${Number(booking.oil).toLocaleString()} บาท` : '0 บาท'}${booking.bill_oil ? `  (ใบเสร็จ: ${booking.bill_oil})` : ''}`;

  const rows2 = [
    ['รถยนต์ที่จัดให้บริการ', booking.room_name || '-', true],
    ['พนักงานขับรถ (พขร.) / ผู้ดำเนินการ', assignee],
    ['เลขไมล์ / ระยะทางที่ใช้จริง', kmText],
    ['บิลค่าน้ำมัน / เลขที่ใบเสร็จ', oilText],
    ['เวลากลับจริง / บันทึกเพิ่มเติม', `${booking.t_time ? `เวลากลับ ${booking.t_time} น.  ` : ''}${booking.memo1 || '-'}`],
    ['ผู้บันทึก / ผู้จัดรถ', booking.perbook || '-'],
  ];

  for (let i = 0; i < rows2.length; i++) {
    const [lbl, val, boldVal] = rows2[i];
    doc.font(boldVal ? 'Sarabun-Bold' : 'Sarabun').fontSize(10);
    const textH = doc.heightOfString(String(val), { width: valW - 16 });
    const rowH = Math.max(23, textH + 10);

    doc.rect(left, y, labelW, rowH).fillAndStroke('#f8fafc', '#cbd5e1');
    doc.rect(left + labelW, y, valW, rowH).fillAndStroke('#ffffff', '#cbd5e1');

    doc.fillColor('#334155').font('Sarabun-Bold').fontSize(9.5)
      .text(lbl, left + 10, y + 6, { width: labelW - 16 });
    doc.fillColor('#0f172a').font(boldVal ? 'Sarabun-Bold' : 'Sarabun').fontSize(10)
      .text(String(val), left + labelW + 10, y + 6, { width: valW - 16 });

    y += rowH;
  }

  // ===== SECTION 3: APPROVAL & DIRECTOR SIGNATURE =====
  const sigY = Math.max(y + 22, 620);
  const halfW = (contentW - 16) / 2;

  // Left Box: Fleet Head / Driver
  doc.roundedRect(left, sigY, halfW, 130, 6).stroke('#cbd5e1');
  doc.fillColor('#334155').font('Sarabun-Bold').fontSize(10)
    .text('ความเห็นหัวหน้างานยานพาหนะ / พขร.', left + 10, sigY + 10, { width: halfW - 20, align: 'center' });
  doc.font('Sarabun').fontSize(9.5)
    .text('เห็นควรอนุญาตให้ใช้รถยนต์ราชการตามรายการข้างต้น', left + 10, sigY + 30, { width: halfW - 20, align: 'center' })
    .text('ลงชื่อ ...............................................', left + 10, sigY + 62, { width: halfW - 20, align: 'center' })
    .text(`( ${driverNames !== '-' ? driverNames.split(',')[0].trim() : '...........................................'} )`, left + 10, sigY + 79, { width: halfW - 20, align: 'center' })
    .text('วันที่ ........../........../..........', left + 10, sigY + 100, { width: halfW - 20, align: 'center' });

  // Right Box: Director Approval
  const rx = left + halfW + 16;
  doc.roundedRect(rx, sigY, halfW, 130, 6).stroke('#cbd5e1');
  const chkApprove = booking.b_status === 1 ? '[ / ] อนุญาต' : '[   ] อนุญาต';
  const chkReject = booking.b_status === 6 ? '[ / ] ไม่อนุมัติ' : '[   ] ไม่อนุมัติ';
  doc.fillColor('#0f172a').font('Sarabun-Bold').fontSize(10)
    .text(`คำสั่งผู้อำนวยการ   ${chkApprove}   ${chkReject}`, rx + 10, sigY + 10, { width: halfW - 20, align: 'center' });
  doc.font('Sarabun').fontSize(9.5)
    .text('ลงชื่อ ...............................................', rx + 10, sigY + 36, { width: halfW - 20, align: 'center' })
    .text('( นางณัฐปภัสร์ นวัตชัยศิริกุล )', rx + 10, sigY + 53, { width: halfW - 20, align: 'center' })
    .text('นายแพทย์ชำนาญการพิเศษ', rx + 10, sigY + 68, { width: halfW - 20, align: 'center' })
    .text('รักษาการในตำแหน่ง', rx + 10, sigY + 82, { width: halfW - 20, align: 'center' })
    .font('Sarabun-Bold').text('ผู้อำนวยการ รพ.โคกศรีสุพรรณ', rx + 10, sigY + 96, { width: halfW - 20, align: 'center' });
  doc.font('Sarabun').fontSize(8.5).fillColor('#64748b')
    .text('วันที่ ........../........../..........', rx + 10, sigY + 113, { width: halfW - 20, align: 'center' });

  const nowStr = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  doc.fillColor('#94a3b8').font('Sarabun').fontSize(8.5)
    .text(`พิมพ์จากระบบขอใช้รถยนต์ออนไลน์ โรงพยาบาลโคกศรีสุพรรณ | พิมพ์เมื่อ ${nowStr}`, left, 788, {
      width: contentW,
      align: 'center',
    });

  doc.end();
}

function generateCarBoardPdf(items, filterDesc, res, download = false) {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margins: { top: 32, bottom: 32, left: 30, right: 30 },
    info: {
      Title: 'ตารางการจัดสรรรถยนต์ โรงพยาบาลโคกศรีสุพรรณ',
      Author: 'โรงพยาบาลโคกศรีสุพรรณ',
    },
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="car-board.pdf"`);
  doc.pipe(res);

  doc.registerFont('Sarabun', FONT_REG);
  doc.registerFont('Sarabun-Bold', FONT_BOLD);

  const left = 30;
  const contentW = doc.page.width - left * 2;

  const drawHeader = () => {
    doc.fillColor('#0369a1').font('Sarabun-Bold').fontSize(14)
      .text('ตารางการใช้รถยนต์ราชการ (กระดานจัดรถ) โรงพยาบาลโคกศรีสุพรรณ', left, 26, { width: contentW, align: 'center' });
    doc.fillColor('#475569').font('Sarabun').fontSize(9.5)
      .text(filterDesc || 'รายการทั้งหมด', left, 46, { width: contentW, align: 'center' });

    const cols = [
      { label: 'เลขที่', w: 52 },
      { label: 'วันที่ / เวลา', w: 72 },
      { label: 'รถที่ให้บริการ', w: 100 },
      { label: 'เรื่องที่ไปราชการ / สถานที่', w: 205 },
      { label: 'หน่วยงาน', w: 100 },
      { label: 'ผู้ขอใช้รถ', w: 92 },
      { label: 'พขร.', w: 92 },
      { label: 'สถานะ', w: 68 },
    ];
    let cx = left;
    const hy = 66;
    cols.forEach((c) => {
      doc.rect(cx, hy, c.w, 22).fillAndStroke('#e0f2fe', '#94a3b8');
      doc.fillColor('#0f172a').font('Sarabun-Bold').fontSize(9)
        .text(c.label, cx + 4, hy + 5, { width: c.w - 8, align: 'center' });
      cx += c.w;
    });
    return { cols, startY: hy + 22 };
  };

  let { cols, startY: y } = drawHeader();

  for (let i = 0; i < items.length; i++) {
    const r = items[i];
    const st = STATUS_INFO[r.b_status] || { label: String(r.b_status), color: '#334155' };
    const vals = [
      `#${r.row_id}`,
      `${fmtThaiDateShort(r.datemeet)}\n${r.s_time || ''}-${r.e_time || ''}`,
      r.room_name || '-',
      `${r.subject || '-'}${r.perhead ? `\n(${r.perhead})` : ''}`,
      r.unit_name || r.unit_out || '-',
      r.numper || '-',
      (r.equipNames && r.equipNames.length) ? r.equipNames.join(', ') : '-',
      st.label,
    ];

    doc.font('Sarabun').fontSize(8.5);
    let maxH = 20;
    vals.forEach((v, idx) => {
      const h = doc.heightOfString(String(v), { width: cols[idx].w - 8 }) + 8;
      if (h > maxH) maxH = h;
    });

    if (y + maxH > doc.page.height - 36) {
      doc.addPage({ size: 'A4', layout: 'landscape', margins: { top: 32, bottom: 32, left: 30, right: 30 } });
      ({ cols, startY: y } = drawHeader());
    }

    let cx = left;
    const rowBg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
    vals.forEach((v, idx) => {
      doc.rect(cx, y, cols[idx].w, maxH).fillAndStroke(rowBg, '#cbd5e1');
      doc.fillColor(idx === 7 ? st.color : '#0f172a')
        .font(idx === 7 ? 'Sarabun-Bold' : 'Sarabun')
        .fontSize(8.5)
        .text(String(v), cx + 4, y + 4, { width: cols[idx].w - 8 });
      cx += cols[idx].w;
    });
    y += maxH;
  }

  if (y + 115 > doc.page.height - 30) {
    doc.addPage({ size: 'A4', layout: 'landscape', margins: { top: 32, bottom: 32, left: 30, right: 30 } });
    y = 40;
  } else {
    y += 16;
  }
  const sigX = left + contentW - 260;
  doc.fillColor('#334155').font('Sarabun').fontSize(9.5)
    .text('ลงชื่อ ...............................................', sigX, y, { width: 250, align: 'center' })
    .text('( นางณัฐปภัสร์ นวัตชัยศิริกุล )', sigX, y + 16, { width: 250, align: 'center' })
    .text('นายแพทย์ชำนาญการพิเศษ', sigX, y + 30, { width: 250, align: 'center' })
    .text('รักษาการในตำแหน่ง', sigX, y + 43, { width: 250, align: 'center' })
    .font('Sarabun-Bold').text('ผู้อำนวยการ รพ.โคกศรีสุพรรณ', sigX, y + 56, { width: 250, align: 'center' });

  doc.end();
}

module.exports = { generateCarBookingPdf, generateCarBoardPdf };
