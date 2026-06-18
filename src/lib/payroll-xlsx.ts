/**
 * payroll-xlsx.ts
 * Professional multi-sheet Excel export for Rekap Absensi Payroll.
 * Uses SheetJS (xlsx) with cell-level styling.
 */

import * as XLSX from "xlsx";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import type { PayrollRecapRow, LeaveDetail } from "./payroll-recap";

// ─── Palette ─────────────────────────────────────────────────────────────────

const P = {
  headerDark:  "134E4A",
  headerMid:   "0F766E",
  tealPale:    "F0FDFA",
  tealLight:   "CCFBF1",
  white:       "FFFFFF",
  offWhite:    "F8FAFC",
  rowAlt:      "F1F5F9",
  greenBg:     "F0FDF4",
  greenFg:     "166534",
  orangeBg:    "FFF7ED",
  orangeFg:    "9A3412",
  redBg:       "FEF2F2",
  redFg:       "991B1B",
  blueBg:      "EFF6FF",
  blueFg:      "1E40AF",
  purpleBg:    "F5F3FF",
  purpleFg:    "5B21B6",
  grayBg:      "F1F5F9",
  grayFg:      "475569",
  slateText:   "1E293B",
  midText:     "64748B",
  border:      "CBD5E1",
  borderDark:  "94A3B8",
};

// ─── Style factories ──────────────────────────────────────────────────────────

type XlsxStyle = Record<string, any>;

function bdr(color = P.border) {
  return {
    top:    { style: "thin", color: { rgb: color } },
    bottom: { style: "thin", color: { rgb: color } },
    left:   { style: "thin", color: { rgb: color } },
    right:  { style: "thin", color: { rgb: color } },
  };
}

function sTitle(): XlsxStyle {
  return {
    font: { bold: true, sz: 14, color: { rgb: P.headerMid } },
    alignment: { horizontal: "left", vertical: "center" },
  };
}

function sSubtitle(): XlsxStyle {
  return {
    font: { bold: true, sz: 10, color: { rgb: P.midText } },
    alignment: { horizontal: "left", vertical: "center" },
  };
}

function sColHeader(bg = P.headerDark): XlsxStyle {
  return {
    font:      { bold: true, sz: 10, color: { rgb: P.white } },
    fill:      { patternType: "solid", fgColor: { rgb: bg } },
    alignment: { horizontal: "center", vertical: "center", wrapText: false },
    border:    bdr(P.borderDark),
  };
}

function sSectionHeader(bg = P.headerDark): XlsxStyle {
  return {
    font:      { bold: true, sz: 10, color: { rgb: P.white } },
    fill:      { patternType: "solid", fgColor: { rgb: bg } },
    alignment: { horizontal: "left", vertical: "center" },
    border:    bdr(P.borderDark),
  };
}

function sLabel(): XlsxStyle {
  return {
    font:      { bold: true, sz: 10, color: { rgb: P.slateText } },
    fill:      { patternType: "solid", fgColor: { rgb: P.grayBg } },
    alignment: { horizontal: "left", vertical: "center" },
    border:    bdr(),
  };
}

function sValue(bg?: string): XlsxStyle {
  return {
    font:      { sz: 10, color: { rgb: P.slateText } },
    fill:      bg ? { patternType: "solid", fgColor: { rgb: bg } } : { patternType: "none" },
    alignment: { horizontal: "left", vertical: "center" },
    border:    bdr(),
  };
}

function sNum(bg?: string, highlight = false): XlsxStyle {
  return {
    font:      { bold: highlight, sz: 11, color: { rgb: highlight ? P.headerMid : P.slateText } },
    fill:      bg ? { patternType: "solid", fgColor: { rgb: bg } } : { patternType: "none" },
    alignment: { horizontal: "right", vertical: "center" },
    border:    bdr(),
  };
}

function sData(bg?: string, align: "left" | "center" | "right" = "left"): XlsxStyle {
  return {
    font:      { sz: 10, color: { rgb: P.slateText } },
    fill:      bg ? { patternType: "solid", fgColor: { rgb: bg } } : { patternType: "none" },
    alignment: { horizontal: align, vertical: "center" },
    border:    bdr(),
  };
}

