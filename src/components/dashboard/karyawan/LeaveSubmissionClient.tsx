'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase, deleteDocumentNonBlocking, useDoc } from '@/firebase';
import { collection, query, where, doc } from 'firebase/firestore';
import type { PermissionRequest, EmployeeProfile, Brand } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, PlusCircle, MoreHorizontal, Eye, Edit, Trash2, CalendarOff } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { PermissionRequestForm } from './PermissionRequestForm'; 
import { PermissionStatusBadge } from './PermissionStatusBadge';
import { DeleteConfirmationDialog } from '../DeleteConfirmationDialog';
import { useToast } from '@/hooks/use-toast';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export function LeaveSubmissionClient() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PermissionRequest | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Filter specifically for 'cuti' type for this client
  const submissionsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(
        collection(firestore, 'permission_requests'), 
        where('uid', '==', userProfile.uid),
        where('type', '==', 'cuti')
    );
  }, [userProfile?.uid, firestore]);
  
  const { data: submissions, isLoading, mutate } = useCollection<PermissionRequest>(submissionsQuery);

  const { data: employeeProfile, isLoading: isLoadingProfile } = useDoc<EmployeeProfile>(
    useMemoFirebase(() => (userProfile ? doc(firestore, 'employee_profiles', userProfile.uid) : null), [userProfile, firestore])
  );
  
  const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, 'brands'), [firestore])
  );

  const sortedSubmissions = useMemo(() => {
    if (!submissions) return [];
    return [...submissions].sort((a,b) => (b.createdAt?.toMillis() || Date.now()) - (a.createdAt?.toMillis() || Date.now()));
  }, [submissions]);

  const handleCreate = () => {
    setSelectedRequest(null);
    setIsFormOpen(true);
  };
  
  const handleAction = (action: 'view' | 'edit', request: PermissionRequest) => {
    setSelectedRequest(request);
    setIsFormOpen(true);
  };

  const handleCancel = (request: PermissionRequest) => {
    setSelectedRequest(request);
    setIsDeleteDialogOpen(true);
  };

  const confirmCancel = async () => {
    if (!selectedRequest) return;
    try {
        await deleteDocumentNonBlocking(doc(firestore, 'permission_requests', selectedRequest.id!));
        toast({ title: "Pengajuan Cuti Dibatalkan" });
        mutate();
    } catch(e: any) {
        toast({ variant: 'destructive', title: "Gagal Membatalkan", description: e.message });
    } finally {
        setIsDeleteDialogOpen(false);
    }
  };

  if (isLoading || isLoadingProfile || isLoadingBrands) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }
  
  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
               <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl">
                  <CalendarOff className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Manajemen Cuti Tahunan</h1>
                <p className="text-muted-foreground">Kelola rencana cuti tahunan Anda dengan mudah.</p>
              </div>
          </div>
          <Button onClick={handleCreate} className="bg-indigo-600 hover:bg-indigo-700">
            <PlusCircle className="mr-2 h-4 w-4"/> Buat Pengajuan Cuti
          </Button>
        </div>

        <Card className="border-indigo-100 dark:border-indigo-900/30 shadow-md">
            <CardHeader className="border-b pb-4 bg-slate-50/50 dark:bg-slate-900/50">
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-slate-500">Riwayat Pengajuan Cuti</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="pl-6">Periode Cuti</TableHead>
                                <TableHead>Durasi</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Diajukan Pada</TableHead>
                                <TableHead className="text-right pr-6">Aksi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedSubmissions.length > 0 ? sortedSubmissions.map(s => (
                                <TableRow key={s.id} className="hover:bg-indigo-50/10 transition-colors">
                                    <TableCell className="font-medium pl-6">
                                        {format(s.startDate.toDate(), 'dd MMM yyyy', { locale: idLocale })} - {format(s.endDate.toDate(), 'dd MMM yyyy', { locale: idLocale })}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold">{Math.ceil(s.totalDurationMinutes / 1440)} Hari</span>
                                            <span className="text-[10px] text-muted-foreground text-nowrap">({s.totalDurationMinutes} menit)</span>
                                        </div>
                                    </TableCell>
                                    <TableCell><PermissionStatusBadge status={s.status} /></TableCell>
                                    <TableCell className="text-xs text-muted-foreground italic">
                                        {s.createdAt?.toDate ? format(s.createdAt.toDate(), 'dd MMM yyyy HH:mm', { locale: idLocale }) : '-'}
                                    </TableCell>
                                    <TableCell className="text-right pr-6">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onSelect={() => handleAction('view', s)}><Eye className="mr-2 h-4 w-4"/> Lihat Detail</DropdownMenuItem>
                                                {(s.status === 'draft' || s.status.startsWith('revision')) && <DropdownMenuItem onSelect={() => handleAction('edit', s)}><Edit className="mr-2 h-4 w-4"/> Edit</DropdownMenuItem>}
                                                {s.status === 'draft' && <DropdownMenuItem onSelect={() => handleCancel(s)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4"/> Batalkan</DropdownMenuItem>}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-40 text-center">
                                        <div className="flex flex-col items-center justify-center text-slate-400">
                                            <CalendarOff className="h-8 w-8 mb-2 opacity-20" />
                                            <p className="text-sm">Belum ada pengajuan cuti.</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
      </div>

      <PermissionRequestForm 
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        submission={selectedRequest}
        employeeProfile={employeeProfile}
        brands={brands || []}
        onSuccess={mutate}
        defaultType="cuti"
      />
      
      <DeleteConfirmationDialog 
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={confirmCancel}
        itemName="pengajuan cuti ini"
        itemType=""
      />
    </>
  );
}
