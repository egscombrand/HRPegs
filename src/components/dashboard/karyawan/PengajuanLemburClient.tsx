'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, where, doc } from 'firebase/firestore';
import type { OvertimeSubmission } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, PlusCircle, MoreHorizontal, Eye, Edit, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { OvertimeSubmissionForm } from './OvertimeSubmissionForm';
import { DeleteConfirmationDialog } from '../DeleteConfirmationDialog';
import { useToast } from '@/hooks/use-toast';
import { KpiCard } from '@/components/recruitment/KpiCard';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const statusDisplay: Record<OvertimeSubmission['status'], { label: string; className: string }> = {
    draft: { label: 'Draf', className: 'bg-gray-100 text-gray-800' },
    pending_manager: { label: 'Menunggu Manager', className: 'bg-yellow-100 text-yellow-800' },
    rejected_manager: { label: 'Ditolak Manager', className: 'bg-red-100 text-red-800' },
    revision_manager: { label: 'Revisi dari Manager', className: 'bg-amber-100 text-amber-800' },
    pending_hrd: { label: 'Menunggu HRD', className: 'bg-blue-100 text-blue-800' },
    rejected_hrd: { label: 'Ditolak HRD', className: 'bg-red-100 text-red-800' },
    revision_hrd: { label: 'Revisi dari HRD', className: 'bg-amber-100 text-amber-800' },
    approved: { label: 'Disetujui', className: 'bg-green-100 text-green-800' },
};


export function PengajuanLemburClient() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<OvertimeSubmission | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const submissionsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(collection(firestore, 'overtime_submissions'), where('uid', '==', userProfile.uid));
  }, [userProfile?.uid, firestore]);
  
  const { data: submissions, isLoading, mutate } = useCollection<OvertimeSubmission>(submissionsQuery);

  const summary = useMemo(() => {
    const kpis = { total: 0, pending: 0, approved: 0, rejected: 0 };
    if (!submissions) return kpis;
    kpis.total = submissions.length;
    submissions.forEach(s => {
        if (s.status.startsWith('pending')) kpis.pending++;
        else if (s.status === 'approved') kpis.approved++;
        else if (s.status.startsWith('rejected')) kpis.rejected++;
    });
    return kpis;
  }, [submissions]);
  
  const sortedSubmissions = useMemo(() => {
    if (!submissions) return [];
    return [...submissions].sort((a,b) => b.createdAt.toMillis() - a.createdAt.toMillis());
  }, [submissions]);
  
  const handleCreate = () => {
    setSelectedSubmission(null);
    setIsFormOpen(true);
  };
  
  const handleEdit = (submission: OvertimeSubmission) => {
    setSelectedSubmission(submission);
    setIsFormOpen(true);
  };

  const handleCancel = (submission: OvertimeSubmission) => {
    setSelectedSubmission(submission);
    setIsDeleteDialogOpen(true);
  };

  const confirmCancel = async () => {
    if (!selectedSubmission) return;
    try {
        await deleteDocumentNonBlocking(doc(firestore, 'overtime_submissions', selectedSubmission.id!));
        toast({ title: "Pengajuan Dibatalkan" });
        mutate();
    } catch(e: any) {
        toast({ variant: 'destructive', title: "Gagal Membatalkan", description: e.message });
    } finally {
        setIsDeleteDialogOpen(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Pengajuan Lembur</h1>
            <p className="text-muted-foreground">Buat dan lacak status pengajuan lembur Anda.</p>
          </div>
          <Button onClick={handleCreate}><PlusCircle className="mr-2 h-4 w-4"/> Buat Pengajuan</Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KpiCard title="Total Pengajuan" value={summary.total} />
            <KpiCard title="Menunggu Persetujuan" value={summary.pending} />
            <KpiCard title="Disetujui" value={summary.approved} />
            <KpiCard title="Ditolak" value={summary.rejected} deltaType="inverse" />
        </div>

        <Card>
            <CardHeader><CardTitle>Riwayat Pengajuan</CardTitle></CardHeader>
            <CardContent>
                <div className="rounded-lg border">
                <Table>
                    <TableHeader><TableRow><TableHead>Tanggal Lembur</TableHead><TableHead>Durasi</TableHead><TableHead>Tipe</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {sortedSubmissions.length > 0 ? sortedSubmissions.map(s => (
                            <TableRow key={s.id}>
                                <TableCell className="font-medium">{format(s.date.toDate(), 'eeee, dd MMM yyyy', { locale: idLocale })}</TableCell>
                                <TableCell>{s.totalDurationMinutes} menit</TableCell>
                                <TableCell className="capitalize">{s.overtimeType.replace('_', ' ')}</TableCell>
                                <TableCell><Badge className={statusDisplay[s.status]?.className}>{statusDisplay[s.status]?.label}</Badge></TableCell>
                                <TableCell className="text-right">
                                     <DropdownMenu>
                                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onSelect={() => handleEdit(s)}><Eye className="mr-2 h-4 w-4"/> Lihat Detail</DropdownMenuItem>
                                            {(s.status === 'draft' || s.status.startsWith('revisi')) && <DropdownMenuItem onSelect={() => handleEdit(s)}><Edit className="mr-2 h-4 w-4"/> Edit</DropdownMenuItem>}
                                            {s.status === 'draft' && <DropdownMenuItem onSelect={() => handleCancel(s)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4"/> Batalkan</DropdownMenuItem>}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        )) : (<TableRow><TableCell colSpan={5} className="h-24 text-center">Belum ada pengajuan lembur.</TableCell></TableRow>)}
                    </TableBody>
                </Table>
                </div>
            </CardContent>
        </Card>
      </div>

      <OvertimeSubmissionForm 
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        submission={selectedSubmission}
        onSuccess={mutate}
      />
      
      <DeleteConfirmationDialog 
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={confirmCancel}
        itemName="pengajuan lembur ini"
        itemType=""
      />
    </>
  );
}