function sStatus(status: string): XlsxStyle {
  // Determine colors by prefix/content — covers all current and future compound statuses
  let bg: string;
  let fg: string;
  if (status === "Tepat Waktu") {
    bg = P.greenBg; fg = P.greenFg;
  } else if (status === "Alpha") {
    bg = P.redBg; fg = P.redFg;
  } else if (status === "Izin") {
    bg = P.blueBg; fg = P.blueFg;
  } else if (status === "Cuti") {
    bg = P.purpleBg; fg = P.purpleFg;
  } else if (status === "Libur Nasional" || status === "Cuti Bersama" || status === "Libur Perusahaan" || status === "Akhir Pekan") {
    bg = P.grayBg; fg = P.grayFg;
  } else if (status === "Belum Berjalan") {
    bg = P.offWhite; fg = P.midText;
  } else if (status.startsWith("Dinas")) {
    // All Dinas variants: teal base; orange tint if includes Terlambat
    if (status.includes("Terlambat")) { bg = P.orangeBg; fg = P.orangeFg; }
    else { bg = P.tealPale; fg = P.headerMid; }
  } else if (status === "Terlambat" || status.includes("Terlambat")) {
    bg = P.orangeBg; fg = P.orangeFg;
  } else {
    bg = P.white; fg = P.slateText;
  }
  const c = { bg, fg };
  return {
    font:      { bold: true, sz: 10, color: { rgb: c.fg } },
    fill:      { patternType: "solid", fgColor: { rgb: c.bg } },
    alignment: { horizontal: "center", vertical: "center" },
    border:    bdr(),
  };
}

function sJenis(jenis: string): XlsxStyle {
  const j = jenis.toLowerCase();
  if (j === "cuti")   return sStatus("Cuti");
  if (j === "dinas")  return sStatus("Dinas");
  return sStatus("Izin");
}

// ─── Worksheet builder ────────────────────────────────────────────────────────

type CellVal = string | number | null;

function makeWs(
  rows: CellVal[][],
  colWidths: number[],
  styleFn: (r: number, c: number, v: CellVal) => XlsxStyle | null,
  freezeRows = 0,
  merges?: { s: { r: number; c: number }; e: { r: number; c: number } }[],
): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  ws["!cols"] = colWidths.map((w) => ({ wch: w }));

  // Freeze pane
  if (freezeRows > 0) {
    ws["!sheetviews"] = [{
      state: "frozen",
      xSplit: 0,
      ySplit: freezeRows,
      topLeftCell: XLSX.utils.encode_cell({ r: freezeRows, c: 0 }),
      activeCell: XLSX.utils.encode_cell({ r: freezeRows, c: 0 }),
    }];
  }

  // Merges
  if (merges?.length) ws["!merges"] = merges;

  // Apply styles cell-by-cell
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) ws[addr] = { v: "", t: "s" };
      const cellVal: CellVal =
        typeof ws[addr].v === "number" ? ws[addr].v as number :
        typeof ws[addr].v === "string" ? ws[addr].v as string : null;
      const s = styleFn(R, C, cellVal);
      if (s) (ws[addr] as any).s = s;
    }
  }

  return ws;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function fd(ds: string): string {
  try { return format(new Date(ds), "d MMMM yyyy", { locale: idLocale }); }
  catch { return ds; }
}

function fday(ds: string): string {
  try { return format(new Date(ds), "EEEE", { locale: idLocale }); }
  catch { return "-"; }
}

// ─── Sheet 1: Ringkasan Payroll ───────────────────────────────────────────────

function sheetRingkasan(
  row: PayrollRecapRow,
  periodLabel: string,
  totalTepatWaktu: number,
): XLSX.WorkSheet {
  const nilaiStyle = (val: number): XlsxStyle => {
    if (val === 0) return sNum(undefined, false);
    if (val > 0)   return sNum(P.tealLight, true);
    return sNum(undefined, false);
  };
  const alertNum = (val: number, alertOn = false): XlsxStyle =>
    alertOn && val > 0 ? sNum(P.orangeBg, true) : sNum(undefined, false);

  const data: CellVal[][] = [
    // Row 0: Title
    ["DETAIL ABSENSI PAYROLL", null],
    // Row 1: empty
    [null, null],
    // Row 2-6: info
    ["Nama Karyawan",   row.fullName],
    ["NIK",             row.employeeNumber || "-"],
    ["Brand",           row.brandName],
    ["Divisi",          row.divisionName],
    ["Periode",         periodLabel],
    // Row 7: empty
    [null, null],
    // Row 8: section header
    ["RINGKASAN KEHADIRAN", "NILAI"],
    // Row 9-18: metrics
    ["Total Hari Kerja",         row.hariKerja],
    ["Total Hadir",              row.hadir],
    ["Tepat Waktu",              totalTepatWaktu],
    ["Terlambat",                row.terlambat],
    ["Total Menit Terlambat",    row.menitTerlambat],
    ["Izin",                     row.izin],
    ["Cuti",                     row.cuti],
    ["Dinas",                    row.dinas],
    ["Alpha",                    row.alpha],
    ["Total Jam Kerja",          row.totalJamKerja],
  ];

  const ws = makeWs(
    data,
    [32, 28],
    (r, c, v) => {
      if (r === 0) return c === 0 ? sTitle() : null;
      if (r === 1) return null;
      if (r >= 2 && r <= 6) return c === 0 ? sLabel() : sValue();
      if (r === 7) return null;
      if (r === 8) return c === 0 ? sSectionHeader(P.headerDark) : sSectionHeader(P.headerMid);
      if (r >= 9) {
        if (c === 0) return sLabel();
        const val = typeof v === "number" ? v : 0;
        if (r === 12) return alertNum(val, true);  // Terlambat
        if (r === 13) return alertNum(val, true);  // Menit Terlambat
        if (r === 17) return alertNum(val, true);  // Alpha
        return nilaiStyle(val);
      }
      return null;
    },
    0,
    [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }],
  );

  return ws;
}

