'use client';
import { createElement, type ReactNode } from 'react';
import { 
    LayoutDashboard, Users, Briefcase, User, Calendar, DollarSign, Settings, ShieldCheck, Database, History, 
    Contact, UserPlus, FolderKanban, CalendarOff, UserMinus, KanbanSquare, CheckSquare, BarChart, ClipboardCheck, Award, Search, FileText, FileUp, Video, BrainCircuit, Timer, MapPin, BookUser, FileHeart, FileClock, GraduationCap, PenSquare
} from 'lucide-react';
import type { UserRole } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

export type MenuItem = {
  key: string; // Unique identifier
  href: string;
  label: string;
  icon: ReactNode;
  badge?: ReactNode | number;
};

export type MenuGroup = {
    title?: string;
    items: MenuItem[];
}

const RECRUITMENT_MENU_ITEMS: MenuGroup = {
    title: "Rekrutmen",
    items: [
        { key: 'recruitment.dashboard', href: '/admin/hrd/dashboard-rekrutmen', label: 'Dashboard Rekrutmen', icon: createElement(Users) },
        { key: 'recruitment.jobs', href: '/admin/jobs', label: 'Job Postings', icon: createElement(Briefcase) },
        { key: 'recruitment.applications', href: '/admin/recruitment', label: 'Manajemen Aplikasi', icon: createElement(FolderKanban) },
        { key: 'recruitment.assessments', href: '/admin/hrd/assessments', label: 'Assessments', icon: createElement(ClipboardCheck) },
    ]
};

const EMPLOYEE_MANAGEMENT_ITEMS: MenuGroup = {
    title: "Manajemen Karyawan",
    items: [
        { key: 'employee.data.karyawan', href: '/admin/hrd/employee-data/karyawan', label: 'Data Karyawan', icon: createElement(Users) },
    ]
};

const EMPLOYEE_MONITORING_ITEMS: MenuGroup = {
    title: "Monitoring Karyawan",
    items: [
        { key: 'monitoring.dashboard', href: '/admin/hrd/dashboard-karyawan', label: 'Dashboard Karyawan', icon: createElement(LayoutDashboard) },
        { key: 'monitoring.invites', href: '/admin/hrd/invites', label: 'Employee Invites', icon: createElement(UserPlus) },
        { key: 'monitoring.interns', href: '/admin/hrd/employee-data/intern', label: 'Profil Magang', icon: createElement(BookUser) },
        { key: 'monitoring.attendance', href: '/admin/hrd/monitoring/absen', label: 'Monitoring Absen', icon: createElement(FileClock) },
        { key: 'hrd.overtime_approval', href: '/admin/hrd/persetujuan-lembur', label: 'Persetujuan Lembur', icon: createElement(Timer) },
        { key: 'hrd.permission_approval', href: '/admin/hrd/persetujuan-izin', label: 'Persetujuan Izin', icon: createElement(FileHeart) },
        { key: 'monitoring.field_duty', href: '/admin/hrd/monitoring/dinas', label: 'Dinas (Tracking)', icon: createElement(MapPin) },
        { key: 'monitoring.leave', href: '/admin/hrd/monitoring/cuti', label: 'Cuti', icon: createElement(CalendarOff) },
        { key: 'monitoring.training', href: '/admin/hrd/monitoring/pelatihan', label: 'Pengembangan SDM', icon: createElement(GraduationCap) },
        { key: 'monitoring.settings', href: '/admin/hrd/monitoring/settings', label: 'Pengaturan Absensi', icon: createElement(Settings) },
    ]
};

const REVIEW_ITEMS: MenuGroup = {
    title: "Review",
    items: [
        { key: 'review.reports', href: '/admin/review/laporan-magang', label: 'Review Laporan Magang', icon: createElement(PenSquare) },
        { key: 'manager.overtime_approval', href: '/admin/manager/persetujuan-lembur', label: 'Persetujuan Lembur Tim', icon: createElement(CheckSquare) },
        { key: 'manager.permission_approval', href: '/admin/manager/persetujuan-izin', label: 'Persetujuan Izin Tim', icon: createElement(FileHeart) },
    ]
};

