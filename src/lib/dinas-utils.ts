/**
 * Normalize province abbreviation/short name to full name
 */
const PROVINCE_MAP: Record<string, string> = {
  // Sumatera
  aceh: "Aceh",
  as: "Aceh",
  sumut: "Sumatera Utara",
  "sumatera utara": "Sumatera Utara",
  sumbar: "Sumatera Barat",
  "sumatera barat": "Sumatera Barat",
  riau: "Riau",
  jambi: "Jambi",
  sumsel: "Sumatera Selatan",
  "sumatera selatan": "Sumatera Selatan",
  bengkulu: "Bengkulu",
  lampung: "Lampung",

  // Java
  dki: "DKI Jakarta",
  jakarta: "DKI Jakarta",
  "dki jakarta": "DKI Jakarta",
  "jawa barat": "Jawa Barat",
  jabar: "Jawa Barat",
  "jawa tengah": "Jawa Tengah",
  jateng: "Jawa Tengah",
  diy: "Daerah Istimewa Yogyakarta",
  "daerah istimewa yogyakarta": "Daerah Istimewa Yogyakarta",
  yogyakarta: "Daerah Istimewa Yogyakarta",
  "jawa timur": "Jawa Timur",
  jatim: "Jawa Timur",

  // Bali & Nusa Tenggara
  bali: "Bali",
  "nusa tenggara barat": "Nusa Tenggara Barat",
  ntb: "Nusa Tenggara Barat",
  "nusa tenggara timur": "Nusa Tenggara Timur",
  ntt: "Nusa Tenggara Timur",

  // Kalimantan
  "kalimantan barat": "Kalimantan Barat",
  kalbar: "Kalimantan Barat",
  "kalimantan tengah": "Kalimantan Tengah",
  kalteng: "Kalimantan Tengah",
  "kalimantan selatan": "Kalimantan Selatan",
  kalsel: "Kalimantan Selatan",
  "kalimantan timur": "Kalimantan Timur",
  kaltim: "Kalimantan Timur",
  "kalimantan utara": "Kalimantan Utara",
  kaltara: "Kalimantan Utara",

  // Sulawesi
  "sulawesi utara": "Sulawesi Utara",
  sulut: "Sulawesi Utara",
  "sulawesi tengah": "Sulawesi Tengah",
  sulteng: "Sulawesi Tengah",
  "sulawesi selatan": "Sulawesi Selatan",
  sulsel: "Sulawesi Selatan",
  "sulawesi tenggara": "Sulawesi Tenggara",
  sultra: "Sulawesi Tenggara",

  // Papua & Maluku
  maluku: "Maluku",
  "maluku utara": "Maluku Utara",
  papua: "Papua",
  "papua barat": "Papua Barat",
  papbar: "Papua Barat",
  "papua barat daya": "Papua Barat Daya",
  "papua selatan": "Papua Selatan",
  "papua tengah": "Papua Tengah",
  "papua pegunungan": "Papua Pegunungan",
};

/**
 * Normalize province name to full name
 */
export function normalizeProvinceName(
  province: string | undefined | null,
): string {
  if (!province) return "";
  const normalized = PROVINCE_MAP[province.toLowerCase().trim()];
  if (normalized) return normalized;
  // If not found in map, return as-is (could be full name already)
  return province.trim();
}

/**
 * Format destination from mission object
 * Returns format: "Kota/Kabupaten XYZ, Provinsi ABC"
 */
export function formatDestination(mission: any): string {
  if (!mission) return "-";

  const city =
    mission.destinationCity ||
    mission.destinationRegency ||
    mission.destinationKabupaten;
  const province = mission.destinationProvince;
  const label =
    mission.destinationLabel ||
    mission.destinationName ||
    mission.destination ||
    mission.tujuan;

  // Priority: city + normalized province
  if (city && province) {
    const normalizedProvince = normalizeProvinceName(province);
    return `${city}, ${normalizedProvince}`;
  }

  // Fallback to city or province alone
  if (city) return city;
  if (province) return normalizeProvinceName(province);
  if (label) return label;

  return "-";
}

/**
 * Extract file ID from Google Drive URL
 */
export function extractGoogleDriveFileId(
  url: string | undefined | null,
): string | null {
  if (!url) return null;

  const patterns = [
    /\/d\/([a-zA-Z0-9-_]+)/, // /d/{fileId}
    /id=([a-zA-Z0-9-_]+)/, // id={fileId}
    /^([a-zA-Z0-9-_]+)$/, // Just fileId
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

const BUSINESS_TRIP_STATUS_LABELS: Record<string, string> = {
  pending: "Menunggu persetujuan",
  waiting: "Menunggu persetujuan",
  waiting_staff_confirmation: "Menunggu konfirmasi staff",
  waiting_manager_validation: "Menunggu persetujuan atasan",
  pending_manager_validation: "Menunggu persetujuan atasan",
  approved: "Disetujui",
  approved_by_manager: "Disetujui atasan",
  approved_ready_to_depart: "Disetujui dan siap berangkat",
  confirmed_by_staff: "Staff sudah konfirmasi",
  declined_by_staff: "Staff tidak bisa ikut",
  rejected: "Ditolak",
  rejected_by_manager: "Ditolak atasan",
  replacement_requested: "Menunggu penggantian staff",
  partial_approved: "Disetujui sebagian",
  validated_by_assigner: "Divalidasi pemberi tugas",
  ready_to_depart: "Siap berangkat",
  on_duty: "Sedang bertugas",
  returned: "Sudah kembali",
  report_submitted: "Laporan dikirim",
  completed: "Selesai",
  archived: "Diarsip",
};

export function formatBusinessTripStatus(
  status: string | undefined | null,
): string {
  if (!status) return "-";
  const normalized = String(status).toLowerCase().trim();
  if (BUSINESS_TRIP_STATUS_LABELS[normalized]) {
    return BUSINESS_TRIP_STATUS_LABELS[normalized];
  }
  return normalized
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Strip HTML tags from text
 */
export function stripHtml(html: string | undefined | null): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