// ─── Sheet 2: Rincian Tanggal ─────────────────────────────────────────────────

function sheetRincianTanggal(
  row: PayrollRecapRow,
  nik: string,
): XLSX.WorkSheet {
  const leaveByDate = new Map<string, LeaveDetail>();
  // Keep the LAST dinas detail per date so keterangan reflects the correct SPD
  row.leaveDetails.forEach((ld) => {
    if (!leaveByDate.has(ld.date) || ld.type === "Dinas") leaveByDate.set(ld.date, ld);
  });

  const headers: CellVal[] = [
    "No", "Tanggal", "Hari", "Status",
    "Jam Masuk", "Jam Pulang", "Keterangan",
    "Jenis Aktivitas", "Nomor SPD", "Nama Perjalanan", "Tujuan", "Kegiatan",
    "Periode Dinas", "Disetujui Oleh", "NIK", "Nama Lengkap",
  ];
  const colW = [5, 20, 13, 26, 11, 11, 46, 12, 22, 28, 24, 24, 22, 24, 14, 26];

  const dataRows: CellVal[][] = [headers];
  row.calendarDetails.forEach((d, i) => {
    const ld = leaveByDate.get(d.date);
    const isDinas = ld?.type === "Dinas";
    const periodDinas = isDinas && ld.periodStart && ld.periodEnd
      ? `${fd(ld.periodStart)} – ${fd(ld.periodEnd)}`
      : "-";
    dataRows.push([
      i + 1,
      fd(d.date),
      d.dayName,
      d.status,
      d.tapInTime || "-",
      d.tapOutTime || "-",
      d.keterangan || "-",
      ld?.type || "-",
      isDinas ? (ld.spdNumber || "-") : "-",
      isDinas ? (ld.missionName || "-") : "-",
      isDinas ? (ld.destination || "-") : "-",
      isDinas ? (ld.activity || "-") : "-",
      periodDinas,
      ld?.approvedBy || "-",
      nik,
      row.fullName,
    ]);
  });

  return makeWs(dataRows, colW, (r, c) => {
    if (r === 0) return sColHeader();
    const status = String(dataRows[r]?.[3] ?? "");
    const alt = r % 2 === 0 ? P.offWhite : undefined;
    if (c === 0)  return sData(P.grayBg, "center");
    if (c === 3)  return sStatus(status);
    if (c === 4 || c === 5) return sData(alt, "center");
    return sData(alt);
  }, 1);
}

// ─── Sheet 3: Detail Izin Cuti Dinas ─────────────────────────────────────────

function sheetIzinCutiDinas(
  approvedLeaveDetails: LeaveDetail[],
  nik: string,
  fullName: string,
): XLSX.WorkSheet {
  const headers: CellVal[] = [
    "No", "Jenis", "Tanggal", "Hari",
    "Keterangan / Kegiatan",
    "Nomor SPD", "Nama Perjalanan Dinas", "Tujuan", "Kegiatan",
    "Periode Dinas",
    "Status Approval", "Disetujui Oleh",
    "NIK", "Nama Lengkap",
  ];
  const colW = [5, 10, 20, 13, 40, 22, 30, 24, 24, 24, 20, 26, 14, 26];

  const dataRows: CellVal[][] = [headers];

  if (approvedLeaveDetails.length === 0) {
    dataRows.push(Array(headers.length).fill(null).map((_, i) => i === 1 ? "(Tidak ada data)" : null));
  } else {
    approvedLeaveDetails.forEach((d, i) => {
      const isDinas = d.type === "Dinas";
      const periodDinas = isDinas && d.periodStart && d.periodEnd
        ? `${fd(d.periodStart)} – ${fd(d.periodEnd)}`
        : "-";
      dataRows.push([
        i + 1,
        d.type,
        fd(d.date),
        fday(d.date),
        d.keterangan || "-",
        isDinas ? (d.spdNumber || "-") : "-",
        isDinas ? (d.missionName || "-") : "-",
        isDinas ? (d.destination || "-") : "-",
        isDinas ? (d.activity || "-") : "-",
        periodDinas,
        d.status,
        d.approvedBy || "-",
        nik,
        fullName,
      ]);
    });
  }

  const LEAVE_BG: Record<string, string> = {
    Izin:  P.blueBg,
    Cuti:  P.purpleBg,
    Dinas: P.tealPale,
  };

  return makeWs(dataRows, colW, (r, c) => {
    if (r === 0) return sColHeader(P.headerMid);
    if (r === 1 && approvedLeaveDetails.length === 0) return sData(P.offWhite);
    const jenis = String(dataRows[r]?.[1] ?? "");
    const bg = LEAVE_BG[jenis];
    if (c === 0) return sData(P.grayBg, "center");
    if (c === 1) return sJenis(jenis);
    return sData(bg);
  }, 1);
}