export const ALL_MENU_GROUPS: MenuGroup[] = [
    RECRUITMENT_MENU_ITEMS,
    EMPLOYEE_MANAGEMENT_ITEMS,
    EMPLOYEE_MONITORING_ITEMS,
    REVIEW_ITEMS,
    {
        title: "Administrasi",
        items: [
            { key: 'admin.users', href: '/admin/super-admin/user-management', label: 'User Management', icon: createElement(Users) },
            { key: 'admin.master', href: '/admin/super-admin/departments-brands', label: 'Master Data', icon: createElement(Database) },
            { key: 'admin.access', href: '/admin/super-admin/menu-settings', label: 'Access & Roles', icon: createElement(ShieldCheck) },
        ]
    },
    {
        title: "Personal",
        items: [
            { key: 'personal.interviews', href: '/admin/interviews', label: 'My Interviews', icon: createElement(Video) },
            { key: 'recruitment.tasks', href: '/admin/recruitment/my-tasks', label: 'Tugas Rekrutmen', icon: createElement(Briefcase) },
        ]
    },
    {
        title: "Karyawan",
        items: [
            { key: 'employee.dashboard', href: '/admin/karyawan/dashboard', label: 'Dashboard', icon: createElement(LayoutDashboard) },
            { key: 'employee.profile', href: '/admin/karyawan/profile', label: 'Data Diri Karyawan', icon: createElement(User) },
            { key: 'employee.laporan.harian', href: '/admin/karyawan/magang/laporan-harian', label: 'Laporan Harian', icon: createElement(FileText) },
            { key: 'employee.laporan.rekap', href: '/admin/karyawan/magang/rekap-laporan', label: 'Rekap Laporan', icon: createElement(BarChart) },
            { key: 'employee.laporan.evaluasi', href: '/admin/karyawan/magang/evaluasi', label: 'Evaluasi & Feedback', icon: createElement(CheckSquare) },
            { key: 'employee.overtime', href: '/admin/karyawan/pengajuan-lembur', label: 'Pengajuan Lembur', icon: createElement(FileClock) },
            { key: 'employee.permission', href: '/admin/karyawan/pengajuan-izin', label: 'Pengajuan Izin', icon: createElement(FileHeart) },
            { key: 'employee.leave', href: '/admin/karyawan/pengajuan-cuti', label: 'Pengajuan Cuti', icon: createElement(CalendarOff) },
            { key: 'employee.dashboard.training', href: '/admin/karyawan/dashboard-training', label: 'Dashboard Training', icon: createElement(LayoutDashboard) },
        ]
    },
    {
        title: "Karir",
        items: [
            { key: 'candidate.dashboard', href: '/careers/portal', label: 'Dashboard', icon: createElement(LayoutDashboard) },
            { key: 'candidate.jobs', href: '/careers/portal/jobs', label: 'Daftar Lowongan', icon: createElement(Briefcase) },
            { key: 'candidate.applications', href: '/careers/portal/applications', label: 'Lamaran Saya', icon: createElement(FileText) },
        ]
    },
    {
        title: "Proses Seleksi",
        items: [
            { key: 'candidate.profile', href: '/careers/portal/profile', label: 'Profil Pelamar', icon: createElement(User) },
            { key: 'candidate.assessment', href: '/careers/portal/assessment/personality', label: 'Tes Kepribadian', icon: createElement(BrainCircuit) },
            { key: 'candidate.documents', href: '/careers/portal/documents', label: 'Pengumpulan Dokumen', icon: createElement(FileUp) },
            { key: 'candidate.interviews', href: '/careers/portal/interviews', label: 'Jadwal Wawancara', icon: createElement(Calendar) },
        ]
    }
];

