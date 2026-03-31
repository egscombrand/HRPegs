'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { MENU_CONFIG } from '@/lib/menu-config';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { UserProfile, Brand, EmployeeProfile, Division } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from '@/components/ui/badge';
import { Edit, Search, PlusCircle, Upload, Download, FileSpreadsheet, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { EmployeeAdminFormDialog } from '@/components/dashboard/hrd/EmployeeAdminFormDialog';
import { Card, CardContent } from '@/components/ui/card';

function EmployeeTableSkeleton() {
    return (
        <div className="space-y-4">
            <div className="flex justify-between">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-10 w-48" />
            </div>
            <Skeleton className="h-96 w-full" />
        </div>
    )
}

const statusLabels: Record<string, string> = {
    active: 'Karyawan Aktif',
    probation: 'Masa Percobaan',
    resigned: 'Resigned',
    terminated: 'Terminated',
};

export default function KaryawanDataPage() {
    const { userProfile } = useAuth();
    const hasAccess = useRoleGuard(['hrd', 'super-admin']);
    const firestore = useFirestore();
    
    const [activeTab, setActiveTab] = useState('active');
    const [brandFilter, setBrandFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUser, setSelectedUser] = useState<EmployeeProfile | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(false);

    const menuConfig = useMemo(() => {
        if (!userProfile) return [];
        return MENU_CONFIG[userProfile.role] || [];
    }, [userProfile]);

    const { data: employeeProfiles, isLoading: profilesLoading, mutate } = useCollection<EmployeeProfile>(
        useMemoFirebase(() => query(collection(firestore, 'employee_profiles'), where('employmentType', '==', 'karyawan')), [firestore])
    );
    
    const { data: brands, isLoading: brandsLoading } = useCollection<Brand>(
        useMemoFirebase(() => collection(firestore, 'brands'), [firestore])
    );

    const filteredProfiles = useMemo(() => {
        if (!employeeProfiles) return [];
        return employeeProfiles.filter(profile => {
            const profileStatus = profile.employmentStatus || 'active';
            const brandMatch = brandFilter === 'all' || profile.brandId === brandFilter;
            const searchMatch = searchTerm === '' || profile.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || (profile.email && profile.email.toLowerCase().includes(searchTerm.toLowerCase()));
            return profileStatus === activeTab && brandMatch && searchMatch;
        });
    }, [employeeProfiles, activeTab, brandFilter, searchTerm]);

    const handleCreateClick = () => {
        setSelectedUser(null);
        setIsFormOpen(true);
    };

    const handleEditClick = (profile: EmployeeProfile) => {
        setSelectedUser(profile);
        setIsFormOpen(true);
    };
    
    const handleFormSuccess = () => {
      setIsFormOpen(false);
      mutate();
    };

    if (!hasAccess) {
        return <DashboardLayout pageTitle="Data Karyawan" menuConfig={menuConfig}><EmployeeTableSkeleton/></DashboardLayout>;
    }

    return (
        <>
            <DashboardLayout pageTitle="Data Karyawan" menuConfig={menuConfig}>
                 <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-2 justify-between">
                         <p className="text-sm text-muted-foreground">
                            Kelola data administrasi karyawan perusahaan. Data di sini terpisah dari manajemen akun pengguna.
                        </p>
                        <div className="flex items-center gap-2">
                             <Button variant="outline"><Upload className="mr-2" /> Import</Button>
                             <Button variant="outline"><Download className="mr-2" /> Export</Button>
                             <Button variant="outline"><FileSpreadsheet className="mr-2" /> Template</Button>
                             <Button onClick={handleCreateClick}><PlusCircle className="mr-2" /> Tambah Manual</Button>
                        </div>
                    </div>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <div className="flex justify-between items-center mb-4">
                        <TabsList>
                            <TabsTrigger value="active">Karyawan Aktif</TabsTrigger>
                            <TabsTrigger value="probation">Masa Percobaan</TabsTrigger>
                            <TabsTrigger value="resigned">Resigned/Terminated</TabsTrigger>
                        </TabsList>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Cari nama atau email..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full sm:w-[250px] pl-8" />
                            </div>
                            <Select value={brandFilter} onValueChange={setBrandFilter} disabled={brandsLoading}>
                                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Semua Brand" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Semua Brand</SelectItem>
                                    {brands?.map(b => <SelectItem key={b.id!} value={b.id!}>{b.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <Card>
                        <CardContent className="p-0">
                             <div className="rounded-lg border-t">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Nama</TableHead>
                                            <TableHead>Brand</TableHead>
                                            <TableHead>Divisi</TableHead>
                                            <TableHead>Jabatan</TableHead>
                                            <TableHead>Atasan</TableHead>
                                            <TableHead className="text-right">Aksi</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {profilesLoading ? (
                                            <TableRow><TableCell colSpan={6} className="h-24 text-center">Memuat data karyawan...</TableCell></TableRow>
                                        ) : filteredProfiles.length > 0 ? (
                                            filteredProfiles.map(profile => (
                                                <TableRow key={profile.uid}>
                                                    <TableCell className="font-medium">{profile.fullName}</TableCell>
                                                    <TableCell>{profile.brandName || '-'}</TableCell>
                                                    <TableCell>{profile.division || '-'}</TableCell>
                                                    <TableCell>{profile.positionTitle || '-'}</TableCell>
                                                    <TableCell>{profile.managerName || '-'}</TableCell>
                                                    <TableCell className="text-right">
                                                        <Button variant="ghost" size="sm" onClick={() => handleEditClick(profile)}>
                                                            <Edit className="mr-2 h-4 w-4" /> Edit
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={6} className="h-48 text-center text-muted-foreground">
                                                    <div className="flex flex-col items-center gap-2">
                                                         <Users className="h-10 w-10" />
                                                        <p className="font-semibold">Tidak ada data untuk filter ini.</p>
                                                        <p className="text-xs">Coba ubah filter Anda, impor data baru, atau tambah karyawan secara manual.</p>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </Tabs>
                </div>
            </DashboardLayout>
            <EmployeeAdminFormDialog
                profile={selectedUser}
                open={isFormOpen}
                onOpenChange={setIsFormOpen}
                onSuccess={handleFormSuccess}
            />
        </>
    );
}
