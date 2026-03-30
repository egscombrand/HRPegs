'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { PermissionRequest, UserProfile, Brand } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { format, formatDistanceToNow, startOfMonth } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { KpiCard } from '@/components/recruitment/KpiCard';
import { PERMISSION_REQUEST_STATUSES, isFinalStatus } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { PermissionStatusBadge } from '@/components/dashboard/karyawan/PermissionStatusBadge';
import { ReviewPermissionDialog } from './ReviewPermissionDialog';

interface PermissionApprovalClientProps {
  mode: 'manager' | 'hrd';
}

export function PermissionApprovalClient({ mode }: PermissionApprovalClientProps) {
    const { userProfile } = useAuth();
    const firestore = useFirestore();

    const [statusFilter, setStatusFilter] = useState<PermissionRequest['status'] | 'all' | 'pending'>(mode === 'manager' ? 'pending' : 'pending_hrd');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSubmission, setSelectedSubmission] = useState<PermissionRequest | null>(null);

    const submissionsQuery = useMemoFirebase(() => {
        if (!userProfile) return null;
        let q = query(collection(firestore, 'permission_requests'));

        if (mode === 'manager' && userProfile.isDivisionManager) {
            return query(q, where('division', '==', userProfile.managedDivision), where('brandId', '==', userProfile.managedBrandId));
        } else if (mode === 'hrd') {
            return q;
        }
        
        return query(collection(firestore, 'permission_requests'), where('uid', '==', 'NO_RESULTS'));
    }, [userProfile, firestore, mode]);

    const { data: submissions, isLoading, mutate } = useCollection<PermissionRequest>(submissionsQuery);
    
    const filteredSubmissions = useMemo(() => {
        if (!submissions) return [];
        return submissions.filter(s => {
            let statusMatch = true;
            if (statusFilter !== 'all') {
                if (statusFilter === 'pending') {
                    if (mode === 'manager') {
                        statusMatch = s.status === 'pending_manager' || s.status === 'reported' || s.status === 'returned';
                    } else {
                        statusMatch = s.status === 'pending_hrd' || s.status === 'approved_by_manager';
                    }
                } else if (mode === 'hrd' && statusFilter === 'pending_hrd') {
                    statusMatch = s.status === 'pending_hrd' || s.status === 'approved_by_manager';
                } else {
                    statusMatch = s.status === statusFilter;
                }
            }
            if (!statusMatch) return false;

            if (searchTerm && !s.fullName.toLowerCase().includes(searchTerm.toLowerCase())) return false;
            return true;
        }).sort((a,b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    }, [submissions, statusFilter, searchTerm, mode]);

    const kpis = useMemo(() => {
      if (!submissions) return { pending: 0, revision: 0, approved: 0, rejected: 0 };
      const now = new Date();
      const monthStart = startOfMonth(now);
      const isManagerView = mode === 'manager';

      return submissions.reduce((acc, s) => {
        const isOfficeExit = s.type === 'keluar_kantor';
        
        // Pending logic
        if (isManagerView) {
            if (isOfficeExit) {
                if (s.status === 'reported' || s.status === 'returned') acc.pending++;
            } else {
                if (s.status === 'pending_manager') acc.pending++;
            }
        } else {
            if (!isOfficeExit && (s.status === 'pending_hrd' || s.status === 'approved_by_manager')) acc.pending++;
        }
        
        // Revision logic
        if (isManagerView && s.status === 'revision_manager') acc.revision++;
        if (!isManagerView && s.status === 'revision_hrd') acc.revision++;

        const decisionDate = isManagerView ? s.managerDecisionAt?.toDate() : s.hrdDecisionAt?.toDate();
        if (decisionDate && decisionDate >= monthStart) {
          if (isManagerView) {
              if (s.status === 'approved_by_manager' || s.status === 'verified_manager') acc.approved++;
              if (s.status === 'rejected_manager') acc.rejected++;
          } else {
              if (s.status === 'approved') acc.approved++;
              if (s.status === 'rejected_hrd') acc.rejected++;
          }
        }
        return acc;
      }, { pending: 0, revision: 0, approved: 0, rejected: 0 });
    }, [submissions, mode]);

    return (
        <div className="space-y-6">
             <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <KpiCard title="Menunggu Persetujuan" value={kpis.pending} />
                <KpiCard title="Perlu Revisi" value={kpis.revision} deltaType="inverse" />
                <KpiCard title="Disetujui Bulan Ini" value={kpis.approved} />
                <KpiCard title="Ditolak Bulan Ini" value={kpis.rejected} deltaType="inverse" />
            </div>

            <Card>
                <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <CardTitle>Antrian Persetujuan Izin</CardTitle>
                            <CardDescription>Tinjau pengajuan izin dari tim Anda.</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                           <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val as any)}>
                                <SelectTrigger className="w-full sm:w-[220px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Semua Status</SelectItem>
                                    <SelectItem value="pending" className="font-bold">Butuh Tindakan</SelectItem>
                                    {PERMISSION_REQUEST_STATUSES.map(s => (
                                        <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <div className="relative flex-grow min-w-[200px]"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Cari nama..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8" /></div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                     <div className="rounded-lg border">
                        <Table>
                            <TableHeader><TableRow><TableHead>Pengaju</TableHead><TableHead>Jenis Izin</TableHead><TableHead>Tanggal</TableHead><TableHead>Diajukan</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {isLoading ? <TableRow><TableCell colSpan={6} className="h-24 text-center">Loading...</TableCell></TableRow>
                                : filteredSubmissions.length > 0 ? filteredSubmissions.map(s => (
                                    <TableRow key={s.id}>
                                        <TableCell>
                                            <div className="font-medium">{s.fullName}</div>
                                            <div className="text-xs text-muted-foreground">{s.positionTitle}</div>
                                        </TableCell>
                                        <TableCell className="capitalize">{s.type.replace(/_/g, ' ')}</TableCell>
                                        <TableCell>{format(s.startDate.toDate(), 'dd MMM yyyy', { locale: idLocale })}</TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{formatDistanceToNow(s.createdAt.toDate(), { addSuffix: true, locale: idLocale })}</TableCell>
                                        <TableCell><PermissionStatusBadge status={s.status} /></TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="outline" size="sm" onClick={() => setSelectedSubmission(s)}>
                                                {isFinalStatus(s.status) ? 'Detail' : 'Review'}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                )) : <TableRow><TableCell colSpan={6} className="h-24 text-center">Tidak ada pengajuan yang ditemukan.</TableCell></TableRow>}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {selectedSubmission && (
                <ReviewPermissionDialog
                    open={!!selectedSubmission}
                    onOpenChange={(open) => !open && setSelectedSubmission(null)}
                    submission={selectedSubmission}
                    onSuccess={mutate}
                    mode={mode}
                />
            )}
        </div>
    );
}