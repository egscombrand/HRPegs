'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/providers/auth-provider';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2, CalendarOff, Eye, CheckCircle2, Send, FileUp } from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { sendLeaveNotification } from '@/lib/leave-notifications';
import { type LeaveRequest } from '@/lib/types';

export default function ManagerLeaveApprovalPage() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isActionOpen, setIsActionOpen] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'revise' | null>(null);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // 1. Fetch leave requests (filtered client-side to ensure all fallback manager fields work)
  const managerRequestsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(collection(firestore, 'leave_requests'));
  }, [userProfile?.uid, firestore]);

  const { data: requests, isLoading: isLoadingRequests, mutate: mutateRequests } = useCollection<LeaveRequest>(managerRequestsQuery);

  // 2. Strict Relationship Gating:
  // Only display requests matching the manager's UID directly across any field
  const filteredRequests = useMemo(() => {
    if (!requests || !userProfile?.uid) return [];
    return requests.filter(r => 
      r.managerId === userProfile.uid || 
      (r as any).managerUid === userProfile.uid || 
      (r as any).directManagerId === userProfile.uid ||
      (r as any).directManagerUid === userProfile.uid
    );
  }, [requests, userProfile]);

  // 3. Separate Active (Pending Manager Review) vs History
  const activeRequests = useMemo(() => {
    return filteredRequests.filter(r => 
      r.status === 'pending_manager' || 
      r.status === 'pending_manager_review'
    );
  }, [filteredRequests]);

  const historyRequests = useMemo(() => {
    return filteredRequests.filter(r => 
      r.status !== 'pending_manager' && 
      r.status !== 'pending_manager_review'
    ).sort((a, b) => {
      const aTime = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
      const bTime = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
      return bTime - aTime;
    });
  }, [filteredRequests]);

  // Helpers for exact formatting
  const formatSubmissionDate = (req: LeaveRequest) => {
    try {
      const date = req.createdAt ? req.createdAt.toDate() : new Date();
      return format(date, "EEEE, dd MMMM yyyy 'pukul' HH:mm", { locale: idLocale });
    } catch {
      return req.submittedAtStr || '-';
    }
  };

  const formatPeriodDate = (req: LeaveRequest) => {
    try {
      const start = req.startDate.toDate();
      const end = req.endDate.toDate();
      return `${format(start, 'EEEE, dd MMMM yyyy', { locale: idLocale })} – ${format(end, 'EEEE, dd MMMM yyyy', { locale: idLocale })}`;
    } catch {
      return '-';
    }
  };

  const formatDuration = (req: LeaveRequest) => {
    return `${req.durationDays} hari kerja`;
  };

  const formatHandover = (req: LeaveRequest) => {
    const name = req.handoverEmployeeName || '-';
    const position = req.handoverEmployeePosition;
    return position ? `${name} — ${position}` : name;
  };

  const handleViewDetails = (req: LeaveRequest) => {
    setSelectedRequest(req);
    setIsDetailOpen(true);
  };

  const handleOpenAction = (type: 'approve' | 'reject' | 'revise', req: LeaveRequest) => {
    setSelectedRequest(req);
    setActionType(type);
    setNotes('');
    setIsActionOpen(true);
  };

  const handleConfirmAction = async () => {
    if (!selectedRequest || !actionType || !userProfile || !firestore) return;

    // 1. Pre-update check: Current status must be pending_manager or pending_manager_review
    const isStatusValid = 
      selectedRequest.status === 'pending_manager' || 
      selectedRequest.status === 'pending_manager_review';

    if (!isStatusValid) {
      toast({
        variant: 'destructive',
        title: "Status Tidak Valid",
        description: "Status pengajuan saat ini tidak valid untuk diproses."
      });
      return;
    }

    // 2. Pre-update check: Current user must be the assigned manager/supervisor
    const currentManagerUid = userProfile.uid;
    const leaveDirectManagerId = (selectedRequest as any).directManagerId;
    const leaveDirectManagerUid = (selectedRequest as any).directManagerUid;
    const leaveManagerUid = (selectedRequest as any).managerUid;
    const leaveManagerId = selectedRequest.managerId;

    const isAssignedManager = 
      currentManagerUid && (
        currentManagerUid === leaveDirectManagerId ||
        currentManagerUid === leaveDirectManagerUid ||
        currentManagerUid === leaveManagerUid ||
        currentManagerUid === leaveManagerId
      );

    if (!isAssignedManager) {
      toast({
        variant: 'destructive',
        title: "Akses Ditolak",
        description: "Anda bukan atasan yang ditugaskan untuk menyetujui pengajuan cuti ini."
      });
      return;
    }

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
      // 3. Define payload and notification type based on action
      let payload: any = {};
      let notificationType: any = "manager_approval";

      if (actionType === 'approve') {
        payload = {
          status: 'pending_hrd',
          managerDecision: 'approved',
          managerReviewedAt: serverTimestamp(),
          managerReviewedBy: userProfile.uid,
          managerReviewedByName: userProfile.fullName,
          managerNotes: notes || null,
          updatedAt: serverTimestamp()
        };
        notificationType = "manager_approval";
      } else if (actionType === 'reject') {
        payload = {
          status: 'rejected_by_manager',
          managerDecision: 'rejected',
          managerReviewedAt: serverTimestamp(),
          managerReviewedBy: userProfile.uid,
          managerReviewedByName: userProfile.fullName,
          managerNotes: notes,
          updatedAt: serverTimestamp()
        };
        notificationType = "manager_rejection";
      } else if (actionType === 'revise') {
        payload = {
          status: 'revision_requested',
          managerDecision: 'revision_requested',
          managerReviewedAt: serverTimestamp(),
          managerReviewedBy: userProfile.uid,
          managerReviewedByName: userProfile.fullName,
          managerNotes: notes,
          updatedAt: serverTimestamp()
        };
        notificationType = "manager_revision";
      }

      // 4. Debug Logs before update
      console.log("=== DEBUG APPROVAL LEAVE REQUEST ===");
      console.log("auth.uid:", currentManagerUid);
      console.log("leaveRequestId:", selectedRequest.id);
      console.log("current status:", selectedRequest.status);
      console.log("directManagerId:", leaveDirectManagerId);
      console.log("directManagerUid:", leaveDirectManagerUid);
      console.log("managerUid:", leaveManagerUid);
      console.log("managerId:", leaveManagerId);
      console.log("payload update:", payload);
      console.log("Firestore Path to be written:", `leave_requests/${selectedRequest.id}`);
      console.log("======================================");

      // 5. Single update to leave_requests document (No writeBatch, no other balance updates!)
      const reqRef = doc(firestore, 'leave_requests', selectedRequest.id!);
      await updateDoc(reqRef, payload);

      // 6. Send notification separately after the main update is successful
      try {
        await sendLeaveNotification(firestore, notificationType, {
          employeeId: selectedRequest.employeeId,
          employeeName: selectedRequest.employeeName,
          managerId: userProfile.uid,
          managerName: userProfile.fullName,
          startDate: selectedRequest.startDate,
          endDate: selectedRequest.endDate,
          notes: actionType === 'revise' ? notes : undefined,
          reason: actionType === 'reject' ? notes : undefined,
          requestId: selectedRequest.id!
        });
      } catch (notifErr: any) {
        console.error("Failed to send separate notification:", notifErr);
      }

      toast({
        title: actionType === 'approve' ? "Persetujuan Dikirim" : (actionType === 'reject' ? "Pengajuan Ditolak" : "Permintaan Revisi Dikirim"),
        description: `Pengajuan cuti ${selectedRequest.employeeName} berhasil diproses.`
      });

      setIsActionOpen(false);
      setIsDetailOpen(false);
      mutateRequests();
    } catch (e: any) {
      console.error("Error matching manager update leave request:", e);
      toast({ 
        variant: 'destructive', 
        title: "Gagal Memproses", 
        description: `Error: ${e.message}. Silakan cek console debug log untuk info detail.` 
      });
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
      default: return 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending_manager':
      case 'pending_manager_review': return 'Menunggu Persetujuan Anda';
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

  return (
    <DashboardLayout pageTitle="Persetujuan Cuti Tim" menuConfig={undefined}>
      {/* Container is 100% full width, occupying the space after sidebar cleanly */}
      <div className="w-full space-y-6 px-4 md:px-8 max-w-[1600px] mx-auto">
        
        {/* Header Section */}
        <div className="flex items-center gap-4 py-2">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 shadow-sm">
            <CalendarOff className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Persetujuan Cuti Tim</h1>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">Tinjau, setujui, atau tolak pengajuan cuti tahunan staff divisi Anda secara realtime.</p>
          </div>
        </div>

        {/* 1. ACTIVE REQUESTS CARD */}
        <Card className="border-slate-100 dark:border-slate-800 shadow-md rounded-2xl overflow-hidden">
          <CardHeader className="border-b pb-4 bg-slate-50/50 dark:bg-slate-900/50">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-black uppercase tracking-wider text-indigo-600 flex items-center gap-2">
                Menunggu Persetujuan Anda 
                <Badge className="bg-indigo-600 hover:bg-indigo-600 text-white font-black text-xs rounded-full px-2.5 py-0.5">{activeRequests.length}</Badge>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* Desktop Readable Table */}
            <div className="hidden md:block overflow-x-auto w-full">
              <Table className="w-full min-w-[1100px]">
                <TableHeader className="bg-slate-50/20 dark:bg-slate-900/10">
                  <TableRow>
                    <TableHead className="pl-8 py-4 font-bold text-slate-800 dark:text-slate-200">Karyawan</TableHead>
                    <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Divisi</TableHead>
                    <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Jenis Cuti</TableHead>
                    <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Tanggal Pengajuan</TableHead>
                    <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Periode Cuti</TableHead>
                    <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Durasi</TableHead>
                    <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Pengganti</TableHead>
                    <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Status</TableHead>
                    <TableHead className="text-right pr-8 py-4 font-bold text-slate-800 dark:text-slate-200">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeRequests.length > 0 ? activeRequests.map(r => (
                    <TableRow key={r.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-900/10 transition-colors border-b border-slate-100 dark:border-slate-800/80">
                      <TableCell className="pl-8 py-5">
                        <span className="text-slate-800 dark:text-white font-black text-sm block">{r.employeeName}</span>
                      </TableCell>
                      <TableCell className="py-5 font-bold text-slate-500 text-xs uppercase tracking-wider">
                        {r.divisionName || '-'}
                      </TableCell>
                      <TableCell className="py-5 text-xs font-bold text-indigo-500 capitalize">
                        Cuti {r.leaveType === 'tahunan' ? 'Tahunan' : r.leaveType === 'besar' ? 'Besar' : r.leaveType === 'menikah' ? 'Menikah' : r.leaveType === 'melahirkan' ? 'Melahirkan' : 'Tahunan'}
                      </TableCell>
                      <TableCell className="py-5 text-xs text-slate-500 font-semibold">
                        {formatSubmissionDate(r)}
                      </TableCell>
                      <TableCell className="py-5 text-sm text-slate-700 dark:text-slate-300 font-semibold">
                        {formatPeriodDate(r)}
                      </TableCell>
                      <TableCell className="py-5 font-black text-slate-700 dark:text-slate-200 text-sm">
                        {formatDuration(r)}
                      </TableCell>
                      <TableCell className="py-5 text-xs text-slate-600 dark:text-slate-300 font-semibold max-w-[180px] truncate">
                        {formatHandover(r)}
                      </TableCell>
                      <TableCell className="py-5">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-wider ${getStatusBadgeClass(r.status)}`}>
                          {getStatusLabel(r.status)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right pr-8 py-5">
                        <div className="flex items-center justify-end gap-1.5 animate-in fade-in duration-300">
                          <Button variant="ghost" size="sm" onClick={() => handleViewDetails(r)} className="rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs gap-1">
                            <Eye className="h-3.5 w-3.5" /> Tinjau
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleOpenAction('approve', r)} className="rounded-xl border-emerald-500/20 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 text-emerald-600 font-bold text-xs">
                            Setujui
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleOpenAction('reject', r)} className="rounded-xl border-red-500/20 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-600 font-bold text-xs">
                            Tolak
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleOpenAction('revise', r)} className="rounded-xl border-amber-500/20 hover:bg-amber-50 dark:hover:bg-amber-950/20 text-amber-600 font-bold text-xs">
                            Revisi
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={9} className="h-44 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <CheckCircle2 className="h-10 w-10 text-emerald-500 opacity-60" />
                          <p className="text-sm font-bold">Hebat! Semua tugas persetujuan cuti sudah diselesaikan.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Card List (Active) */}
            <div className="block md:hidden space-y-4 px-4 py-4 bg-slate-50/30 dark:bg-slate-900/10">
              {activeRequests.length > 0 ? activeRequests.map(r => (
                <div key={r.id} className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-sm space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-black text-slate-800 dark:text-white text-base">{r.employeeName}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{r.divisionName || 'N/A'}</p>
                    </div>
                    <Badge variant="outline" className={`px-2 py-0.5 rounded-full text-[9px] font-black border uppercase tracking-wider ${getStatusBadgeClass(r.status)}`}>
                      {getStatusLabel(r.status)}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs py-3 border-y border-slate-50 dark:border-slate-800/80">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Jenis Cuti</span>
                      <span className="font-black text-indigo-500 capitalize">
                        Cuti {r.leaveType === 'tahunan' ? 'Tahunan' : r.leaveType === 'besar' ? 'Besar' : r.leaveType === 'menikah' ? 'Menikah' : r.leaveType === 'melahirkan' ? 'Melahirkan' : 'Tahunan'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Durasi</span>
                      <span className="font-bold text-slate-700 dark:text-slate-200">
                        {formatDuration(r)}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Periode Cuti</span>
                      <span className="font-semibold text-slate-600 dark:text-slate-300">
                        {formatPeriodDate(r)}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <Button variant="ghost" size="sm" onClick={() => handleViewDetails(r)} className="rounded-xl flex items-center gap-1 font-bold text-xs bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 px-4 py-2">
                      <Eye className="h-3.5 w-3.5" /> Tinjau
                    </Button>
                  </div>
                </div>
              )) : (
                <div className="text-center py-8 text-slate-400">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2 opacity-60" />
                  <p className="text-xs font-bold">Hebat! Semua tugas persetujuan cuti sudah diselesaikan.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 2. HISTORY REQUESTS CARD */}
        <Card className="border-slate-100 dark:border-slate-800 shadow-md rounded-2xl overflow-hidden">
          <CardHeader className="border-b pb-4 bg-slate-50/50 dark:bg-slate-900/50">
            <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-500 flex items-center gap-2">
              Riwayat Keputusan Cuti Tim
              <Badge className="bg-slate-400 text-white font-black text-xs rounded-full px-2.5 py-0.5">{historyRequests.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* Desktop History Table */}
            <div className="hidden md:block overflow-x-auto w-full">
              <Table className="w-full min-w-[1100px]">
                <TableHeader className="bg-slate-50/20 dark:bg-slate-900/10">
                  <TableRow>
                    <TableHead className="pl-8 py-4 font-bold text-slate-800 dark:text-slate-200">Karyawan</TableHead>
                    <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Divisi</TableHead>
                    <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Jenis Cuti</TableHead>
                    <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Tanggal Pengajuan</TableHead>
                    <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Periode Cuti</TableHead>
                    <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Durasi</TableHead>
                    <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Pengganti</TableHead>
                    <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Status</TableHead>
                    <TableHead className="text-right pr-8 py-4 font-bold text-slate-800 dark:text-slate-200">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyRequests.length > 0 ? historyRequests.map(r => (
                    <TableRow key={r.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-900/10 transition-colors border-b border-slate-100 dark:border-slate-800/80">
                      <TableCell className="pl-8 py-5">
                        <span className="text-slate-800 dark:text-white font-black text-sm block">{r.employeeName}</span>
                      </TableCell>
                      <TableCell className="py-5 font-bold text-slate-500 text-xs uppercase tracking-wider">
                        {r.divisionName || '-'}
                      </TableCell>
                      <TableCell className="py-5 text-xs font-bold text-indigo-500 capitalize">
                        Cuti {r.leaveType === 'tahunan' ? 'Tahunan' : r.leaveType === 'besar' ? 'Besar' : r.leaveType === 'menikah' ? 'Menikah' : r.leaveType === 'melahirkan' ? 'Melahirkan' : 'Tahunan'}
                      </TableCell>
                      <TableCell className="py-5 text-xs text-slate-500 font-semibold">
                        {formatSubmissionDate(r)}
                      </TableCell>
                      <TableCell className="py-5 text-sm text-slate-700 dark:text-slate-300 font-semibold">
                        {formatPeriodDate(r)}
                      </TableCell>
                      <TableCell className="py-5 font-black text-slate-700 dark:text-slate-200 text-sm">
                        {formatDuration(r)}
                      </TableCell>
                      <TableCell className="py-5 text-xs text-slate-600 dark:text-slate-300 font-semibold max-w-[180px] truncate">
                        {formatHandover(r)}
                      </TableCell>
                      <TableCell className="py-5">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-wider ${getStatusBadgeClass(r.status)}`}>
                          {getStatusLabel(r.status)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right pr-8 py-5">
                        <Button variant="ghost" size="sm" onClick={() => handleViewDetails(r)} className="rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs gap-1">
                          <Eye className="h-3.5 w-3.5" /> Detail
                        </Button>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={9} className="h-28 text-center text-slate-400">
                        Belum ada riwayat keputusan cuti yang diproses.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Card List (History) */}
            <div className="block md:hidden space-y-4 px-4 py-4 bg-slate-50/30 dark:bg-slate-900/10">
              {historyRequests.length > 0 ? historyRequests.map(r => (
                <div key={r.id} className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-sm space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-black text-slate-800 dark:text-white text-base">{r.employeeName}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{r.divisionName || 'N/A'}</p>
                    </div>
                    <Badge variant="outline" className={`px-2 py-0.5 rounded-full text-[9px] font-black border uppercase tracking-wider ${getStatusBadgeClass(r.status)}`}>
                      {getStatusLabel(r.status)}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs py-3 border-y border-slate-50 dark:border-slate-800/80">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Jenis Cuti</span>
                      <span className="font-black text-indigo-500 capitalize">
                        Cuti {r.leaveType === 'tahunan' ? 'Tahunan' : r.leaveType === 'besar' ? 'Besar' : r.leaveType === 'menikah' ? 'Menikah' : r.leaveType === 'melahirkan' ? 'Melahirkan' : 'Tahunan'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Durasi</span>
                      <span className="font-bold text-slate-700 dark:text-slate-200">
                        {formatDuration(r)}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Periode Cuti</span>
                      <span className="font-semibold text-slate-600 dark:text-slate-300">
                        {formatPeriodDate(r)}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <Button variant="ghost" size="sm" onClick={() => handleViewDetails(r)} className="rounded-xl flex items-center gap-1 font-bold text-xs bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 px-4 py-2">
                      <Eye className="h-3.5 w-3.5" /> Detail
                    </Button>
                  </div>
                </div>
              )) : (
                <div className="text-center py-6 text-slate-400">
                  Belum ada riwayat keputusan cuti yang diproses.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* DETAIL DIALOG */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border-none shadow-2xl max-h-[85vh] flex flex-col my-auto top-[50%] translate-y-[-50%]">
          <DialogHeader className="p-6 pb-4 border-b bg-slate-50/50 dark:bg-slate-900/50 flex-none">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <DialogTitle className="text-lg font-black text-slate-900 dark:text-white">Detail Pengajuan Cuti Staf</DialogTitle>
                {selectedRequest && (
                  <Badge variant="outline" className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-wider ${getStatusBadgeClass(selectedRequest.status)}`}>
                    {getStatusLabel(selectedRequest.status)}
                  </Badge>
                )}
              </div>
              {selectedRequest && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs font-semibold text-slate-500">
                  <span className="text-slate-900 dark:text-white font-black text-sm">{selectedRequest.employeeName}</span>
                  <span className="text-slate-300">|</span>
                  <span className="text-indigo-600 dark:text-indigo-400 font-bold">{selectedRequest.durationDays} Hari Kerja</span>
                </div>
              )}
            </div>
          </DialogHeader>

          {/* Internal Scroll Content Area */}
          <div className="p-6 space-y-6 overflow-y-auto flex-1 max-h-[calc(85vh-140px)]">
            
            {/* 1. Ringkasan Cuti */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Jenis Cuti</p>
                <p className="text-sm font-black text-indigo-600 dark:text-indigo-400 capitalize">
                  Cuti {selectedRequest?.leaveType === 'tahunan' ? 'Tahunan' : selectedRequest?.leaveType === 'besar' ? 'Besar' : selectedRequest?.leaveType === 'menikah' ? 'Menikah' : selectedRequest?.leaveType === 'melahirkan' ? 'Melahirkan' : 'Tahunan'}
                </p>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Divisi & Brand</p>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                  {selectedRequest?.divisionName || '-'} / {selectedRequest?.brandName || '-'}
                </p>
              </div>
            </div>

            {/* 2. Waktu Pengajuan & Periode Cuti */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Waktu Pengajuan</p>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  {selectedRequest && formatSubmissionDate(selectedRequest)}
                </p>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Periode Cuti</p>
                <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                  {selectedRequest && formatPeriodDate(selectedRequest)}
                </p>
              </div>
            </div>

            {/* 3. Alasan & Alamat Cuti */}
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Alasan Cuti</p>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-100 dark:border-slate-800/80">
                  {selectedRequest?.reason || '-'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Alamat Selama Cuti</p>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-100 dark:border-slate-800/80">
                  {selectedRequest?.leaveAddress || '-'}
                </p>
              </div>
            </div>

            {/* 4. Pengganti Sementara & Kontak Darurat */}
            <div className="p-4 bg-indigo-50/30 dark:bg-indigo-950/10 rounded-2xl border border-indigo-100/50 dark:border-indigo-900/20 space-y-4">
              <p className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Pendelegasian Tugas & Kontak Darurat</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase">Pengganti Sementara (Handover)</p>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-1">{selectedRequest?.handoverEmployeeName || '-'}</p>
                  {selectedRequest?.handoverEmployeePosition && (
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">{selectedRequest.handoverEmployeePosition}</p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase">Kontak Darurat</p>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-1 font-black">
                    {selectedRequest?.emergencyContactName || '-'}
                  </p>
                  {selectedRequest?.emergencyContactPhone && (
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">{selectedRequest.emergencyContactPhone}</p>
                  )}
                </div>
              </div>
              <div className="space-y-1 pt-2 border-t border-indigo-100/30 dark:border-indigo-900/10">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Catatan Serah Terima Tugas</p>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300 bg-white/50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800/80">
                  {selectedRequest?.handoverNotes || '-'}
                </p>
              </div>
            </div>

            {/* 5. Timeline Persetujuan */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800/80 space-y-4">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Timeline Alur Persetujuan</p>
              <div className="relative pl-6 space-y-5 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-200 dark:before:bg-slate-800">
                {/* Milestone 1: Staff Submission */}
                <div className="relative">
                  <div className="absolute -left-[20px] top-1 h-[12px] w-[12px] rounded-full bg-emerald-500 ring-4 ring-white dark:ring-slate-900" />
                  <div className="text-xs font-bold text-slate-800 dark:text-white">Diajukan oleh Staff</div>
                  <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                    {selectedRequest && formatSubmissionDate(selectedRequest)}
                  </div>
                </div>

                {/* Milestone 2: Atasan Persetujuan */}
                <div className="relative">
                  <div className={`absolute -left-[20px] top-1 h-[12px] w-[12px] rounded-full ring-4 ring-white dark:ring-slate-900 ${
                    selectedRequest && ['pending_manager', 'pending_manager_review'].includes(selectedRequest.status)
                      ? 'bg-amber-500 animate-pulse'
                      : (selectedRequest && (selectedRequest.status === 'rejected_by_manager' || ['revision_requested', 'revision_requested_by_manager'].includes(selectedRequest.status))
                        ? 'bg-red-500'
                        : (selectedRequest && selectedRequest.status === 'cancelled'
                          ? 'bg-gray-400'
                          : 'bg-emerald-500'))
                  }`} />
                  <div className="text-xs font-bold text-slate-800 dark:text-white">Persetujuan Atasan ({selectedRequest?.managerName || 'Atasan Langsung'})</div>
                  <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                    {selectedRequest && ['pending_manager', 'pending_manager_review'].includes(selectedRequest.status) && 'Menunggu Persetujuan Atasan'}
                    {selectedRequest && selectedRequest.status === 'rejected_by_manager' && `Ditolak Atasan: "${selectedRequest.managerNotes}"`}
                    {selectedRequest && ['revision_requested', 'revision_requested_by_manager'].includes(selectedRequest.status) && `Perlu Revisi: "${selectedRequest.managerNotes}"`}
                    {selectedRequest && selectedRequest.status === 'cancelled' && 'Pengajuan Dibatalkan'}
                    {selectedRequest && !['pending_manager', 'pending_manager_review', 'rejected_by_manager', 'revision_requested', 'revision_requested_by_manager', 'cancelled'].includes(selectedRequest.status) && 'Disetujui Atasan'}
                  </div>
                </div>

                {/* Milestone 3: HRD Verifikasi */}
                <div className="relative">
                  <div className={`absolute -left-[20px] top-1 h-[12px] w-[12px] rounded-full ring-4 ring-white dark:ring-slate-900 ${
                    selectedRequest && ['pending_manager', 'pending_manager_review', 'rejected_by_manager', 'revision_requested', 'revision_requested_by_manager', 'cancelled'].includes(selectedRequest.status)
                      ? 'bg-slate-300'
                      : (selectedRequest && ['pending_hrd', 'pending_hrd_review'].includes(selectedRequest.status)
                        ? 'bg-amber-500 animate-pulse'
                        : (selectedRequest && (selectedRequest.status === 'rejected_by_hrd' || selectedRequest.status === 'revision_requested_by_hrd')
                          ? 'bg-red-500'
                          : 'bg-emerald-500'))
                  }`} />
                  <div className="text-xs font-bold text-slate-800 dark:text-white">Verifikasi & Approval HRD</div>
                  <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                    {selectedRequest && ['pending_manager', 'pending_manager_review', 'rejected_by_manager', 'revision_requested', 'revision_requested_by_manager', 'cancelled'].includes(selectedRequest.status) && 'Menunggu persetujuan atasan'}
                    {selectedRequest && ['pending_hrd', 'pending_hrd_review'].includes(selectedRequest.status) && 'Menunggu Verifikasi HRD'}
                    {selectedRequest && selectedRequest.status === 'rejected_by_hrd' && `Ditolak HRD: "${selectedRequest.hrdNotes}"`}
                    {selectedRequest && selectedRequest.status === 'revision_requested_by_hrd' && `Perlu Revisi: "${selectedRequest.hrdNotes}"`}
                    {selectedRequest && ['approved', 'active_leave', 'completed'].includes(selectedRequest.status) && 'Disetujui HRD'}
                  </div>
                </div>
              </div>
            </div>

            {selectedRequest?.attachmentUrl && (
              <div className="pt-2">
                <Button variant="outline" asChild className="w-full rounded-xl">
                  <a href={selectedRequest.attachmentUrl} target="_blank" rel="noopener noreferrer">
                    <FileUp className="mr-2 h-4 w-4" /> Lihat Dokumen Lampiran
                  </a>
                </Button>
              </div>
            )}

            {/* Sticky Action Footer inside Modal */}
            {selectedRequest && ['pending_manager', 'pending_manager_review'].includes(selectedRequest.status) && (
              <div className="flex justify-end gap-2 border-t pt-4 animate-in slide-in-from-bottom duration-300">
                <Button variant="outline" onClick={() => handleOpenAction('revise', selectedRequest)} className="rounded-xl border-amber-500/20 hover:bg-amber-50 dark:hover:bg-amber-950/20 text-amber-600 font-bold">
                  Minta Revisi
                </Button>
                <Button variant="outline" onClick={() => handleOpenAction('reject', selectedRequest)} className="rounded-xl border-red-500/20 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-600 font-bold">
                  Tolak
                </Button>
                <Button onClick={() => handleOpenAction('approve', selectedRequest)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl px-5">
                  Setujui
                </Button>
              </div>
            )}
          </div>
          
          <DialogFooter className="p-6 pt-4 border-t bg-slate-50/50 dark:bg-slate-900/50 flex-none">
            <Button onClick={() => setIsDetailOpen(false)} className="bg-slate-950 text-white font-bold rounded-xl px-5">Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ACTION CONFIRMATION DIALOG (Approve/Reject/Revise) */}
      <Dialog open={isActionOpen} onOpenChange={setIsActionOpen}>
        <DialogContent className="max-w-md rounded-2xl bg-white dark:bg-slate-900 border-none shadow-2xl my-auto top-[50%] translate-y-[-50%]">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-slate-900 dark:text-white">
              {actionType === 'approve' ? 'Setujui Pengajuan Cuti' : (actionType === 'reject' ? 'Tolak Pengajuan Cuti' : 'Minta Revisi Pengajuan')}
            </DialogTitle>
            <DialogDescription className="text-xs font-semibold text-slate-500 mt-1">
              {actionType === 'approve' 
                ? 'Apakah Anda yakin ingin menyetujui pengajuan cuti ini?' 
                : actionType === 'reject' 
                  ? 'Harap berikan alasan penolakan di bawah ini. Alasan penolakan ini wajib diisi oleh Manager.'
                  : 'Harap berikan catatan revisi di bawah ini.'}
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
              Proses
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
