'use client';

export type HRPField = {
    value: string;
    label: string;
    required?: boolean;
    description?: string;
};

export const HRP_FIELD_GROUPS: Record<string, HRPField[]> = {
    "Identitas & Kontak": [
        { value: "fullName", label: "Nama Lengkap", required: true, description: "Nama lengkap karyawan sesuai KTP." },
        { value: "email", label: "Email", description: "Email utama untuk komunikasi." },
        { value: "phone", label: "Kontak (No. HP)" },
        { value: "birthPlace", label: "Tempat Lahir", description: "Kota tempat karyawan dilahirkan." },
        { value: "birthDate", label: "Tanggal Lahir", description: "Format: YYYY-MM-DD" },
        { value: "gender", label: "Jenis Kelamin", description: "Laki-laki atau Perempuan." },
        { value: "maritalStatus", label: "Status Pernikahan" },
        { value: "address", label: "Alamat", description: "Alamat lengkap saat ini." },
    ],
    "Informasi Kepegawaian": [
        { value: "employeeNumber", label: "Nomor Induk Karyawan (NIK)", required: true, description: "Nomor identifikasi unik internal perusahaan." },
        { value: "positionTitle", label: "Jabatan/Posisi" },
        { value: "division", label: "Departemen/Bagian" },
        { value: "brandName", label: "Nama Brand" },
        { value: "managerName", label: "Nama Manajer Divisi" },
        { value: "joinDate", label: "Tanggal Mulai Bekerja", description: "Format: YYYY-MM-DD" },
        { value: "employmentType", label: "Jenis Kontrak Kerja", description: "Contoh: Tetap, Kontrak, Harian." },
        { value: "employmentStatus", label: "Status Kerja", description: "Contoh: active, probation, resigned." },
    ],
    "Data Administratif": [
        { value: "nik", label: "No. KTP/SIM", description: "Nomor Induk Kependudukan 16 digit." },
        { value: "npwp", label: "NPWP" },
        { value: "bpjsKesehatan", label: "No. BPJS Kesehatan" },
        { value: "bpjsKetenagakerjaan", label: "No. BPJS Ketenagakerjaan" },
        { value: "bankAccountNumber", label: "No. Rekening Bank" },
        { value: "bankName", label: "Nama Bank" },
    ],
    "Riwayat Pendidikan & Karier (Opsional)": [
        { value: 'education', label: 'Pendidikan Terakhir' },
        { value: 'certification', label: 'Sertifikasi' },
        { value: 'promotion', label: 'Riwayat Promosi' },
        { value: 'performanceReview', label: 'Riwayat Penilaian Kinerja' },
    ],
};

export const HRP_FIELDS: HRPField[] = Object.values(HRP_FIELD_GROUPS).flat();
export const RECOMMENDED_HRP_FIELDS = HRP_FIELDS.filter(f => f.required);
