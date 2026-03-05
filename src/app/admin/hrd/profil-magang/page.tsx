
'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { MENU_CONFIG } from '@/lib/menu-config';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { EmployeeProfile } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Eye, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { InternProfileDetailDialog } from '@/components/dashboard/hrd/InternProfileDetailDialog';

function InternProfilesSkeleton() {
    return (
        <div className="space-y-4">
            <div className="flex justify-between">
                <Skeleton className="h-10 w-64" />
            </div>
            <Skeleton className="h-96 w-full" />
        </div>
    )
}

export default function ProfilMagangPage() {
  const { userProfile } = useAuth();
  const hasAccess = useRoleGuard(['hrd', 'super-admin']);
  const firestore = useFirestore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<EmployeeProfile | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const menuConfig = useMemo(() => {
    if (userProfile?.role === 'super-admin') return MENU_CONFIG['super-admin'];
    if (userProfile?.role === 'hrd') return MENU_CONFIG['hrd'];
    return [];
  }, [userProfile]);
  
  const profilesQuery = useMemoFirebase(
    () => {
        if (!hasAccess) return null; // Don't create query until access is confirmed
        return query(collection(firestore, 'employee_profiles'), where('employmentType', '==', 'magang'));
    },
    [firestore, hasAccess] // Re-create query when hasAccess changes
  );
  
  const { data: profiles, isLoading } = useCollection<EmployeeProfile>(profilesQuery);
  
  const filteredProfiles = useMemo(() => {
    if (!profiles) return [];
    const lowercasedSearch = searchTerm.toLowerCase();
    return profiles.filter(p => 
        p.fullName.toLowerCase().includes(lowercasedSearch) ||
        p.phone.includes(lowercasedSearch)
    ).sort((a, b) => (b.updatedAt?.toMillis() || 0) - (a.updatedAt?.toMillis() || 0));
  }, [profiles, searchTerm]);

  const handleViewDetails = (profile: EmployeeProfile) => {
    setSelectedProfile(profile);
    setIsDetailOpen(true);
  };

  if (!hasAccess) {
    return <DashboardLayout pageTitle="Profil Magang" menuConfig={menuConfig}><InternProfilesSkeleton /></DashboardLayout>;
  }

  return (
    <DashboardLayout pageTitle="Profil Magang" menuConfig={menuConfig}>
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Cari nama atau telepon..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full sm:w-[300px] pl-8"
                    />
                </div>
            </div>
            
            {isLoading ? <InternProfilesSkeleton /> : (
                <div className="rounded-lg border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nama Lengkap</TableHead>
                                <TableHead>Sub-tipe</TableHead>
                                <TableHead>Sekolah/Kampus</TableHead>
                                <TableHead>Telepon</TableHead>
                                <TableHead>Status Profil</TableHead>
                                <TableHead>Update Terakhir</TableHead>
                                <TableHead className="text-right">Aksi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredProfiles.length > 0 ? filteredProfiles.map(profile => (
                                <TableRow key={profile.id}>
                                    <TableCell className="font-medium">{profile.fullName}</TableCell>
                                    <TableCell className="capitalize">{profile.internSubtype}</TableCell>
                                    <TableCell>{profile.schoolOrCampus}</TableCell>
                                    <TableCell>{profile.phone}</TableCell>
                                    <TableCell>
                                        <Badge variant={profile.completeness?.isComplete ? 'default' : 'secondary'}>
                                            {profile.completeness?.isComplete ? 'Lengkap' : 'Draf'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        {profile.updatedAt ? format(profile.updatedAt.toDate(), 'dd MMM yyyy, HH:mm') : '-'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="sm" onClick={() => handleViewDetails(profile)}>
                                            <Eye className="mr-2 h-4 w-4" /> Detail
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center">
                                        Tidak ada profil magang yang ditemukan.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
        
        {selectedProfile && (
            <InternProfileDetailDialog 
                profile={selectedProfile}
                open={isDetailOpen}
                onOpenChange={setIsDetailOpen}
            />
        )}
    </DashboardLayout>
  );
}
