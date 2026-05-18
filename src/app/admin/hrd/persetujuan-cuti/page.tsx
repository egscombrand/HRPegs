'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase, setDocumentNonBlocking, useDoc } from '@/firebase';
import { collection, query, where, doc, getDocs, serverTimestamp, writeBatch, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/providers/auth-provider';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, CalendarOff, AlertTriangle, Eye, CheckCircle2, XCircle, Settings, Send, User, Award, ShieldAlert, FileClock } from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { sendLeaveNotification } from '@/lib/leave-notifications';
import { type LeaveRequest, type LeaveBalance, type LeaveBalanceAdjustment } from '@/lib/types';

export default function HrdLeaveApprovalPage() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [selectedBalance, setSelectedBalance] = useState<LeaveBalance | null>(null);
  
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isActionOpen, setIsActionOpen] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'revise' | null>(null);
  const [notes, setNotes] = useState('');
  
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);
  const [adjustmentValue, setAdjustmentValue] = useState<number>(0);
  const [adjustmentReason, setAdjustmentReason] = useState('');

  const [isSaving, setIsSaving] = useState(false);

  const handleViewDetails = (req: LeaveRequest) => {
    setSelectedRequest(req);
    setIsDetailOpen(true);
  };

  // 1. Fetch all leave requests
  const requestsQuery = useMemoFirebase(() => {
    return query(collection(firestore, 'leave_requests'));
  }, [firestore]);
  const { data: requests, isLoading: isLoadingRequests, mutate: mutateRequests } = useCollection<LeaveRequest>(requestsQuery);

  const activeRequests = useMemo(() => {
    if (!requests) return [];
    return requests.filter(r => r.status === 'pending_hrd' || r.status === 'pending_hrd_review');
  }, [requests]);

  const historyRequests = useMemo(() => {
    if (!requests) return [];
    return requests.filter(r => 
      r.status !== 'pending_hrd' && 
      r.status !== 'pending_hrd_review' && 
      r.status !== 'pending_manager' && 
      r.status !== 'pending_manager_review'
    ).sort((a, b) => {
      const aTime = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
      const bTime = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
      return bTime - aTime;
    });
  }, [requests]);

  // 2. Fetch all leave balances
  const balancesQuery = useMemoFirebase(() => {
    return query(collection(firestore, 'leave_balances'));
  }, [firestore]);
  const { data: balances, isLoading: isLoadingBalances, mutate: mutateBalances } = useCollection<LeaveBalance>(balancesQuery);

  // 3. Fetch adjustments
  const adjustmentsQuery = useMemoFirebase(() => {
    return query(collection(firestore, 'leave_balance_adjustments'));
  }, [firestore]);
  const { data: adjustments, isLoading: isLoadingAdjustments, mutate: mutateAdjustments } = useCollection<LeaveBalanceAdjustment>(adjustmentsQuery);

  const sortedAdjustments = useMemo(() => {
    if (!adjustments) return [];
    return [...adjustments].sort((a, b) => {
      const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return bTime - aTime;
    });
  }, [adjustments]);

  const handleOpenAction = (type: 'approve' | 'reject' | 'revise', req: LeaveRequest) => {
    setSelectedRequest(req);
    setActionType(type);
    setNotes('');
    setIsActionOpen(true);
  };

  const handleConfirmAction = async () => {
    if (!selectedRequest || !actionType || !userProfile || !firestore) return;

    if ((actionType === 'reject' || actionType === 'revise') && notes.trim().length < 5) {
      toast({
        variant: 'destructive',
        title: "Keterangan Wajib Diisi",
        description: "Harap masukkan keterangan/alasan minimal 5 karakter."
      });
      return;
    }

    setIsSaving(true);
    try {
      const reqRef = doc(firestore, 'leave_requests', selectedRequest.id!);
      const batch = writeBatch(firestore);

      let newStatus: LeaveRequest['status'] = 'approved';
      let notificationType: any = "hrd_approval";

      if (actionType === 'reject') {
        newStatus = 'rejected_by_hrd';
        notificationType = "hrd_rejection";
      } else if (actionType === 'revise') {
        newStatus = 'revision_requested_by_hrd';
        notificationType = "hrd_revision";
      }

      batch.update(reqRef, {
        status: newStatus,
        hrdId: userProfile.uid,
        hrdName: userProfile.fullName,
        hrdNotes: notes,
        hrdReviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Update employee leave balance document atomically
      const balanceRef = doc(firestore, 'leave_balances', selectedRequest.employeeId);
      const snapshot = await getDocs(query(collection(firestore, 'leave_balances'), where('employeeId', '==', selectedRequest.employeeId)));

      if (!snapshot.empty) {
        const balData = snapshot.docs[0].data() as LeaveBalance;
        
        if (actionType === 'approve') {
          // decrement pendingLeave, decrement currentBalance, increment allocatedLeave
          batch.update(balanceRef, {
            pendingLeave: Math.max(0, balData.pendingLeave - selectedRequest.durationDays),
            currentBalance: Math.max(0, balData.currentBalance - selectedRequest.durationDays),
            allocatedLeave: balData.allocatedLeave + selectedRequest.durationDays,
            updatedAt: serverTimestamp()
          });
        } else {
          // Rejection / revision requests free the pendingLeave quota
          batch.update(balanceRef, {
            pendingLeave: Math.max(0, balData.pendingLeave - selectedRequest.durationDays),
            updatedAt: serverTimestamp()
          });
        }
      }

      await batch.commit();

      // Trigger custom leaf notification
      await sendLeaveNotification(firestore, notificationType, {
        employeeId: selectedRequest.employeeId,
        employeeName: selectedRequest.employeeName,
        managerId: selectedRequest.managerId,
        managerName: selectedRequest.managerName,
        startDate: selectedRequest.startDate,
        endDate: selectedRequest.endDate,
        notes: actionType === 'revise' ? notes : undefined,
        reason: actionType === 'reject' ? notes : undefined,
        requestId: selectedRequest.id!
      });

      toast({
        title: actionType === 'approve' ? "Cuti Disetujui" : (actionType === 'reject' ? "Cuti Ditolak" : "Revisi Dikirim"),
        description: `Pengajuan cuti ${selectedRequest.employeeName} berhasil diproses.`
      });

      setIsActionOpen(false);
      setIsDetailOpen(false);
      mutateRequests();
      mutateBalances();
    } catch (e: any) {
      toast({ variant: 'destructive', title: "Gagal Memproses Cuti", description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  // Balance manual adjustment workflow
  const handleOpenAdjustment = (bal: LeaveBalance) => {
    setSelectedBalance(bal);
    setAdjustmentValue(0);
    setAdjustmentReason('');
    setIsAdjustmentOpen(true);
  };

  const handleConfirmAdjustment = async () => {
    if (!selectedBalance || !userProfile || !firestore) return;

    if (adjustmentValue === 0) {
      toast({ variant: 'destructive', title: "Validasi Gagal", description: "Nilai penyesuaian tidak boleh nol." });
      return;
    }

    if (adjustmentReason.trim().length < 5) {
      toast({ variant: 'destructive', title: "Validasi Gagal", description: "Alasan penyesuaian wajib diisi (minimal 5 karakter)." });
      return;
    }

    setIsSaving(true);
    try {
      const balanceRef = doc(firestore, 'leave_balances', selectedBalance.employeeId);
      const prevBalVal = selectedBalance.currentBalance;
      const newBalVal = prevBalVal + adjustmentValue;

      if (newBalVal < 0) {
        toast({ variant: 'destructive', title: "Validasi Gagal", description: "Saldo akhir tidak boleh kurang dari 0." });
        setIsSaving(false);
        return;
      }

      const batch = writeBatch(firestore);

      // Update currentBalance and initialQuota
      batch.update(balanceRef, {
        currentBalance: newBalVal,
        initialQuota: selectedBalance.initialQuota + (adjustmentValue > 0 ? adjustmentValue : 0),
        updatedAt: serverTimestamp()
      });

      // Write adjustment history log
      const adjRef = doc(collection(firestore, 'leave_balance_adjustments'));
      batch.set(adjRef, {
        employeeId: selectedBalance.employeeId,
        employeeName: selectedBalance.employeeName,
        previousBalance: prevBalVal,
        newBalance: newBalVal,
        adjustmentValue: adjustmentValue,
        reason: adjustmentReason,
        adjustedBy: userProfile.uid,
        adjustedByName: userProfile.fullName,
        createdAt: serverTimestamp()
      });

      await batch.commit();

      // Trigger standard status update notification to the employee
      const notificationRef = doc(collection(firestore, "users", selectedBalance.employeeId, "notifications"));
      await setDocumentNonBlocking(notificationRef, {
        userId: selectedBalance.employeeId,
        type: "bank_change_request", // uses safe supported enum
        module: "employee",
        title: "Penyesuaian Saldo Cuti",
        message: `Saldo cuti tahunan Anda telah disesuaikan oleh HRD menjadi ${newBalVal} Hari. Keterangan: ${adjustmentReason}`,
        targetType: "user",
        targetId: selectedBalance.employeeId,
        actionUrl: "/admin/karyawan/pengajuan-cuti",
        createdBy: userProfile.uid,
        isRead: false,
        createdAt: serverTimestamp()
      }, { merge: true });

      toast({ title: "Saldo Berhasil Disesuaikan", description: `Saldo cuti ${selectedBalance.employeeName} kini bernilai ${newBalVal} hari.` });
      setIsAdjustmentOpen(false);
      mutateBalances();
      mutateAdjustments();
    } catch (e: any) {
      toast({ variant: 'destructive', title: "Gagal Menyesuaikan Saldo", description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600';
      case 'active_leave': return 'bg-blue-500/10 border-blue-500/20 text-blue-600';
      case 'completed': return 'bg-slate-500/10 border-slate-500/20 text-slate-600';
      case 'cancelled': return 'bg-gray-500/10 border-gray-500/20 text-gray-500';
      case 'rejected_by_manager':
      case 'rejected_by_hrd': return 'bg-red-500/10 border-red-500/20 text-red-600';
      case 'revision_requested':
      case 'revision_requested_by_manager':
      case 'revision_requested_by_hrd': return 'bg-amber-500/10 border-amber-500/20 text-amber-600';
      case 'pending_manager':
      case 'pending_manager_review':
      case 'pending_hrd':
      case 'pending_hrd_review':
      default: return 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending_manager':
      case 'pending_manager_review': return 'Menunggu Persetujuan Atasan';
      case 'revision_requested':
      case 'revision_requested_by_manager': return 'Perlu Revisi (Atasan)';
      case 'rejected_by_manager': return 'Ditolak Atasan';
      case 'pending_hrd':
      case 'pending_hrd_review': return 'Menunggu Verifikasi HRD';
      case 'revision_requested_by_hrd': return 'Perlu Revisi (HRD)';
      case 'rejected_by_hrd': return 'Ditolak HRD';
      case 'approved': return 'Disetujui HRD';
      case 'active_leave': return 'Cuti Aktif';
      case 'completed': return 'Cuti Selesai';
      case 'cancelled': return 'Dibatalkan';
      default: return status;
    }
  };

  if (isLoadingRequests || isLoadingBalances || isLoadingAdjustments) {
    return (
      <DashboardLayout pageTitle="Persetujuan Cuti HRD">
        <div className="flex flex-col justify-center items-center h-64 gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
          <p className="text-sm font-medium text-slate-400">Memuat data cuti HRP...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageTitle="Persetujuan Cuti HRD">
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-900/30">
            <CalendarOff className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">Workspace Penggajian & Cuti Karyawan</h1>
            <p className="text-xs text-muted-foreground font-medium">POV HRD: Finalisasi persetujuan cuti dan penyesuaian kuota/saldo secara terpusat.</p>
          </div>
        </div>

        <Tabs defaultValue="pending" className="w-full">
          <TabsList className="grid w-full grid-cols-3 rounded-xl bg-slate-100 dark:bg-slate-950 p-1 mb-4 h-11">
            <TabsTrigger value="pending" className="rounded-lg font-bold text-xs">Persetujuan Cuti ({activeRequests.length})</TabsTrigger>
            <TabsTrigger value="balances" className="rounded-lg font-bold text-xs">Saldo Cuti Karyawan</TabsTrigger>
            <TabsTrigger value="adjustments" className="rounded-lg font-bold text-xs">Riwayat Penyesuaian Saldo</TabsTrigger>
          </TabsList>

          {/* Tab 1: Pending Requests */}
          <TabsContent value="pending" className="space-y-6">
            <Card className="border-slate-100 dark:border-slate-800 shadow-md">
              <CardHeader className="border-b pb-4 bg-slate-50/50 dark:bg-slate-900/50">
                <CardTitle className="text-sm font-black uppercase tracking-wider text-indigo-600">Menunggu Final Approval HRD</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-6">Karyawan</TableHead>
                        <TableHead>Periode</TableHead>
                        <TableHead>Durasi Kerja</TableHead>
                        <TableHead>Manager Reviewer</TableHead>
                        <TableHead className="text-right pr-6">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeRequests.length > 0 ? activeRequests.map(r => (
                        <TableRow key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors">
                          <TableCell className="font-semibold pl-6">
                            <div className="flex flex-col">
                              <span className="text-slate-800 dark:text-white">{r.employeeName}</span>
                              <span className="text-[10px] text-slate-400 font-bold uppercase">{r.divisionName || 'Divisi'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-slate-500 font-medium">
                            {format(r.startDate.toDate(), 'dd MMM yyyy', { locale: idLocale })} - {format(r.endDate.toDate(), 'dd MMM yyyy', { locale: idLocale })}
                          </TableCell>
                          <TableCell className="font-bold text-slate-700 dark:text-slate-200">{r.durationDays} Hari Kerja</TableCell>
                          <TableCell className="text-xs text-amber-600 font-bold">
                            Disetujui: {r.managerName}
                          </TableCell>
                          <TableCell className="text-right pr-6 space-x-2">
                            <Button variant="ghost" size="sm" onClick={() => handleViewDetails(r)} className="rounded-xl">
                              <Eye className="h-4 w-4 mr-1" /> Tinjau
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleOpenAction('approve', r)} className="rounded-xl border-emerald-500/20 text-emerald-600 hover:bg-emerald-50">
                              Setujui
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleOpenAction('reject', r)} className="rounded-xl border-red-500/20 text-red-600 hover:bg-red-50">
                              Tolak
                            </Button>
                          </TableCell>
                        </TableRow>
                      )) : (
                        <TableRow>
                          <TableCell colSpan={5} className="h-32 text-center text-slate-400">
                            <div className="flex flex-col items-center justify-center">
                              <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-2 opacity-65" />
                              <p className="text-sm font-bold">Semua pengajuan cuti berstatus pending HRD telah selesai diproses.</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* History Table */}
            <Card className="border-slate-100 dark:border-slate-800 shadow-md">
              <CardHeader className="border-b pb-4 bg-slate-50/50 dark:bg-slate-900/50">
                <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-500">Seluruh Riwayat Keputusan HRD & Manager</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-6">Karyawan</TableHead>
                        <TableHead>Periode</TableHead>
                        <TableHead>Durasi</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right pr-6">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historyRequests.length > 0 ? historyRequests.map(r => (
                        <TableRow key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors">
                          <TableCell className="font-semibold pl-6">
                            <div className="flex flex-col">
                              <span className="text-slate-800 dark:text-white">{r.employeeName}</span>
                              <span className="text-[10px] text-slate-400 font-bold uppercase">{r.divisionName || 'Divisi'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-slate-500 font-medium">
                            {format(r.startDate.toDate(), 'dd MMM yyyy', { locale: idLocale })} - {format(r.endDate.toDate(), 'dd MMM yyyy', { locale: idLocale })}
                          </TableCell>
                          <TableCell className="font-bold text-slate-700 dark:text-slate-200">{r.durationDays} Hari</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black border uppercase tracking-wider ${getStatusBadgeClass(r.status)}`}>
                              {getStatusLabel(r.status)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right pr-6">
                            <Button variant="ghost" size="sm" onClick={() => handleViewDetails(r)} className="rounded-xl">
                              <Eye className="h-4 w-4 mr-1" /> Detail
                            </Button>
                          </TableCell>
                        </TableRow>
                      )) : (
                        <TableRow>
                          <TableCell colSpan={5} className="h-24 text-center text-slate-400">
                            Belum ada riwayat finalisasi cuti.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 2: Employee Balances */}
          <TabsContent value="balances">
            <Card className="border-slate-100 dark:border-slate-800 shadow-md">
              <CardHeader className="border-b pb-4 bg-slate-50/50 dark:bg-slate-900/50">
                <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-500">Kuota & Saldo Cuti Seluruh Karyawan</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-6">Nama Karyawan</TableHead>
                        <TableHead>Tipe</TableHead>
                        <TableHead>Kuota Awal</TableHead>
                        <TableHead>Cuti Disetujui</TableHead>
                        <TableHead>Dalam Approval</TableHead>
                        <TableHead>Sisa Saldo</TableHead>
                        <TableHead className="text-right pr-6">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {balances && balances.length > 0 ? balances.map(b => (
                        <TableRow key={b.employeeId} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors">
                          <TableCell className="font-bold pl-6 text-slate-800 dark:text-white">{b.employeeName}</TableCell>
                          <TableCell className="text-xs font-black uppercase tracking-widest text-slate-400">{b.employmentType || '-'}</TableCell>
                          <TableCell className="font-semibold text-slate-500">{b.initialQuota} Hari</TableCell>
                          <TableCell className="font-semibold text-emerald-600">{b.allocatedLeave} Hari</TableCell>
                          <TableCell className="font-semibold text-amber-600">{b.pendingLeave} Hari</TableCell>
                          <TableCell className="font-black text-indigo-600 dark:text-indigo-400">{b.currentBalance} Hari</TableCell>
                          <TableCell className="text-right pr-6">
                            <Button size="sm" variant="ghost" onClick={() => handleOpenAdjustment(b)} className="rounded-xl hover:bg-indigo-50 hover:text-indigo-600">
                              <Settings className="h-4 w-4 mr-1" /> Sesuaikan Saldo
                            </Button>
                          </TableCell>
                        </TableRow>
                      )) : (
                        <TableRow>
                          <TableCell colSpan={7} className="h-24 text-center text-slate-400">
                            Belum ada kuota saldo karyawan yang terdaftar.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 3: Adjustments logs */}
          <TabsContent value="adjustments">
            <Card className="border-slate-100 dark:border-slate-800 shadow-md">
              <CardHeader className="border-b pb-4 bg-slate-50/50 dark:bg-slate-900/50">
                <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-500">Log Audit Penyesuaian Saldo Cuti</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-6">Tanggal</TableHead>
                        <TableHead>Karyawan</TableHead>
                        <TableHead>Perubahan</TableHead>
                        <TableHead>Alasan HRD</TableHead>
                        <TableHead className="text-right pr-6">Operator</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedAdjustments.length > 0 ? sortedAdjustments.map(a => (
                        <TableRow key={a.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors">
                          <TableCell className="text-sm font-medium pl-6 text-slate-500">
                            {format(a.createdAt.toDate(), 'dd MMM yyyy HH:mm', { locale: idLocale })}
                          </TableCell>
                          <TableCell className="font-bold text-slate-800 dark:text-white">{a.employeeName}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`font-black uppercase tracking-wider text-[10px] ${a.adjustmentValue > 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600' : 'bg-red-500/10 border-red-500/20 text-red-600'}`}>
                              {a.adjustmentValue > 0 ? `+${a.adjustmentValue}` : a.adjustmentValue} Hari ({a.previousBalance} → {a.newBalance})
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs font-medium text-slate-600 dark:text-slate-300 max-w-xs truncate">
                            {a.reason}
                          </TableCell>
                          <TableCell className="text-right pr-6 text-xs text-slate-400 font-bold">
                            {a.adjustedByName}
                          </TableCell>
                        </TableRow>
                      )) : (
                        <TableRow>
                          <TableCell colSpan={5} className="h-24 text-center text-slate-400">
                            Belum ada log audit penyesuaian saldo cuti.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Details View Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border-none shadow-2xl">
          <DialogHeader className="p-6 pb-2 border-b bg-slate-50/50 dark:bg-slate-900/50">
            <DialogTitle className="text-lg font-black text-slate-900 dark:text-white">Detail Pengajuan Cuti HRD</DialogTitle>
          </DialogHeader>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4 border-b pb-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase">Nama Karyawan</p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-1">{selectedRequest?.employeeName}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase">Divisi / Brand</p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-1">{selectedRequest?.divisionName} / {selectedRequest?.brandName}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-b pb-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase">Waktu Pengajuan</p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-1">
                  {selectedRequest?.submittedAtStr || (selectedRequest?.createdAt ? format(selectedRequest.createdAt.toDate(), 'EEEE, dd MMMM yyyy pukul HH:mm', { locale: idLocale }) : '-')}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase">Periode Cuti</p>
                <p className="text-sm font-semibold text-indigo-600 mt-1 font-black">
                  {selectedRequest && format(selectedRequest.startDate.toDate(), 'EEEE, dd MMMM yyyy', { locale: idLocale })} s/d {selectedRequest && format(selectedRequest.endDate.toDate(), 'EEEE, dd MMMM yyyy', { locale: idLocale })}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-b pb-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase">Durasi Kerja</p>
                <p className="text-sm font-black text-indigo-600 dark:text-indigo-400 mt-1">{selectedRequest?.durationDays} Hari Kerja ({selectedRequest?.durationDaysStr || `${selectedRequest?.durationDays || 0} hari kerja`})</p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase">Zona Waktu</p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-1">{selectedRequest?.timezone || 'Asia/Jakarta'}</p>
              </div>
            </div>

            {/* Premium graphical approval timeline stepper */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800/80 space-y-4">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Timeline Alur Persetujuan</p>
              <div className="relative pl-6 space-y-5 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-200 dark:before:bg-slate-800">
                {/* Milestone 1: Staff Submission */}
                <div className="relative">
                  <div className="absolute -left-[20px] top-1 h-[12px] w-[12px] rounded-full bg-emerald-500 ring-4 ring-white dark:ring-slate-900" />
                  <div className="text-xs font-bold text-slate-800 dark:text-white">Diajukan oleh Staff</div>
                  <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                    {selectedRequest?.submittedAtStr || 'Sudah diajukan ke sistem.'}
                  </div>
                </div>

                {/* Milestone 2: Atasan Persetujuan */}
                <div className="relative">
                  <div className={`absolute -left-[20px] top-1 h-[12px] w-[12px] rounded-full ring-4 ring-white dark:ring-slate-900 ${
                    ['pending_manager', 'pending_manager_review'].includes(selectedRequest?.status || '')
                      ? 'bg-amber-500 animate-pulse'
                      : (selectedRequest?.status === 'rejected_by_manager' || ['revision_requested', 'revision_requested_by_manager'].includes(selectedRequest?.status || '')
                        ? 'bg-red-500'
                        : (selectedRequest?.status === 'cancelled'
                          ? 'bg-gray-400'
                          : 'bg-emerald-500'))
                  }`} />
                  <div className="text-xs font-bold text-slate-800 dark:text-white">Persetujuan Atasan ({selectedRequest?.managerName || 'Atasan Langsung'})</div>
                  <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                    {['pending_manager', 'pending_manager_review'].includes(selectedRequest?.status || '') && 'Menunggu Persetujuan Atasan'}
                    {selectedRequest?.status === 'rejected_by_manager' && `Ditolak Atasan: "${selectedRequest?.managerNotes}"`}
                    {['revision_requested', 'revision_requested_by_manager'].includes(selectedRequest?.status || '') && `Perlu Revisi: "${selectedRequest?.managerNotes}"`}
                    {selectedRequest?.status === 'cancelled' && 'Pengajuan Dibatalkan'}
                    {!['pending_manager', 'pending_manager_review', 'rejected_by_manager', 'revision_requested', 'revision_requested_by_manager', 'cancelled'].includes(selectedRequest?.status || '') && 'Disetujui Atasan'}
                  </div>
                </div>

                {/* Milestone 3: HRD Verifikasi */}
                <div className="relative">
                  <div className={`absolute -left-[20px] top-1 h-[12px] w-[12px] rounded-full ring-4 ring-white dark:ring-slate-900 ${
                    ['pending_manager', 'pending_manager_review', 'rejected_by_manager', 'revision_requested', 'revision_requested_by_manager', 'cancelled'].includes(selectedRequest?.status || '')
                      ? 'bg-slate-300'
                      : (['pending_hrd', 'pending_hrd_review'].includes(selectedRequest?.status || '')
                        ? 'bg-amber-500 animate-pulse'
                        : (selectedRequest?.status === 'rejected_by_hrd' || selectedRequest?.status === 'revision_requested_by_hrd'
                          ? 'bg-red-500'
                          : 'bg-emerald-500'))
                  }`} />
                  <div className="text-xs font-bold text-slate-800 dark:text-white">Verifikasi & Approval HRD</div>
                  <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                    {['pending_manager', 'pending_manager_review', 'rejected_by_manager', 'revision_requested', 'revision_requested_by_manager', 'cancelled'].includes(selectedRequest?.status || '') && 'Menunggu persetujuan atasan'}
                    {['pending_hrd', 'pending_hrd_review'].includes(selectedRequest?.status || '') && 'Menunggu Verifikasi HRD'}
                    {selectedRequest?.status === 'rejected_by_hrd' && `Ditolak HRD: "${selectedRequest?.hrdNotes}"`}
                    {selectedRequest?.status === 'revision_requested_by_hrd' && `Perlu Revisi: "${selectedRequest?.hrdNotes}"`}
                    {['approved', 'active_leave', 'completed'].includes(selectedRequest?.status || '') && 'Disetujui HRD'}
                  </div>
                </div>

                {/* Milestone 4: Realisasi Status */}
                <div className="relative">
                  <div className={`absolute -left-[20px] top-1 h-[12px] w-[12px] rounded-full ring-4 ring-white dark:ring-slate-900 ${
                    ['active_leave', 'completed'].includes(selectedRequest?.status || '')
                      ? 'bg-emerald-500'
                      : (selectedRequest?.status === 'approved'
                        ? 'bg-indigo-500 animate-pulse'
                        : 'bg-slate-300')
                  }`} />
                  <div className="text-xs font-bold text-slate-800 dark:text-white">Status Realisasi Cuti</div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                    {selectedRequest?.status === 'approved' && 'Menunggu Tanggal Mulai Cuti'}
                    {selectedRequest?.status === 'active_leave' && 'Cuti Aktif (Sedang Berlangsung)'}
                    {selectedRequest?.status === 'completed' && 'Cuti Selesai'}
                    {!['approved', 'active_leave', 'completed'].includes(selectedRequest?.status || '') && 'Belum Aktif'}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-400 uppercase">Alasan Cuti</p>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border">
                {selectedRequest?.reason}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase">Colleague Handover</p>
                <p className="text-sm font-semibold mt-1 text-slate-800 dark:text-slate-200">{selectedRequest?.handoverEmployeeName || '-'}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase">Kontak Darurat</p>
                <p className="text-sm font-semibold mt-1 text-slate-800 dark:text-slate-200">
                  {selectedRequest?.emergencyContactName} ({selectedRequest?.emergencyContactPhone})
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-400 uppercase">Catatan Handover Tugas</p>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-50/50 dark:bg-slate-950/35 p-3 rounded-lg border">
                {selectedRequest?.handoverNotes || '-'}
              </p>
            </div>

            {selectedRequest?.attachmentUrl && (
              <div className="pt-2">
                <Button variant="outline" asChild className="w-full">
                  <a href={selectedRequest.attachmentUrl} target="_blank" rel="noopener noreferrer">
                    Lihat Dokumen Lampiran
                  </a>
                </Button>
              </div>
            )}

            {/* Manager notes */}
            {selectedRequest?.managerNotes && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-1">
                <p className="text-xs font-black text-amber-600 dark:text-amber-400 uppercase">Disetujui Manager ({selectedRequest.managerName})</p>
                <p className="text-xs font-medium text-amber-700 dark:text-amber-300">{selectedRequest.managerNotes}</p>
              </div>
            )}

            {selectedRequest?.hrdNotes && (
              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl space-y-1">
                <p className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase">Catatan Keputusan HRD ({selectedRequest.hrdName})</p>
                <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">{selectedRequest.hrdNotes}</p>
              </div>
            )}

            {selectedRequest?.status === 'pending_hrd_review' && (
              <div className="flex justify-end gap-2 border-t pt-4">
                <Button variant="outline" onClick={() => handleOpenAction('revise', selectedRequest)} className="rounded-xl border-amber-500/20 text-amber-600 hover:bg-amber-50">
                  Minta Revisi
                </Button>
                <Button variant="outline" onClick={() => handleOpenAction('reject', selectedRequest)} className="rounded-xl border-red-500/20 text-red-600 hover:bg-red-50">
                  Tolak
                </Button>
                <Button onClick={() => handleOpenAction('approve', selectedRequest)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl px-5">
                  Setujui
                </Button>
              </div>
            )}
          </div>
          <DialogFooter className="p-6 pt-4 border-t bg-slate-50/50 dark:bg-slate-900/50">
            <Button onClick={() => setIsDetailOpen(false)} className="bg-slate-950 text-white font-bold rounded-xl px-5">Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Action Dialog (Approve/Reject/Revise) */}
      <Dialog open={isActionOpen} onOpenChange={setIsActionOpen}>
        <DialogContent className="max-w-md rounded-2xl bg-white dark:bg-slate-900 border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-slate-900 dark:text-white">
              {actionType === 'approve' ? 'Setujui Final Cuti' : (actionType === 'reject' ? 'Tolak Final Cuti' : 'Minta Revisi Cuti')}
            </DialogTitle>
            <DialogDescription className="text-xs font-semibold text-slate-500">
              {actionType === 'approve' ? 'Apakah Anda yakin ingin memberikan final approval untuk pengajuan cuti ini?' : 'Harap berikan alasan/keterangan keputusan Anda di bawah ini.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <Textarea
              rows={3}
              placeholder={actionType === 'approve' ? "Catatan persetujuan (opsional)..." : "Keterangan/alasan (wajib, minimal 5 karakter)..."}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="rounded-xl"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setIsActionOpen(false)} className="rounded-xl font-bold">Batal</Button>
            <Button onClick={handleConfirmAction} disabled={isSaving} className={`font-bold rounded-xl px-5 ${actionType === 'approve' ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : (actionType === 'reject' ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white')}`}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Finalisasi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Balance Adjustment Dialog */}
      <Dialog open={isAdjustmentOpen} onOpenChange={setIsAdjustmentOpen}>
        <DialogContent className="max-w-md rounded-2xl bg-white dark:bg-slate-900 border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-slate-900 dark:text-white">Sesuaikan Saldo Cuti Karyawan</DialogTitle>
            <DialogDescription className="text-xs font-semibold text-slate-500">
              Atur penambahan atau pengurangan saldo cuti tahunan milik {selectedBalance?.employeeName}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-xl grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase">Saldo Saat Ini</p>
                <p className="text-xl font-black text-slate-800 dark:text-white">{selectedBalance?.currentBalance} Hari</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase">Saldo Baru</p>
                <p className="text-xl font-black text-indigo-600 dark:text-indigo-400">
                  {selectedBalance ? selectedBalance.currentBalance + Number(adjustmentValue) : 0} Hari
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-500 uppercase">Nilai Penyesuaian (Hari)*</label>
              <Input
                type="number"
                placeholder="Masukkan nilai (+3 atau -2)..."
                value={adjustmentValue}
                onChange={e => setAdjustmentValue(Number(e.target.value))}
                className="rounded-xl"
              />
              <span className="text-[10px] text-slate-400 font-bold block mt-1">Gunakan angka positif untuk menambah saldo, atau negatif untuk memotong saldo.</span>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-500 uppercase">Alasan Penyesuaian Kuota*</label>
              <Textarea
                rows={3}
                placeholder="Masukkan alasan penyesuaian saldo secara rinci..."
                value={adjustmentReason}
                onChange={e => setAdjustmentReason(e.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setIsAdjustmentOpen(false)} className="rounded-xl font-bold">Batal</Button>
            <Button onClick={handleConfirmAdjustment} disabled={isSaving} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl px-5">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Simpan Penyesuaian
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