export const MENU_CONFIG: Record<string, MenuGroup[]> = {
  'super-admin': [
    RECRUITMENT_MENU_ITEMS,
    EMPLOYEE_MANAGEMENT_ITEMS,
    EMPLOYEE_MONITORING_ITEMS,
    REVIEW_ITEMS,
    {
        title: "Administrasi",
        items: [
            { key: 'admin.users', href: '/admin/super-admin/user-management', label: 'User Management', icon: createElement(Users) },
            { key: 'admin.master', href: '/admin/super-admin/departments-brands', label: 'Master Data', icon: createElement(Database) },
            { key: 'admin.access', href: '/admin/super-admin/menu-settings', label: 'Access & Roles', icon: createElement(ShieldCheck) },
        ]
    },
    {
        title: "Personal",
        items: [
            { key: 'personal.interviews', href: '/admin/interviews', label: 'My Interviews', icon: createElement(Video) },
        ]
    }
  ],
  'hrd': [
    RECRUITMENT_MENU_ITEMS,
    EMPLOYEE_MANAGEMENT_ITEMS,
    EMPLOYEE_MONITORING_ITEMS,
    {
        title: "Personal",
        items: [
            { key: 'personal.interviews.hrd', href: '/admin/interviews', label: 'My Interviews', icon: createElement(Video) }
        ]
    }
  ],
  'manager': [
    {
        title: "Manager",
        items: [
            { key: 'manager.team', href: '/admin/manager', label: 'My Team', icon: createElement(Users) },
        ]
    },
    REVIEW_ITEMS,
    {
        title: "Personal",
        items: [
            { key: 'personal.interviews.manager', href: '/admin/interviews', label: 'My Interviews', icon: createElement(Video) },
        ]
    }
  ],
  'karyawan': [
    {
        title: "Karyawan",
        items: [
            { key: 'employee.dashboard', href: '/admin/karyawan/dashboard', label: 'Dashboard', icon: createElement(LayoutDashboard) },
            { key: 'employee.profile', href: '/admin/karyawan/profile', label: 'Data Diri Karyawan', icon: createElement(User) },
            { key: 'employee.overtime', href: '/admin/karyawan/pengajuan-lembur', label: 'Pengajuan Lembur', icon: createElement(FileClock) },
            { key: 'employee.permission', href: '/admin/karyawan/pengajuan-izin', label: 'Pengajuan Izin', icon: createElement(FileHeart) },
            { key: 'employee.leave', href: '/admin/karyawan/pengajuan-cuti', label: 'Pengajuan Cuti', icon: createElement(CalendarOff) },
        ]
    },
    REVIEW_ITEMS,
  ],

  'karyawan-magang': [
      {
        title: "Internship",
        items: [
            { key: 'employee.dashboard.magang', href: '/admin/karyawan/dashboard-magang', label: 'Dashboard Magang', icon: createElement(LayoutDashboard) },
            { key: 'employee.profile', href: '/admin/karyawan/magang/profile', label: 'Data Diri Karyawan', icon: createElement(User) },
            { key: 'employee.overtime', href: '/admin/karyawan/pengajuan-lembur', label: 'Pengajuan Lembur', icon: createElement(FileClock) },
            { key: 'employee.permission', href: '/admin/karyawan/pengajuan-izin', label: 'Pengajuan Izin', icon: createElement(FileHeart) },
        ]
      },
      {
        title: "Laporan Magang",
        items: [
            { key: 'employee.laporan.harian', href: '/admin/karyawan/magang/laporan-harian', label: 'Laporan Harian', icon: createElement(FileText) },
            { key: 'employee.laporan.rekap', href: '/admin/karyawan/magang/rekap-laporan', label: 'Rekap Laporan', icon: createElement(BarChart) },
            { key: 'employee.laporan.evaluasi', href: '/admin/karyawan/magang/evaluasi', label: 'Evaluasi & Feedback', icon: createElement(CheckSquare) },
        ]
      }
  ],
  'karyawan-training': [
      {
        title: "Karyawan",
        items: [
            { key: 'employee.dashboard.training', href: '/admin/karyawan/dashboard-training', label: 'Dashboard Training', icon: createElement(LayoutDashboard) },
            { key: 'employee.profile', href: '/admin/karyawan/profile', label: 'Data Diri Karyawan', icon: createElement(User) },
            { key: 'employee.overtime', href: '/admin/karyawan/pengajuan-lembur', label: 'Pengajuan Lembur', icon: createElement(FileClock) },
            { key: 'employee.permission', href: '/admin/karyawan/pengajuan-izin', label: 'Pengajuan Izin', icon: createElement(FileHeart) },
        ]
    }
  ],
  'kandidat': [
    {
      title: "Karir",
      items: [
        { key: 'candidate.dashboard', href: '/careers/portal', label: 'Dashboard', icon: createElement(LayoutDashboard) },
        { key: 'candidate.jobs', href: '/careers/portal/jobs', label: 'Daftar Lowongan', icon: createElement(Briefcase) },
        { key: 'candidate.applications', href: '/careers/portal/applications', label: 'Lamaran Saya', icon: createElement(FileText) },
      ]
    },
    {
      title: "Proses Seleksi",
      items: [
        { key: 'candidate.profile', href: '/careers/portal/profile', label: 'Profil Pelamar', icon: createElement(User) },
        { key: 'candidate.assessment', href: '/careers/portal/assessment/personality', label: 'Tes Kepribadian', icon: createElement(BrainCircuit) },
        { key: 'candidate.documents', href: '/careers/portal/documents', label: 'Pengumpulan Dokumen', icon: createElement(FileUp) },
        { key: 'candidate.interviews', href: '/careers/portal/interviews', label: 'Jadwal Wawancara', icon: createElement(Calendar) },
      ]
    }
  ]
};
