'use client';
import { createElement, type ReactNode } from 'react';
import { 
    LayoutDashboard, Users, Briefcase, User, Calendar, DollarSign, Settings, ShieldCheck, Database, History, 
    Contact, UserPlus, FolderKanban, CalendarOff, UserMinus, KanbanSquare, CheckSquare, BarChart, ClipboardCheck, Award, Search, FileText, FileUp, Video, BrainCircuit, Timer, MapPin, BookUser, FileHeart, FileClock, GraduationCap 
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

const RECRUITMENT_MENU_ITEMS: MenuGroup[] = [
    {
        title: "Rekrutmen",
        items: [
            { key: 'recruitment.dashboard', href: '/admin/hrd/dashboard-rekrutmen', label: 'Dashboard Rekrutmen', icon: createElement(Users) },
            { key: 'recruitment.jobs', href: '/admin/jobs', label: 'Job Postings', icon: createElement(Briefcase) },
            { key: 'recruitment.applications', href: '/admin/recruitment', label: 'Manajemen Aplikasi', icon: createElement(FolderKanban) },
            { key: 'recruitment.assessments', href: '/admin/hrd/assessments', label: 'Assessments', icon: createElement(ClipboardCheck) },
        ]
    }
];

const EMPLOYEE_MONITORING_ITEMS: MenuGroup[] = [
    {
        title: "Monitoring Karyawan",
        items: [
            { key: 'monitoring.dashboard', href: '/admin/hrd/dashboard-karyawan', label: 'Dashboard Karyawan', icon: createElement(LayoutDashboard) },
            { key: 'monitoring.invites', href: '/admin/hrd/invites', label: 'Employee Invites', icon: createElement(UserPlus) },
            { key: 'monitoring.interns', href: '/admin/hrd/profil-magang', label: 'Profil Magang', icon: createElement(BookUser) },
            { key: 'monitoring.attendance', href: '/admin/hrd/monitoring/absen', label: 'Monitoring Absen', icon: createElement(FileClock) },
            { key: 'monitoring.overtime', href: '/admin/hrd/monitoring/lembur', label: 'Lembur', icon: createElement(Timer) },
            { key: 'monitoring.field_duty', href: '/admin/hrd/monitoring/dinas', label: 'Dinas (Tracking)', icon: createElement(MapPin) },
            { key: 'monitoring.leave', href: '/admin/hrd/monitoring/cuti', label: 'Cuti', icon: createElement(CalendarOff) },
            { key: 'monitoring.permission', href: '/admin/hrd/monitoring/izin', label: 'Izin', icon: createElement(FileHeart) },
            { key: 'monitoring.training', href: '/admin/hrd/monitoring/pelatihan', label: 'Pengembangan SDM', icon: createElement(GraduationCap) },
            { key: 'monitoring.settings', href: '/admin/hrd/monitoring/settings', label: 'Pengaturan Absensi', icon: createElement(Settings) },
        ]
    }
];


export const MENU_CONFIG: Record<string, MenuGroup[]> = {
  'super-admin': [
    ...EMPLOYEE_MONITORING_ITEMS,
    ...RECRUITMENT_MENU_ITEMS,
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
    ...EMPLOYEE_MONITORING_ITEMS,
    ...RECRUITMENT_MENU_ITEMS,
    {
        title: "Personal",
        items: [
            { key: 'personal.interviews', href: '/admin/interviews', label: 'My Interviews', icon: createElement(Video) }
        ]
    }
  ],
  'manager': [
    {
        title: "Manager",
        items: [
            { key: 'manager.team', href: '/admin/manager', label: 'My Team', icon: createElement(Users) },
            { key: 'personal.interviews', href: '/admin/interviews', label: 'My Interviews', icon: createElement(Video) },
        ]
    }
  ],
  'karyawan': [
    {
        title: "Karyawan",
        items: [
            { key: 'employee.profile', href: '/admin/karyawan', label: 'My Profile', icon: createElement(User) },
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

const allMenuItemsByRole: Partial<Record<UserRole, MenuItem[]>> = {};
for (const role in MENU_CONFIG) {
    if (Object.prototype.hasOwnProperty.call(MENU_CONFIG, role)) {
        const menuGroups = MENU_CONFIG[role as keyof typeof MENU_CONFIG];
        if (menuGroups) {
            allMenuItemsByRole[role as UserRole] = menuGroups.flatMap(group => group.items);
        }
    }
}
export const ALL_MENU_ITEMS = allMenuItemsByRole as Record<UserRole, MenuItem[]>;

const uniqueItems = new Map<string, MenuItem>();
Object.values(allMenuItemsByRole).flat().forEach(item => {
    if (item && item.label && !uniqueItems.has(item.label)) {
        uniqueItems.set(item.label, item);
    }
});

export const ALL_UNIQUE_MENU_ITEMS: MenuItem[] = Array.from(uniqueItems.values());