// ─── Sheet 4: Detail Keterlambatan ───────────────────────────────────────────

function sheetKeterlambatan(row: PayrollRecapRow): XLSX.WorkSheet {
  const headers: CellVal[] = [
    "No", "Tanggal", "Hari",
    "Jam Masuk", "Batas Jam Masuk",
    "Menit Terlambat", "Keterangan",
  ];
  const colW = [5, 20, 13, 13, 16, 16, 44];

  const dataRows: CellVal[][] = [headers];

  if (row.lateDetails.length === 0) {
    dataRows.push([null, "(Tidak ada keterlambatan dalam periode ini)", null, null, null, null, null]);
  } else {
    row.lateDetails.forEach((d, i) => {
      dataRows.push([
        i + 1,
        fd(d.date),
        fday(d.date),
        d.tapInTime,
        d.scheduledStartTime || "-",
        d.lateMinutes,
        `Terlambat ${d.lateMinutes} menit dari batas toleransi.`,
      ]);
    });
  }

  return makeWs(dataRows, colW, (r, c) => {
    if (r === 0) return sColHeader("C2410C");
    if (r === 1 && row.lateDetails.length === 0) return sData(P.offWhite);
    const alt = r % 2 === 0 ? "FFFAF7" : P.orangeBg;
    if (c === 0) return sData(P.grayBg, "center");
    if (c === 3 || c === 4) return sData(alt, "center");
    if (c === 5) return sNum(P.orangeBg, true);
    return sData(alt);
  }, 1);
}

// ─── Sheet 5: Detail Alpha ────────────────────────────────────────────────────

function sheetAlpha(row: PayrollRecapRow): XLSX.WorkSheet {
  const headers: CellVal[] = ["No", "Tanggal", "Hari", "Keterangan"];
  const colW = [5, 20, 13, 56];

  const dataRows: CellVal[][] = [headers];

  if (row.alphaDetails.length === 0) {
    dataRows.push([null, "(Tidak ada alpha dalam periode ini)", null, null]);
  } else {
    row.alphaDetails.forEach((d, i) => {
      dataRows.push([
        i + 1,
        fd(d.date),
        d.dayName,
        d.keterangan || "Tidak ada data absen dan tidak ada izin/cuti/dinas approved.",
      ]);
    });
  }

  return makeWs(dataRows, colW, (r, c) => {
    if (r === 0) return sColHeader("B91C1C");
    if (r === 1 && row.alphaDetails.length === 0) return sData(P.offWhite);
    const alt = r % 2 === 0 ? "FFF5F5" : P.redBg;
    if (c === 0) return sData(P.grayBg, "center");
    return sData(alt);
  }, 1);
}

// ─── Download helper ──────────────────────────────────────────────────────────

