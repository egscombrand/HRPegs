'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { MENU_CONFIG } from '@/lib/menu-config';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { UserProfile, Brand } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from '@/components/ui/badge';
import { Edit, Search } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { EmployeeAdminFormDialog } from '@/components/dashboard/hrd/EmployeeAdminFormDialog';

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

const stageLabels: Record<string, string> = {
    probation: 'Masa Percobaan',
    active: 'Karyawan Aktif',
};

export default function KaryawanDataPage() {
    const { userProfile } = useAuth();
    const hasAccess = useRoleGuard(['hrd', 'super-admin']);
    const firestore = useFirestore();
    
    const [activeTab, setActiveTab] = useState('active');
    const [brandFilter, setBrandFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

    const menuConfig = useMemo(() => {
        if (!userProfile) return [];
        return MENU_CONFIG[userProfile.role] || [];
    }, [userProfile]);

    const { data: users, isLoading: usersLoading, mutate } = useCollection<UserProfile>(
        useMemoFirebase(() => query(collection(firestore, 'users'), where('employmentType', '==', 'karyawan')), [firestore])
    );
    
    const { data: brands, isLoading: brandsLoading } = useCollection<Brand>(
        useMemoFirebase(() => collection(firestore, 'brands'), [firestore])
    );

    const brandMap = useMemo(() => {
        if (!brands) return new Map<string, string>();
        return new Map(brands.map(b => [b.id!, b.name]));
    }, [brands]);

    const filteredUsers = useMemo(() => {
        if (!users) return [];
        return users.filter(user => {
            const userStage = user.employmentStage || 'active';
            const brandMatch = brandFilter === 'all' || (Array.isArray(user.brandId) ? user.brandId.includes(brandFilter) : user.brandId === brandFilter);
            const searchMatch = searchTerm === '' || user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || user.email.toLowerCase().includes(searchTerm.toLowerCase());
            return userStage === activeTab && brandMatch && searchMatch;
        });
    }, [users, activeTab, brandFilter, searchTerm]);

    const handleEditClick = (user: UserProfile) => {
        setSelectedUser(user);
    }
    
    const handleFormSuccess = () => {
      setSelectedUser(null);
      mutate();
    }

    if (!hasAccess) {
        return <DashboardLayout pageTitle="Data Diri Karyawan" menuConfig={menuConfig}><EmployeeTableSkeleton/></DashboardLayout>;
    }

    return (
        <>
            <DashboardLayout pageTitle="Data Karyawan" menuConfig={menuConfig}>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <div className="flex justify-between items-center mb-4">
                        <TabsList>
                            <TabsTrigger value="active">Karyawan Aktif</TabsTrigger>
                            <TabsTrigger value="probation">Masa Percobaan</TabsTrigger>
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

                    <div className="rounded-lg border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nama</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Brand</TableHead>
                                    <TableHead>Jabatan</TableHead>
                                    <TableHead className="text-right">Aksi</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {usersLoading ? (
                                    <TableRow><TableCell colSpan={5} className="h-24 text-center">Memuat data...</TableCell></TableRow>
                                ) : filteredUsers.length > 0 ? (
                                    filteredUsers.map(user => (
                                        <TableRow key={user.uid}>
                                            <TableCell className="font-medium">{user.fullName}</TableCell>
                                            <TableCell>{user.email}</TableCell>
                                            <TableCell>{Array.isArray(user.brandId) ? user.brandId.map(id => brandMap.get(id)).join(', ') : brandMap.get(user.brandId as string) || '-'}</TableCell>
                                            <TableCell>{user.positionTitle || '-'}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="sm" onClick={() => handleEditClick(user)}>
                                                    <Edit className="mr-2 h-4 w-4" /> Edit
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={5} className="h-24 text-center">Tidak ada data untuk filter ini.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </Tabs>
            </DashboardLayout>
            {selectedUser && (
                <EmployeeAdminFormDialog
                    user={selectedUser}
                    open={!!selectedUser}
                    onOpenChange={(open) => !open && setSelectedUser(null)}
                    onSuccess={handleFormSuccess}
                />
            )}
        </>
    );
}

    