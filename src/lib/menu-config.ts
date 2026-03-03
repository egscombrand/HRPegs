'use client';
import { createElement, type ReactNode } from 'react';
import { 
    LayoutDashboard, Users, Briefcase, User, Calendar, DollarSign, Settings, ShieldCheck, Database, History, 
    Contact, UserPlus, FolderKanban, CalendarOff, UserMinus, KanbanSquare, CheckSquare, BarChart, ClipboardCheck, Award, Search, FileText, FileUp, Video, BrainCircuit, Timer, MapPin, BookUser, FileHeart, FileClock, GraduationCap 
} from 'lucide-react';
import type { UserRole } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

export type MenuItem = {
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
            { href: '/admin/hrd', label: 'Dashboard', icon: createElement(LayoutDashboard) },
            { href: '/admin/jobs', label: 'Job Postings', icon: createElement(Briefcase) },
            { href: '/admin/recruitment', label: 'Recruitment', icon: createElement(Users) },
            { href: '/admin/hrd/assessments', label: 'Assessments', icon: createElement(ClipboardCheck) },
            { href: '/admin/hrd/invites', label: 'Employee Invites', icon: createElement(UserPlus) },
        ]
    }
];

const EMPLOYEE_MONITORING_ITEMS: MenuGroup[] = [
    {
        title: "Monitoring Karyawan",
        items: [
            { href: '/admin/hrd/monitoring', label: 'Dashboard Karyawan', icon: createElement(LayoutDashboard) },
            { href: '/admin/hrd/monitoring/absen', label: 'Monitoring Absen', icon: createElement(FileClock) },
            { href: '/admin/hrd/monitoring/lembur', label: 'Lembur', icon: createElement(Timer) },
            { href: '/admin/hrd/monitoring/dinas', label: 'Dinas (Tracking)', icon: createElement(MapPin) },
            { href: '/admin/hrd/monitoring/cuti', label: 'Cuti', icon: createElement(CalendarOff) },
            { href: '/admin/hrd/monitoring/izin', label: 'Izin', icon: createElement(FileHeart) },
            { href: '/admin/hrd/monitoring/pelatihan', label: 'Pengembangan SDM', icon: createElement(GraduationCap) },
            { href: '/admin/hrd/monitoring/settings', label: 'Pengaturan Absensi', icon: createElement(Settings) },
        ]
    }
];


export const MENU_CONFIG: Record<string, MenuGroup[]> = {
  'super-admin': [
    ...RECRUITMENT_MENU_ITEMS,
    ...EMPLOYEE_MONITORING_ITEMS,
    {
        title: "Administrasi",
        items: [
            { href: '/admin/super-admin/user-management', label: 'User Management', icon: createElement(Users) },
            { href: '/admin/super-admin/departments-brands', label: 'Master Data', icon: createElement(Database) },
            { href: '/admin/super-admin/menu-settings', label: 'Access & Roles', icon: createElement(ShieldCheck) },
        ]
    },
    {
        title: "Personal",
        items: [
            { href: '/admin/interviews', label: 'My Interviews', icon: createElement(Video) },
        ]
    }
  ],
  'hrd': [
    ...RECRUITMENT_MENU_ITEMS,
    ...EMPLOYEE_MONITORING_ITEMS,
    {
        title: "Personal",
        items: [
            { href: '/admin/interviews', label: 'My Interviews', icon: createElement(Video) }
        ]
    }
  ],
  'manager': [
    {
        items: [
            { href: '/admin/manager', label: 'My Team', icon: createElement(Users) },
            { href: '/admin/interviews', label: 'My Interviews', icon: createElement(Video) },
            { href: '/admin/manager/reports', label: 'Reports', icon: createElement(BarChart) },
            { href: '/admin/manager/approvals', label: 'Approvals', icon: createElement(CheckSquare), badge: 3 },
        ]
    }
  ],
  'karyawan': [
    {
        items: [
            { href: '/admin/karyawan', label: 'My Profile', icon: createElement(User) },
            { href: '/admin/interviews', label: 'My Interviews', icon: createElement(Video) },
            { href: '/admin/karyawan/documents', label: 'My Documents', icon: createElement(FileText) },
            { href: '/admin/karyawan/leave', label: 'My Leave', icon: createElement(Calendar) },
            { href: '/admin/karyawan/payslips', label: 'My Payslips', icon: createElement(DollarSign) },
        ]
    }
  ],
  'kandidat': [
    {
      title: "Karir",
      items: [
        { href: '/careers/portal', label: 'Dashboard', icon: createElement(LayoutDashboard) },
        { href: '/careers/portal/jobs', label: 'Daftar Lowongan', icon: createElement(Briefcase) },
        { href: '/careers/portal/applications', label: 'Lamaran Saya', icon: createElement(FileText) },
      ]
    },
    {
      title: "Proses Seleksi",
      items: [
        { href: '/careers/portal/profile', label: 'Profil Pelamar', icon: createElement(User) },
        { href: '/careers/portal/assessment/personality', label: 'Tes Kepribadian', icon: createElement(BrainCircuit) },
        { href: '/careers/portal/documents', label: 'Pengumpulan Dokumen', icon: createElement(FileUp) },
        { href: '/careers/portal/interviews', label: 'Jadwal Wawancara', icon: createElement(Calendar) },
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