function dlWb(wb: XLSX.WorkBook, filename: string) {
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Public: Detail per karyawan ─────────────────────────────────────────────

export function exportDetailXlsx(
  row: PayrollRecapRow,
  period: { startDate: Date; endDate: Date },
  approvedLeaveDetails: LeaveDetail[],
  totalTepatWaktu: number,
): void {
  const periodLabel = `${format(period.startDate, "d MMM yyyy", { locale: idLocale })} - ${format(period.endDate, "d MMM yyyy", { locale: idLocale })}`;
  const periodStr   = `${format(period.startDate, "yyyyMMdd")}_${format(period.endDate, "yyyyMMdd")}`;
  const safeName    = row.fullName.replace(/[^\w\s]/g, "").replace(/\s+/g, "_");
  const nik         = row.employeeNumber || row.employeeId || "-";

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetRingkasan(row, periodLabel, totalTepatWaktu),       "Ringkasan");
  XLSX.utils.book_append_sheet(wb, sheetRincianTanggal(row, nik),                           "Rincian Tanggal");
  XLSX.utils.book_append_sheet(wb, sheetIzinCutiDinas(approvedLeaveDetails, nik, row.fullName), "Izin Cuti Dinas");
  XLSX.utils.book_append_sheet(wb, sheetKeterlambatan(row),                                 "Keterlambatan");
  XLSX.utils.book_append_sheet(wb, sheetAlpha(row),                                         "Alpha");

  dlWb(wb, `Detail_Absensi_Payroll_${safeName}_${nik}_${periodStr}.xlsx`);
}

// ─── Public: Rekap semua karyawan ─────────────────────────────────────────────

export function exportSummaryXlsx(
  recapRows: PayrollRecapRow[],
  activePeriod: { startDate: Date; endDate: Date; displayLabel: string },
): void {
  const periodStr = `${format(activePeriod.startDate, "yyyyMMdd")}_${format(activePeriod.endDate, "yyyyMMdd")}`;

  // Sheet 1: Ringkasan semua karyawan
  const sumHeaders: CellVal[] = [
    "No", "NIK", "Nama Lengkap", "Brand", "Divisi",
    "Total Hari Kerja", "Total Hadir", "Tepat Waktu", "Terlambat",
    "Total Menit Terlambat", "Izin", "Cuti", "Dinas", "Alpha",
    "Total Jam Kerja", "Periode",
  ];
  const sumColW = [5, 14, 28, 18, 22, 14, 12, 12, 12, 18, 8, 8, 8, 8, 14, 26];
  const sumRows: CellVal[][] = [sumHeaders];

  recapRows.forEach((r, i) => {
    const tw = r.calendarDetails.filter((d) =>
      d.status === "Tepat Waktu" || d.status === "Dinas + Tepat Waktu",
    ).length;
    sumRows.push([
      i + 1, r.employeeNumber || "-", r.fullName, r.brandName, r.divisionName,
      r.hariKerja, r.hadir, tw, r.terlambat, r.menitTerlambat,
      r.izin, r.cuti, r.dinas, r.alpha, r.totalJamKerja,
      activePeriod.displayLabel,
    ]);
  });

  const wsSumFinal = makeWs(sumRows, sumColW, (r, c) => {
    if (r === 0) return sColHeader();
    if (c === 0)  return sData(P.grayBg, "center");
    if (c >= 5 && c <= 14) {
      const alt = r % 2 === 0 ? P.tealPale : undefined;
      const v = sumRows[r]?.[c];
      const isAlert = (c === 8 || c === 9 || c === 13) && typeof v === "number" && v > 0;
      return isAlert ? sNum(P.orangeBg, true) : sNum(alt, false);
    }
    return sData(r % 2 === 0 ? P.offWhite : undefined);
  }, 1);

  // Sheet 2: Detail semua karyawan (per tanggal)
  const dtlHeaders: CellVal[] = [
    "No", "NIK", "Nama Lengkap", "Brand", "Divisi",
    "Tanggal", "Hari", "Status", "Jam Masuk", "Jam Pulang", "Keterangan",
  ];
  const dtlColW = [5, 14, 26, 18, 20, 20, 13, 22, 11, 11, 40];
  const dtlRows: CellVal[][] = [dtlHeaders];
  let seq = 0;

  recapRows.forEach((r) => {
    r.calendarDetails.forEach((d) => {
      seq++;
      dtlRows.push([
        seq, r.employeeNumber || "-", r.fullName, r.brandName, r.divisionName,
        fd(d.date), d.dayName, d.status,
        d.tapInTime || "-", d.tapOutTime || "-", d.keterangan || "-",
      ]);
    });
  });

  const wsDetail = makeWs(dtlRows, dtlColW, (r, c) => {
    if (r === 0) return sColHeader();
    const status = String(dtlRows[r]?.[7] ?? "");
    const alt = r % 2 === 0 ? P.offWhite : undefined;
    if (c === 0)  return sData(P.grayBg, "center");
    if (c === 7)  return sStatus(status);
    if (c === 8 || c === 9) return sData(alt, "center");
    return sData(alt);
  }, 1);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsSumFinal,  "Ringkasan Semua Karyawan");
  XLSX.utils.book_append_sheet(wb, wsDetail,    "Detail Per Karyawan");

  dlWb(wb, `Rekap_Absensi_Payroll_${periodStr}.xlsx`);
}
