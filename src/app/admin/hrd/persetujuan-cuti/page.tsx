'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { collection, query, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useAuth } from '@/providers/auth-provider';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { sendLeaveNotification } from '@/lib/leave-notifications';
import { type LeaveRequest, type LeaveBalance, type LeaveBalanceAdjustment } from '@/lib/types';
import {
  Loader2,
  CalendarOff,
  AlertTriangle,
  Eye,
  CheckCircle2,
  Settings,
  Send,
  Building,
  Users,
  Search,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  FileClock,
  Briefcase,
  Layers,
  MapPin,
  PhoneCall,
  UserCheck,
  Check,
  HelpCircle,
  Clock
} from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

export default function HrdLeaveApprovalPage() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  // State managers
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

  // Calendar State
  const [calendarMonth, setCalendarMonth] = useState<number>(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState<number>(new Date().getFullYear());
  
  // Base rate assumption for Cashout Estimates (can be configured)
  const [ratePerDay, setRatePerDay] = useState<number>(100000);

  // Interactive filter state
  const [showFilters, setShowFilters] = useState(false);
  const [filterBrand, setFilterBrand] = useState('all');
  const [filterDivision, setFilterDivision] = useState('all');
  const [filterLeaveType, setFilterLeaveType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterManager, setFilterManager] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [filterYear, setFilterYear] = useState('all');

  // 1. Fetch employee profiles for real-time brand & division mapping
  const profilesQuery = useMemoFirebase(() => {
    return query(collection(firestore, 'employee_profiles'));
  }, [firestore]);
  const { data: employeeProfiles } = useCollection<any>(profilesQuery);

  const employeeProfilesMap = useMemo(() => {
    const map = new Map<string, any>();
    if (employeeProfiles) {
      employeeProfiles.forEach((p) => {
        map.set(p.uid || p.id, p);
      });
    }
    return map;
  }, [employeeProfiles]);

  // 2. Fetch all leave requests
  const requestsQuery = useMemoFirebase(() => {
    return query(collection(firestore, 'leave_requests'));
  }, [firestore]);
  const { data: requests, isLoading: isLoadingRequests, mutate: mutateRequests } = useCollection<LeaveRequest>(requestsQuery);

  // 3. Fetch all leave balances
  const balancesQuery = useMemoFirebase(() => {
    return query(collection(firestore, 'leave_balances'));
  }, [firestore]);
  const { data: balances, isLoading: isLoadingBalances, mutate: mutateBalances } = useCollection<LeaveBalance>(balancesQuery);

  // 4. Fetch all adjustments
  const adjustmentsQuery = useMemoFirebase(() => {
    return query(collection(firestore, 'leave_balance_adjustments'));
  }, [firestore]);
  const { data: adjustments, isLoading: isLoadingAdjustments, mutate: mutateAdjustments } = useCollection<LeaveBalanceAdjustment>(adjustmentsQuery);

  // Filter unique dropdown options dynamically
  const brandOptions = useMemo(() => {
    const set = new Set<string>();
    if (employeeProfiles) {
      employeeProfiles.forEach(p => {
        const bName = p.hrdEmploymentInfo?.brandName || p.hrdEmploymentInfo?.brand || p.brandName;
        if (bName) set.add(bName);
      });
    }
    if (requests) {
      requests.forEach(r => {
        if (r.brandName) set.add(r.brandName);
      });
    }
    return Array.from(set).sort();
  }, [employeeProfiles, requests]);

  const divisionOptions = useMemo(() => {
    const set = new Set<string>();
    if (employeeProfiles) {
      employeeProfiles.forEach(p => {
        const bName = p.hrdEmploymentInfo?.brandName || p.hrdEmploymentInfo?.brand || p.brandName;
        if (filterBrand !== 'all' && bName !== filterBrand) return;
        
        const dName = p.hrdEmploymentInfo?.divisionName || p.hrdEmploymentInfo?.division || p.divisionName;
        if (dName) set.add(dName);
      });
    }
    if (requests) {
      requests.forEach(r => {
        if (filterBrand !== 'all' && r.brandName !== filterBrand) return;
        if (r.divisionName) set.add(r.divisionName);
      });
    }
    return Array.from(set).sort();
  }, [employeeProfiles, requests, filterBrand]);

  const managerOptions = useMemo(() => {
    const map = new Map<string, string>();
    if (requests) {
      requests.forEach(r => {
        if (r.managerId && r.managerName) {
          map.set(r.managerId, r.managerName);
        }
      });
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [requests]);

  // Compute 5 indicators dynamically
  const pendingHrdCount = useMemo(() => {
    if (!requests) return 0;
    return requests.filter(r => r.status === 'pending_hrd' || r.status === 'pending_hrd_review').length;
  }, [requests]);

  const approvedThisMonthCount = useMemo(() => {
    if (!requests) return 0;
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    return requests.filter(r => {
      if (!['approved', 'approved_by_hrd', 'active_leave', 'completed'].includes(r.status)) return false;
      try {
        const start = r.startDate.toDate();
        return start.getMonth() === currentMonth && start.getFullYear() === currentYear;
      } catch {
        return false;
      }
    }).length;
  }, [requests]);

  const activeTodayCount = useMemo(() => {
    if (!requests) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return requests.filter(r => {
      if (!['approved', 'approved_by_hrd', 'active_leave'].includes(r.status)) return false;
      try {
        const start = r.startDate.toDate();
        start.setHours(0, 0, 0, 0);
        const end = r.endDate.toDate();
        end.setHours(23, 59, 59, 999);
        return today >= start && today <= end;
      } catch {
        return false;
      }
    }).length;
  }, [requests]);

  const totalUsedDays = useMemo(() => {
    if (!requests) return 0;
    return requests
      .filter(r => ['approved', 'approved_by_hrd', 'active_leave', 'completed'].includes(r.status))
      .reduce((sum, r) => sum + (r.durationDays || 0), 0);
  }, [requests]);

  const lowBalanceEmployees = useMemo(() => {
    if (!balances) return [];
    return balances.filter(b => {
      const remaining = b.currentBalance !== undefined ? b.currentBalance : ((b as any).remainingDays ?? 0);
      return remaining <= 2;
    });
  }, [balances]);

  // General leaves requests filtered by interactive filters
  const filteredRequests = useMemo(() => {
    if (!requests) return [];
    return requests.filter(r => {
      // 1. Search text
      if (filterSearch) {
        const queryStr = filterSearch.toLowerCase();
        const nameMatch = r.employeeName?.toLowerCase().includes(queryStr);
        const reasonMatch = r.reason?.toLowerCase().includes(queryStr);
        if (!nameMatch && !reasonMatch) return false;
      }
      // 2. Brand
      if (filterBrand !== 'all') {
        if (r.brandName !== filterBrand) return false;
      }
      // 3. Division
      if (filterDivision !== 'all') {
        if (r.divisionName !== filterDivision) return false;
      }
      // 4. Leave Type
      if (filterLeaveType !== 'all') {
        if (r.leaveType !== filterLeaveType) return false;
      }
      // 5. Status
      if (filterStatus !== 'all') {
        if (filterStatus === 'pending_hrd') {
          if (r.status !== 'pending_hrd' && r.status !== 'pending_hrd_review') return false;
        } else if (filterStatus === 'approved') {
          if (r.status !== 'approved' && r.status !== 'approved_by_hrd') return false;
        } else {
          if (r.status !== filterStatus) return false;
        }
      }
      // 6. Manager
      if (filterManager !== 'all') {
        if (r.managerId !== filterManager) return false;
      }
      // 7. Month/Year filter
      if (filterMonth !== 'all' || filterYear !== 'all') {
        try {
          const date = r.startDate.toDate();
          if (filterMonth !== 'all' && date.getMonth().toString() !== filterMonth) return false;
          if (filterYear !== 'all' && date.getFullYear().toString() !== filterYear) return false;
        } catch {
          return false;
        }
      }
      return true;
    });
  }, [requests, filterSearch, filterBrand, filterDivision, filterLeaveType, filterStatus, filterManager, filterMonth, filterYear]);

  // Tab 1 List: Active Pending HRD Reviews
  const activeRequestsFiltered = useMemo(() => {
    return filteredRequests.filter(r => r.status === 'pending_hrd' || r.status === 'pending_hrd_review');
  }, [filteredRequests]);

  // Tab 2 List: All Leaves requests history
  const historyRequestsFiltered = useMemo(() => {
    return [...filteredRequests].sort((a, b) => {
      const aTime = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
      const bTime = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
      return bTime - aTime;
    });
  }, [filteredRequests]);

  // Tab 3 List: Employee Quota balances filtered
  const filteredBalances = useMemo(() => {
    if (!balances) return [];
    return balances.filter(b => {
      // 1. Search text
      if (filterSearch) {
        if (!b.employeeName?.toLowerCase().includes(filterSearch.toLowerCase())) return false;
      }
      const profile = employeeProfilesMap.get(b.employeeId);
      const bBrand = (b as any).brandName || profile?.hrdEmploymentInfo?.brandName || profile?.hrdEmploymentInfo?.brand || '';
      const bDivision = (b as any).divisionName || profile?.hrdEmploymentInfo?.divisionName || profile?.hrdEmploymentInfo?.division || '';
      const bEmploymentType = b.employmentType || profile?.hrdEmploymentInfo?.employeeType || '';
      const contractMonths = b.contractDurationMonths || profile?.hrdEmploymentInfo?.contractDurationMonths || 0;
      
      // Only show Tetap and Kontrak >= 12 months
      const isTetap = bEmploymentType.toLowerCase().includes('tetap');
      const isEligibleKontrak = bEmploymentType.toLowerCase().includes('kontrak') && contractMonths >= 12;
      
      if (!isTetap && !isEligibleKontrak) {
        return false;
      }

      // 2. Brand
      if (filterBrand !== 'all') {
        if (bBrand !== filterBrand) return false;
      }
      // 3. Division
      if (filterDivision !== 'all') {
        if (bDivision !== filterDivision) return false;
      }
      return true;
    });
  }, [balances, filterSearch, filterBrand, filterDivision, employeeProfilesMap]);

  // Tab 4 List: Audit Mutasi Saldo Cuti ledger logs filtered
  const sortedAdjustmentsFiltered = useMemo(() => {
    if (!adjustments) return [];
    
    const processed = adjustments.map(a => {
      const profile = employeeProfilesMap.get(a.employeeId);
      const bBrand = (a as any).brandName || profile?.hrdEmploymentInfo?.brandName || profile?.hrdEmploymentInfo?.brand || '';
      const bDivision = (a as any).divisionName || profile?.hrdEmploymentInfo?.divisionName || profile?.hrdEmploymentInfo?.division || '';
      return {
        ...a,
        brandName: bBrand,
        divisionName: bDivision
      };
    });

    return processed.filter(a => {
      // 1. Search text
      if (filterSearch) {
        const queryStr = filterSearch.toLowerCase();
        const empMatch = a.employeeName?.toLowerCase().includes(queryStr);
        const reasonMatch = a.reason?.toLowerCase().includes(queryStr);
        if (!empMatch && !reasonMatch) return false;
      }
      // 2. Brand
      if (filterBrand !== 'all') {
        if (a.brandName !== filterBrand) return false;
      }
      // 3. Division
      if (filterDivision !== 'all') {
        if (a.divisionName !== filterDivision) return false;
      }
      // 4. Month/Year filter
      if (filterMonth !== 'all' || filterYear !== 'all') {
        try {
          const date = a.createdAt?.toDate ? a.createdAt.toDate() : new Date();
          if (filterMonth !== 'all' && date.getMonth().toString() !== filterMonth) return false;
          if (filterYear !== 'all' && date.getFullYear().toString() !== filterYear) return false;
        } catch {
          return false;
        }
      }
      return true;
    }).sort((a, b) => {
      const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return bTime - aTime;
    });
  }, [adjustments, filterSearch, filterBrand, filterDivision, filterMonth, filterYear, employeeProfilesMap]);

  // Selected Employee Balance dynamic lookups for Detail Timeline Dialog
  const selectedRequestBalance = useMemo(() => {
    if (!balances || !selectedRequest) return null;
    return balances.find(b => b.employeeId === selectedRequest.employeeId) || null;
  }, [balances, selectedRequest]);

  // Action handlers
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

  // AUTOMATED ATOMIC FINAL APPROVAL DEDUCTIONS
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

      let newStatus: LeaveRequest['status'] = 'approved_by_hrd';
      let notificationType: any = "hrd_approval";

      if (actionType === 'reject') {
        newStatus = 'rejected_by_hrd';
        notificationType = "hrd_rejection";
      } else if (actionType === 'revise') {
        newStatus = 'revision_requested_by_hrd';
        notificationType = "hrd_revision";
      }

      // 1. Update Leave Request Status
      batch.update(reqRef, {
        status: newStatus,
        hrdId: userProfile.uid,
        hrdName: userProfile.fullName,
        hrdNotes: notes,
        hrdReviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // 2. Automate quota balance updates atomically
      const balanceRef = doc(firestore, 'leave_balances', selectedRequest.employeeId);
      const balData = balances?.find(b => b.employeeId === selectedRequest.employeeId);

      if (balData) {
        const pendingLeaveVal = Math.max(0, (balData.pendingLeave || 0) - selectedRequest.durationDays);
        const pendingDaysVal = Math.max(0, ((balData as any).pendingDays || 0) - selectedRequest.durationDays);

        if (actionType === 'approve') {
          const newCurrentBalance = Math.max(0, (balData.currentBalance || 0) - selectedRequest.durationDays);
          const newRemainingDays = Math.max(0, ((balData as any).remainingDays || 0) - selectedRequest.durationDays);
          const newAllocatedLeave = (balData.allocatedLeave || 0) + selectedRequest.durationDays;
          const newUsedDays = ((balData as any).usedDays || 0) + selectedRequest.durationDays;

          batch.update(balanceRef, {
            pendingLeave: pendingLeaveVal,
            pendingDays: pendingDaysVal,
            currentBalance: newCurrentBalance,
            remainingDays: newRemainingDays,
            allocatedLeave: newAllocatedLeave,
            usedDays: newUsedDays,
            updatedAt: serverTimestamp()
          } as any);

          // Write ledger audit record
          const adjRef = doc(collection(firestore, 'leave_balance_adjustments'));
          batch.set(adjRef, {
            employeeId: selectedRequest.employeeId,
            employeeName: selectedRequest.employeeName,
            brandId: selectedRequest.brandId || '',
            brandName: selectedRequest.brandName || '',
            divisionId: selectedRequest.divisionId || '',
            divisionName: selectedRequest.divisionName || '',
            previousBalance: balData.currentBalance || 0,
            newBalance: newCurrentBalance,
            adjustmentValue: -selectedRequest.durationDays,
            reason: `Cuti ${selectedRequest.leaveType === 'tahunan' ? 'Tahunan' : selectedRequest.leaveType === 'besar' ? 'Besar' : selectedRequest.leaveType === 'menikah' ? 'Menikah' : selectedRequest.leaveType === 'melahirkan' ? 'Melahirkan' : 'Tahunan'} disetujui HRD`,
            type: 'cuti_disetujui',
            adjustedBy: userProfile.uid,
            adjustedByName: userProfile.fullName,
            createdAt: serverTimestamp()
          });
        } else {
          // Rejection or revision releases pending leave only
          batch.update(balanceRef, {
            pendingLeave: pendingLeaveVal,
            pendingDays: pendingDaysVal,
            updatedAt: serverTimestamp()
          });
        }
      }

      await batch.commit();

      // Trigger leave notification
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
        title: actionType === 'approve' ? "Cuti Disetujui (Final)" : (actionType === 'reject' ? "Cuti Ditolak" : "Revisi Dikirim"),
        description: `Pengajuan cuti ${selectedRequest.employeeName} berhasil diselesaikan.`
      });

      setIsActionOpen(false);
      setIsDetailOpen(false);
      mutateRequests();
      mutateBalances();
      mutateAdjustments();
    } catch (e: any) {
      toast({ variant: 'destructive', title: "Gagal Memproses Cuti", description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  // Balance manual adjustment workflow (strictly for special overrides)
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
      const prevBalVal = selectedBalance.currentBalance || 0;
      const prevRemaining = (selectedBalance as any).remainingDays || 0;
      const newBalVal = prevBalVal + adjustmentValue;
      const newRemaining = prevRemaining + adjustmentValue;

      if (newBalVal < 0) {
        toast({ variant: 'destructive', title: "Validasi Gagal", description: "Saldo akhir tidak boleh kurang dari 0." });
        setIsSaving(false);
        return;
      }

      const prevAllowance = selectedBalance.initialQuota || 0;
      const prevAnnual = (selectedBalance as any).annualAllowance || 0;
      const newAllowance = prevAllowance + (adjustmentValue > 0 ? adjustmentValue : 0);
      const newAnnual = prevAnnual + (adjustmentValue > 0 ? adjustmentValue : 0);

      const batch = writeBatch(firestore);

      // Update currentBalance and initialQuota (both sets of fields for safety)
      batch.update(balanceRef, {
        currentBalance: newBalVal,
        remainingDays: newRemaining,
        initialQuota: newAllowance,
        annualAllowance: newAnnual,
        updatedAt: serverTimestamp()
      } as any);

      // Write adjustment history log
      const adjRef = doc(collection(firestore, 'leave_balance_adjustments'));
      batch.set(adjRef, {
        employeeId: selectedBalance.employeeId,
        employeeName: selectedBalance.employeeName,
        brandId: (selectedBalance as any).brandId || '',
        brandName: (selectedBalance as any).brandName || '',
        divisionId: (selectedBalance as any).divisionId || '',
        divisionName: (selectedBalance as any).divisionName || '',
        previousBalance: prevBalVal,
        newBalance: newBalVal,
        adjustmentValue: adjustmentValue,
        reason: adjustmentReason,
        type: 'penyesuaian_manual',
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
      case 'approved':
      case 'approved_by_hrd': return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600';
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
      case 'approved':
      case 'approved_by_hrd': return 'Disetujui HRD';
      case 'active_leave': return 'Cuti Aktif';
      case 'completed': return 'Cuti Selesai';
      case 'cancelled': return 'Dibatalkan';
      default: return status;
    }
  };

  // Calendar render helpers
  const handlePrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(calendarYear - 1);
    } else {
      setCalendarMonth(calendarMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(calendarYear + 1);
    } else {
      setCalendarMonth(calendarMonth + 1);
    }
  };

  // Custom calendar matrix computation (Standard premium month calendar)
  const calendarCells = useMemo(() => {
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();

    const cells: Date[] = [];
    // Previous month padding
    const prevMonth = calendarMonth === 0 ? 11 : calendarMonth - 1;
    const prevYear = calendarMonth === 0 ? calendarYear - 1 : calendarYear;
    const daysInPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate();

    for (let i = firstDay - 1; i >= 0; i--) {
      cells.push(new Date(prevYear, prevMonth, daysInPrevMonth - i));
    }
    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      cells.push(new Date(calendarYear, calendarMonth, i));
    }
    // Next month padding to reach full standard grid of 42 cells
    const nextMonth = calendarMonth === 11 ? 0 : calendarMonth + 1;
    const nextYear = calendarMonth === 11 ? calendarYear + 1 : calendarYear;
    const remainingCells = 42 - cells.length;
    for (let i = 1; i <= remainingCells; i++) {
      cells.push(new Date(nextYear, nextMonth, i));
    }
    return cells;
  }, [calendarMonth, calendarYear]);

  const getActiveRequestsForDate = (date: Date) => {
    if (!requests) return [];
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);

    return requests.filter(r => {
      if (!['approved', 'approved_by_hrd', 'active_leave', 'completed'].includes(r.status)) return false;
      try {
        const start = r.startDate.toDate();
        start.setHours(0, 0, 0, 0);
        const end = r.endDate.toDate();
        end.setHours(23, 59, 59, 999);
        return target >= start && target <= end;
      } catch {
        return false;
      }
    });
  };

  // List of active/approved leaves during this exact month
  const activeLeavesThisMonthList = useMemo(() => {
    if (!requests) return [];
    return requests.filter(r => {
      if (!['approved', 'approved_by_hrd', 'active_leave', 'completed'].includes(r.status)) return false;
      try {
        const start = r.startDate.toDate();
        return start.getMonth() === calendarMonth && start.getFullYear() === calendarYear;
      } catch {
        return false;
      }
    }).sort((a, b) => a.startDate.toDate().getTime() - b.startDate.toDate().getTime());
  }, [requests, calendarMonth, calendarYear]);

  const getMonthName = (monthIdx: number) => {
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    return months[monthIdx];
  };

  if (isLoadingRequests || isLoadingBalances || isLoadingAdjustments) {
    return (
      <DashboardLayout pageTitle="Persetujuan Cuti HRD">
        <div className="flex flex-col justify-center items-center h-64 gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
          <p className="text-sm font-medium text-slate-400">Menyinkronkan data cuti karyawan...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout pageTitle="Workspace Monitoring Cuti HRD">
      {/* FULL-WIDTH premium layout wrapping after sidebar */}
      <div className="w-full space-y-6 px-4 md:px-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-600/10">
              <Calendar className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Workspace Cuti & Saldo Karyawan</h1>
                <Badge className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-black border border-indigo-100/80 hover:bg-indigo-50 text-[10px] uppercase">HRD Workspace</Badge>
              </div>
              <p className="text-xs text-slate-400 font-semibold mt-0.5">Pantau realisasi cuti, finalisasi approval secara otomatis, dan kelola audit mutasi lintas brand.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className={`rounded-xl font-bold text-xs gap-1.5 px-4 h-10 border transition-all ${
                showFilters || filterBrand !== 'all' || filterDivision !== 'all' || filterStatus !== 'all'
                  ? 'border-indigo-600 text-indigo-600 bg-indigo-50/40' 
                  : 'hover:bg-slate-50'
              }`}
            >
              <Filter className="h-4 w-4" /> Filters {showFilters ? 'Tutup' : 'Buka'}
            </Button>
          </div>
        </div>

        {/* TOP SUMMARY CARDS PANEL */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          
          <Card className="border-indigo-100/60 dark:border-indigo-950/40 shadow-sm hover:shadow-md transition-all bg-gradient-to-br from-indigo-500/5 to-transparent relative overflow-hidden group">
            <CardContent className="pt-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Menunggu Approval HRD</p>
                  <p className="text-3xl font-black text-indigo-600 dark:text-indigo-400 mt-2">{pendingHrdCount}</p>
                </div>
                <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
                  <UserCheck className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 text-[10px] text-indigo-500 font-black tracking-wider uppercase bg-indigo-500/5 py-1 px-2 rounded w-fit">Antrean Validasi</div>
            </CardContent>
          </Card>

          <Card className="border-emerald-100/60 dark:border-emerald-950/40 shadow-sm hover:shadow-md transition-all bg-gradient-to-br from-emerald-500/5 to-transparent relative overflow-hidden group">
            <CardContent className="pt-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Disetujui Bulan Ini</p>
                  <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-2">{approvedThisMonthCount}</p>
                </div>
                <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 text-[10px] text-emerald-600 font-black tracking-wider uppercase bg-emerald-500/5 py-1 px-2 rounded w-fit">Periode Aktif</div>
            </CardContent>
          </Card>

          <Card className="border-blue-100/60 dark:border-blue-950/40 shadow-sm hover:shadow-md transition-all bg-gradient-to-br from-blue-500/5 to-transparent relative overflow-hidden group">
            <CardContent className="pt-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cuti Aktif Hari Ini</p>
                  <p className="text-3xl font-black text-blue-600 dark:text-blue-400 mt-2">{activeTodayCount}</p>
                </div>
                <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 rounded-xl text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
                  <Sparkles className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 text-[10px] text-blue-600 font-black tracking-wider uppercase bg-blue-500/5 py-1 px-2 rounded w-fit">Realisasi Lapangan</div>
            </CardContent>
          </Card>

          <Card className="border-violet-100/60 dark:border-violet-950/40 shadow-sm hover:shadow-md transition-all bg-gradient-to-br from-violet-500/5 to-transparent relative overflow-hidden group">
            <CardContent className="pt-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Hari Terpakai</p>
                  <div className="flex items-baseline gap-1.5 mt-2">
                    <span className="text-3xl font-black text-violet-600 dark:text-violet-400">{totalUsedDays}</span>
                    <span className="text-xs font-bold text-slate-400">Hari</span>
                  </div>
                </div>
                <div className="p-2.5 bg-violet-50 dark:bg-violet-950/40 rounded-xl text-violet-600 dark:text-violet-400 group-hover:scale-110 transition-transform">
                  <FileClock className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 text-[10px] text-violet-600 font-black tracking-wider uppercase bg-violet-500/5 py-1 px-2 rounded w-fit">Kumulatif HRP</div>
            </CardContent>
          </Card>

          <Card className="border-amber-100/60 dark:border-amber-950/40 shadow-sm hover:shadow-md transition-all bg-gradient-to-br from-amber-500/5 to-transparent relative overflow-hidden group">
            <CardContent className="pt-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo Hampir Habis (≤2)</p>
                  <p className="text-3xl font-black text-amber-600 dark:text-amber-400 mt-2">{lowBalanceEmployees.length}</p>
                </div>
                <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 rounded-xl text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform">
                  <AlertTriangle className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 text-[10px] text-amber-600 font-black tracking-wider uppercase bg-amber-500/5 py-1 px-2 rounded w-fit">Peringatan Kuota</div>
            </CardContent>
          </Card>

        </div>

        {/* COLLAPSIBLE INTERACTIVE FILTER SECTION */}
        {showFilters && (
          <Card className="border-slate-100 dark:border-slate-800 shadow-md rounded-2xl overflow-hidden animate-in slide-in-from-top duration-300">
            <CardHeader className="border-b bg-slate-50/50 dark:bg-slate-900/50 py-3 px-6">
              <div className="flex items-center gap-2 text-indigo-600 font-black text-xs uppercase tracking-wider">
                <Filter className="h-4 w-4" /> Filter Monitoring Lintas Divisi & Brand
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                
                {/* 1. Brand Filter */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Filter Brand</label>
                  <select
                    value={filterBrand}
                    onChange={e => setFilterBrand(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-bold text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="all">Semua Brand (Default)</option>
                    {brandOptions.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>

                {/* 2. Division Filter */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Filter Divisi</label>
                  <select
                    value={filterDivision}
                    onChange={e => setFilterDivision(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-bold text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="all">Semua Divisi</option>
                    {divisionOptions.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                {/* 3. Leave Type Filter */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Jenis Cuti</label>
                  <select
                    value={filterLeaveType}
                    onChange={e => setFilterLeaveType(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-bold text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="all">Semua Cuti</option>
                    <option value="tahunan">Cuti Tahunan</option>
                    <option value="besar">Cuti Besar</option>
                    <option value="menikah">Cuti Menikah</option>
                    <option value="melahirkan">Cuti Melahirkan</option>
                  </select>
                </div>

                {/* 4. Status Filter */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Status Pengajuan</label>
                  <select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-bold text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="all">Semua Status</option>
                    <option value="pending_hrd">Antrean HRD</option>
                    <option value="approved">Disetujui HRD</option>
                    <option value="rejected_by_hrd">Ditolak HRD</option>
                    <option value="revision_requested_by_hrd">Revisi HRD</option>
                  </select>
                </div>

                {/* 5. Search Text Input */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Pencarian Nama Karyawan</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Masukkan nama staf..."
                      value={filterSearch}
                      onChange={e => setFilterSearch(e.target.value)}
                      className="pl-9 rounded-xl text-xs font-semibold"
                    />
                  </div>
                </div>

                {/* 6. Atasan Manager Reviewer */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Manager Penyetuju</label>
                  <select
                    value={filterManager}
                    onChange={e => setFilterManager(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-bold text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="all">Semua Atasan</option>
                    {managerOptions.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>

                {/* 7. Month Filter */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Bulan Cuti</label>
                  <select
                    value={filterMonth}
                    onChange={e => setFilterMonth(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-bold text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="all">Semua Bulan</option>
                    <option value="0">Januari</option>
                    <option value="1">Februari</option>
                    <option value="2">Maret</option>
                    <option value="3">April</option>
                    <option value="4">Mei</option>
                    <option value="5">Juni</option>
                    <option value="6">Juli</option>
                    <option value="7">Agustus</option>
                    <option value="8">September</option>
                    <option value="9">Oktober</option>
                    <option value="10">November</option>
                    <option value="11">Desember</option>
                  </select>
                </div>

                {/* 8. Year Filter */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Tahun Cuti</label>
                  <select
                    value={filterYear}
                    onChange={e => setFilterYear(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-bold text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="all">Semua Tahun</option>
                    <option value="2024">2024</option>
                    <option value="2025">2025</option>
                    <option value="2026">2026</option>
                    <option value="2027">2027</option>
                  </select>
                </div>

              </div>
              
              <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setFilterBrand('all');
                    setFilterDivision('all');
                    setFilterLeaveType('all');
                    setFilterStatus('all');
                    setFilterSearch('');
                    setFilterManager('all');
                    setFilterMonth('all');
                    setFilterYear('all');
                  }}
                  className="rounded-xl font-bold text-xs"
                >
                  Reset Filter
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* WORKSPACE TABS SECTION */}
        <Tabs defaultValue="pending" className="w-full">
          <TabsList className="grid w-full grid-cols-5 rounded-2xl bg-slate-100 dark:bg-slate-950 p-1 mb-6 h-12 shadow-sm border border-slate-200/40">
            <TabsTrigger value="pending" className="rounded-xl font-bold text-xs gap-1.5 transition-all py-2">
              Persetujuan Cuti HRD
              <Badge className="bg-indigo-600 text-white font-black text-[9px] rounded-full px-1.5 py-0.5">{activeRequestsFiltered.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="history" className="rounded-xl font-bold text-xs transition-all py-2">Semua Pengajuan Cuti</TabsTrigger>
            <TabsTrigger value="balances" className="rounded-xl font-bold text-xs transition-all py-2">Saldo Cuti Karyawan</TabsTrigger>
            <TabsTrigger value="adjustments" className="rounded-xl font-bold text-xs transition-all py-2">Mutasi Saldo Cuti</TabsTrigger>
            <TabsTrigger value="calendar" className="rounded-xl font-bold text-xs transition-all py-2 gap-1.5">
              Kalender Cuti <Badge className="bg-blue-600 text-white font-black text-[9px] rounded-full px-1.5 py-0.5">{activeLeavesThisMonthList.length}</Badge>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: PERSETUJUAN CUTI HRD (Pending Queue) */}
          <TabsContent value="pending" className="space-y-6 focus:outline-none">
            <Card className="border-slate-100 dark:border-slate-800 shadow-md rounded-2xl overflow-hidden">
              <CardHeader className="border-b pb-4 bg-slate-50/50 dark:bg-slate-900/50 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-black uppercase tracking-wider text-indigo-600 flex items-center gap-2">
                    Menunggu Verifikasi & Final Approval HRD
                  </CardTitle>
                  <CardDescription className="text-xs font-semibold text-slate-400 mt-1">Staf berikut telah disetujui atasan divisi masing-masing dan menunggu persetujuan HRD.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto w-full">
                  <Table className="w-full min-w-[1100px]">
                    <TableHeader className="bg-slate-50/20 dark:bg-slate-900/10">
                      <TableRow>
                        <TableHead className="pl-8 py-4 font-bold text-slate-800 dark:text-slate-200">Karyawan</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Brand / Divisi</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Jenis Cuti</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Periode Cuti</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Durasi</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Status Atasan</TableHead>
                        <TableHead className="text-right pr-8 py-4 font-bold text-slate-800 dark:text-slate-200">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeRequestsFiltered.length > 0 ? activeRequestsFiltered.map(r => {
                        const profile = employeeProfilesMap.get(r.employeeId);
                        const rBrand = r.brandName || profile?.hrdEmploymentInfo?.brandName || profile?.hrdEmploymentInfo?.brand || '-';
                        const rDivision = r.divisionName || profile?.hrdEmploymentInfo?.divisionName || profile?.hrdEmploymentInfo?.division || '-';
                        
                        return (
                          <TableRow key={r.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-900/10 transition-colors border-b border-slate-100 dark:border-slate-800/80">
                            <TableCell className="pl-8 py-5">
                              <span className="text-slate-800 dark:text-white font-black text-sm block">{r.employeeName}</span>
                            </TableCell>
                            <TableCell className="py-5 font-bold text-slate-500 text-xs uppercase tracking-wider">
                              <div className="flex flex-col">
                                <span>{rBrand}</span>
                                <span className="text-[10px] text-slate-400 font-semibold">{rDivision}</span>
                              </div>
                            </TableCell>
                            <TableCell className="py-5 text-xs font-bold text-indigo-500 capitalize">
                              Cuti {r.leaveType === 'tahunan' ? 'Tahunan' : r.leaveType === 'besar' ? 'Besar' : r.leaveType === 'menikah' ? 'Menikah' : r.leaveType === 'melahirkan' ? 'Melahirkan' : 'Tahunan'}
                            </TableCell>
                            <TableCell className="py-5 text-xs text-slate-500 font-semibold">
                              {format(r.startDate.toDate(), 'dd MMM yyyy', { locale: idLocale })} - {format(r.endDate.toDate(), 'dd MMM yyyy', { locale: idLocale })}
                            </TableCell>
                            <TableCell className="py-5 font-black text-slate-700 dark:text-slate-200 text-sm">
                              {r.durationDays} Hari Kerja
                            </TableCell>
                            <TableCell className="py-5 text-xs text-emerald-600 font-black">
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1">
                                  <UserCheck className="h-3.5 w-3.5" /> Disetujui {r.managerName || '-'}
                                </div>
                                {r.managerReviewedAt && (
                                  <span className="text-[9px] text-slate-400 font-semibold ml-4">
                                    {format(r.managerReviewedAt.toDate(), "EEEE, dd MMMM yyyy 'pukul' HH:mm", { locale: idLocale })}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right pr-8 py-5">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button variant="ghost" size="sm" onClick={() => handleViewDetails(r)} className="rounded-xl hover:bg-slate-100 font-bold text-xs gap-1">
                                  <Eye className="h-3.5 w-3.5" /> Tinjau
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => handleOpenAction('approve', r)} className="rounded-xl border-emerald-500/20 hover:bg-emerald-50 text-emerald-600 font-bold text-xs">
                                  Setujui
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => handleOpenAction('reject', r)} className="rounded-xl border-red-500/20 hover:bg-red-50 text-red-600 font-bold text-xs">
                                  Tolak
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => handleOpenAction('revise', r)} className="rounded-xl border-amber-500/20 hover:bg-amber-50 text-amber-600 font-bold text-xs">
                                  Revisi
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      }) : (
                        <TableRow>
                          <TableCell colSpan={7} className="h-44 text-center text-slate-400">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <CheckCircle2 className="h-10 w-10 text-emerald-500 opacity-60" />
                              <p className="text-sm font-bold">Luar Biasa! Semua antrean approval cuti HRD telah bersih.</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: SEMUA PENGAJUAN CUTI (Leaves request history) */}
          <TabsContent value="history" className="space-y-6 focus:outline-none">
            <Card className="border-slate-100 dark:border-slate-800 shadow-md rounded-2xl overflow-hidden">
              <CardHeader className="border-b pb-4 bg-slate-50/50 dark:bg-slate-900/50">
                <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-500">Seluruh Riwayat Keputusan Cuti Karyawan</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto w-full">
                  <Table className="w-full min-w-[1100px]">
                    <TableHeader className="bg-slate-50/20 dark:bg-slate-900/10">
                      <TableRow>
                        <TableHead className="pl-8 py-4 font-bold text-slate-800 dark:text-slate-200">Karyawan</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Brand / Divisi</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Jenis Cuti</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Periode Cuti</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Durasi</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Status</TableHead>
                        <TableHead className="text-right pr-8 py-4 font-bold text-slate-800 dark:text-slate-200">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historyRequestsFiltered.length > 0 ? historyRequestsFiltered.map(r => {
                        const profile = employeeProfilesMap.get(r.employeeId);
                        const rBrand = r.brandName || profile?.hrdEmploymentInfo?.brandName || profile?.hrdEmploymentInfo?.brand || '-';
                        const rDivision = r.divisionName || profile?.hrdEmploymentInfo?.divisionName || profile?.hrdEmploymentInfo?.division || '-';
                        
                        return (
                          <TableRow key={r.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-900/10 transition-colors border-b border-slate-100 dark:border-slate-800/80">
                            <TableCell className="pl-8 py-5">
                              <span className="text-slate-800 dark:text-white font-black text-sm block">{r.employeeName}</span>
                            </TableCell>
                            <TableCell className="py-5 font-bold text-slate-500 text-xs uppercase tracking-wider">
                              <div className="flex flex-col">
                                <span>{rBrand}</span>
                                <span className="text-[10px] text-slate-400 font-semibold">{rDivision}</span>
                              </div>
                            </TableCell>
                            <TableCell className="py-5 text-xs font-bold text-indigo-500 capitalize">
                              Cuti {r.leaveType === 'tahunan' ? 'Tahunan' : r.leaveType === 'besar' ? 'Besar' : r.leaveType === 'menikah' ? 'Menikah' : r.leaveType === 'melahirkan' ? 'Melahirkan' : 'Tahunan'}
                            </TableCell>
                            <TableCell className="py-5 text-xs text-slate-500 font-semibold">
                              {format(r.startDate.toDate(), 'dd MMM yyyy', { locale: idLocale })} - {format(r.endDate.toDate(), 'dd MMM yyyy', { locale: idLocale })}
                            </TableCell>
                            <TableCell className="py-5 font-black text-slate-700 dark:text-slate-200 text-sm">
                              {r.durationDays} Hari Kerja
                            </TableCell>
                            <TableCell className="py-5">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-wider ${getStatusBadgeClass(r.status)}`}>
                                {getStatusLabel(r.status)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right pr-8 py-5">
                              <Button variant="ghost" size="sm" onClick={() => handleViewDetails(r)} className="rounded-xl hover:bg-slate-100 font-bold text-xs gap-1">
                                <Eye className="h-3.5 w-3.5" /> Detail
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      }) : (
                        <TableRow>
                          <TableCell colSpan={7} className="h-28 text-center text-slate-400">
                            Belum ada riwayat pengajuan cuti yang terdaftar.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: SALDO CUTI KARYAWAN (Employee Balances) */}
          <TabsContent value="balances" className="space-y-6 focus:outline-none">
            <Card className="border-slate-100 dark:border-slate-800 shadow-md rounded-2xl overflow-hidden">
              <CardHeader className="border-b pb-4 bg-slate-50/50 dark:bg-slate-900/50">
                <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-500">Kuota Tahunan & Sisa Saldo Cuti Staf</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto w-full">
                  <Table className="w-full min-w-[1100px]">
                    <TableHeader className="bg-slate-50/20 dark:bg-slate-900/10">
                      <TableRow>
                        <TableHead className="pl-8 py-4 font-bold text-slate-800 dark:text-slate-200">Nama Karyawan</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Brand / Divisi</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Tipe</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Kuota Awal</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Cuti Disetujui</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Dalam Approval</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Sisa Saldo</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Estimasi Cashout</TableHead>
                        <TableHead className="text-right pr-8 py-4 font-bold text-slate-800 dark:text-slate-200">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBalances.length > 0 ? filteredBalances.map(b => {
                        const profile = employeeProfilesMap.get(b.employeeId);
                        const bBrand = (b as any).brandName || profile?.hrdEmploymentInfo?.brandName || profile?.hrdEmploymentInfo?.brand || '-';
                        const bDivision = (b as any).divisionName || profile?.hrdEmploymentInfo?.divisionName || profile?.hrdEmploymentInfo?.division || '-';
                        const lowBal = b.currentBalance <= 2;
                        
                        return (
                          <TableRow key={b.employeeId} className="hover:bg-slate-50/30 dark:hover:bg-slate-900/10 transition-colors border-b border-slate-100 dark:border-slate-800/80">
                            <TableCell className="pl-8 py-5">
                              <span className="text-slate-800 dark:text-white font-black text-sm block">{b.employeeName}</span>
                            </TableCell>
                            <TableCell className="py-5 font-bold text-slate-500 text-xs uppercase tracking-wider">
                              <div className="flex flex-col">
                                <span>{bBrand}</span>
                                <span className="text-[10px] text-slate-400 font-semibold">{bDivision}</span>
                              </div>
                            </TableCell>
                            <TableCell className="py-5 text-xs font-black uppercase tracking-widest text-slate-400">
                              {b.employmentType || profile?.hrdEmploymentInfo?.employeeType || '-'}
                            </TableCell>
                            <TableCell className="py-5 font-bold text-slate-600 text-sm">
                              {b.initialQuota !== undefined ? b.initialQuota : (b as any).annualAllowance} Hari
                            </TableCell>
                            <TableCell className="py-5 font-bold text-emerald-600 text-sm">
                              {b.allocatedLeave !== undefined ? b.allocatedLeave : (b as any).usedDays} Hari
                            </TableCell>
                            <TableCell className="py-5 font-bold text-amber-500 text-sm">
                              {b.pendingLeave !== undefined ? b.pendingLeave : (b as any).pendingDays} Hari
                            </TableCell>
                            <TableCell className="py-5 py-5 font-black text-sm">
                              <span className={lowBal ? 'text-red-500 animate-pulse' : 'text-indigo-600 dark:text-indigo-400'}>
                                {b.currentBalance !== undefined ? b.currentBalance : (b as any).remainingDays} Hari
                              </span>
                            </TableCell>
                            <TableCell className="py-5 text-xs font-black text-emerald-600">
                              Rp {((b.currentBalance !== undefined ? b.currentBalance : ((b as any).remainingDays ?? 0)) * ratePerDay).toLocaleString('id-ID')}
                            </TableCell>
                            <TableCell className="text-right pr-8 py-5">
                              <Button size="sm" variant="ghost" onClick={() => handleOpenAdjustment(b)} className="rounded-xl hover:bg-indigo-50 hover:text-indigo-600 font-bold text-xs gap-1">
                                <Settings className="h-3.5 w-3.5" /> Sesuaikan Saldo
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      }) : (
                        <TableRow>
                          <TableCell colSpan={9} className="h-28 text-center text-slate-400">
                            Belum ada rekap saldo cuti karyawan yang sesuai kriteria.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 4: MUTASI SALDO CUTI (Audit logs ledger) */}
          <TabsContent value="adjustments" className="space-y-6 focus:outline-none">
            <Card className="border-slate-100 dark:border-slate-800 shadow-md rounded-2xl overflow-hidden">
              <CardHeader className="border-b pb-4 bg-slate-50/50 dark:bg-slate-900/50">
                <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-500">Ledger Log Audit Mutasi Saldo Cuti</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto w-full">
                  <Table className="w-full min-w-[1100px]">
                    <TableHeader className="bg-slate-50/20 dark:bg-slate-900/10">
                      <TableRow>
                        <TableHead className="pl-8 py-4 font-bold text-slate-800 dark:text-slate-200">Tanggal & Jam</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Karyawan</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Brand / Divisi</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Jenis Mutasi</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Perubahan</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Saldo (Awal → Baru)</TableHead>
                        <TableHead className="py-4 font-bold text-slate-800 dark:text-slate-200">Alasan Perubahan</TableHead>
                        <TableHead className="text-right pr-8 py-4 font-bold text-slate-800 dark:text-slate-200">Operator</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedAdjustmentsFiltered.length > 0 ? sortedAdjustmentsFiltered.map(a => {
                        const profile = employeeProfilesMap.get(a.employeeId);
                        const bBrand = a.brandName || profile?.hrdEmploymentInfo?.brandName || profile?.hrdEmploymentInfo?.brand || '-';
                        const bDivision = a.divisionName || profile?.hrdEmploymentInfo?.divisionName || profile?.hrdEmploymentInfo?.division || '-';
                        
                        // Parse mutation type for nice badges
                        const isPositive = a.adjustmentValue > 0;
                        const isCuti = a.reason?.toLowerCase().includes('cuti') && a.reason?.toLowerCase().includes('setujui');
                        const isInit = a.reason?.toLowerCase().includes('inisialisasi') || a.adjustedBy === 'system';
                        
                        let mutationBadge = 'Koreksi Saldo';
                        let mutationColor = 'bg-blue-500/10 border-blue-500/20 text-blue-600';
                        if (isCuti) {
                          mutationBadge = 'Pengurangan Cuti';
                          mutationColor = 'bg-rose-500/10 border-rose-500/20 text-rose-600';
                        } else if (isInit) {
                          mutationBadge = 'Inisialisasi Kuota';
                          mutationColor = 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600';
                        }

                        return (
                          <TableRow key={a.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-900/10 transition-colors border-b border-slate-100 dark:border-slate-800/80">
                            <TableCell className="pl-8 py-5 text-xs font-semibold text-slate-500">
                              {a.createdAt ? format(a.createdAt.toDate(), 'dd MMM yyyy HH:mm', { locale: idLocale }) : '-'}
                            </TableCell>
                            <TableCell className="py-5 font-black text-slate-800 dark:text-white text-sm">
                              {a.employeeName}
                            </TableCell>
                            <TableCell className="py-5 font-bold text-slate-400 text-xs uppercase tracking-wider">
                              <div className="flex flex-col">
                                <span>{bBrand}</span>
                                <span className="text-[10px] font-semibold">{bDivision}</span>
                              </div>
                            </TableCell>
                            <TableCell className="py-5">
                              <Badge variant="outline" className={`font-black text-[9px] rounded-full uppercase ${mutationColor}`}>
                                {mutationBadge}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-5 font-black text-sm">
                              <span className={isPositive ? 'text-emerald-600' : 'text-red-500'}>
                                {isPositive ? `+${a.adjustmentValue}` : a.adjustmentValue} Hari
                              </span>
                            </TableCell>
                            <TableCell className="py-5 font-bold text-slate-500 text-xs">
                              {a.previousBalance} → {a.newBalance} Hari
                            </TableCell>
                            <TableCell className="py-5 text-xs font-medium text-slate-600 dark:text-slate-300 max-w-[240px] truncate" title={a.reason}>
                              {a.reason}
                            </TableCell>
                            <TableCell className="text-right pr-8 py-5 font-bold text-slate-500 text-xs">
                              {a.adjustedByName || 'System'}
                            </TableCell>
                          </TableRow>
                        );
                      }) : (
                        <TableRow>
                          <TableCell colSpan={8} className="h-28 text-center text-slate-400">
                            Belum ada catatan mutasi saldo cuti yang sesuai kriteria.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 5: KALENDER CUTI (Visual Month schedule view) */}
          <TabsContent value="calendar" className="space-y-6 focus:outline-none">
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
              
              {/* Calendar Visual Grid (3/4 width) */}
              <Card className="xl:col-span-3 border-slate-100 dark:border-slate-800 shadow-md rounded-2xl overflow-hidden bg-white">
                <CardHeader className="border-b bg-slate-50/50 dark:bg-slate-900/50 py-4 px-6 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-indigo-600" />
                    <div>
                      <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-700">Jadwal Kehadiran & Kalender Cuti</CardTitle>
                      <CardDescription className="text-xs font-semibold mt-0.5">Visibilitas jadwal cuti aktif staf Environesia.</CardDescription>
                    </div>
                  </div>
                  
                  {/* Calendar Navigators */}
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="h-9 w-9 rounded-xl hover:bg-slate-100">
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs font-black uppercase text-indigo-600 px-3 tracking-widest min-w-[120px] text-center">
                      {getMonthName(calendarMonth)} {calendarYear}
                    </span>
                    <Button variant="ghost" size="icon" onClick={handleNextMonth} className="h-9 w-9 rounded-xl hover:bg-slate-100">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  
                  {/* Grid week names */}
                  <div className="grid grid-cols-7 gap-1 text-center font-black text-[10px] text-slate-400 uppercase tracking-widest mb-2 border-b pb-2">
                    <div>Minggu</div>
                    <div>Senin</div>
                    <div>Selasa</div>
                    <div>Rabu</div>
                    <div>Kamis</div>
                    <div>Jumat</div>
                    <div>Sabtu</div>
                  </div>

                  {/* 42 grid cells */}
                  <div className="grid grid-cols-7 gap-1.5 h-[520px]">
                    {calendarCells.map((cellDate, idx) => {
                      const activeOnDay = getActiveRequestsForDate(cellDate);
                      const isCurrMonth = cellDate.getMonth() === calendarMonth;
                      
                      const today = new Date();
                      const isTodayVal = cellDate.getDate() === today.getDate() && cellDate.getMonth() === today.getMonth() && cellDate.getFullYear() === today.getFullYear();
                      
                      return (
                        <div
                          key={idx}
                          className={`p-1.5 rounded-xl border flex flex-col justify-between transition-all group/cell relative ${
                            isCurrMonth
                              ? 'bg-white border-slate-100 hover:border-indigo-200' 
                              : 'bg-slate-50/50 border-slate-50 text-slate-300 pointer-events-none'
                          } ${isTodayVal ? 'ring-2 ring-indigo-600 ring-offset-1 border-indigo-200' : ''}`}
                        >
                          {/* Cell Date Header */}
                          <div className="flex justify-between items-center mb-1">
                            <span className={`text-xs font-bold ${isTodayVal ? 'text-indigo-600 font-black' : (isCurrMonth ? 'text-slate-700' : 'text-slate-300')}`}>
                              {cellDate.getDate()}
                            </span>
                            {isTodayVal && (
                              <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />
                            )}
                          </div>

                          {/* List of leaves */}
                          <div className="flex-1 overflow-y-auto space-y-1 pr-0.5 custom-scrollbar max-h-[60px]">
                            {activeOnDay.slice(0, 3).map(r => (
                              <div
                                key={r.id}
                                onClick={() => handleViewDetails(r)}
                                className="cursor-pointer border-l-2 border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400 text-[9px] py-0.5 px-1 rounded font-black max-w-full truncate hover:bg-indigo-100 transition-colors"
                                title={`${r.employeeName}: Cuti ${r.leaveType}`}
                              >
                                {r.employeeName}
                              </div>
                            ))}
                            {activeOnDay.length > 3 && (
                              <div className="text-[8px] text-slate-400 font-bold text-center">
                                +{activeOnDay.length - 3} Cuti Lagi
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                </CardContent>
              </Card>

              {/* Sidebar: Month Leaves list (1/4 width) */}
              <Card className="xl:col-span-1 border-slate-100 dark:border-slate-800 shadow-md rounded-2xl overflow-hidden bg-slate-50/40">
                <CardHeader className="border-b bg-slate-50/50 dark:bg-slate-900/50 py-4 px-6">
                  <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-indigo-600" />
                    Cuti Aktif Bulan Ini
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 h-[530px] overflow-y-auto space-y-3">
                  {activeLeavesThisMonthList.length > 0 ? activeLeavesThisMonthList.map(r => {
                    const profile = employeeProfilesMap.get(r.employeeId);
                    const bBrand = r.brandName || profile?.hrdEmploymentInfo?.brandName || profile?.hrdEmploymentInfo?.brand || '-';
                    const bDivision = r.divisionName || profile?.hrdEmploymentInfo?.divisionName || profile?.hrdEmploymentInfo?.division || '-';
                    
                    return (
                      <div
                        key={r.id}
                        onClick={() => handleViewDetails(r)}
                        className="p-3 bg-white border border-slate-100 rounded-xl hover:border-indigo-100 hover:shadow-sm transition-all cursor-pointer space-y-2 group"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-black text-slate-800 text-xs group-hover:text-indigo-600 transition-colors">{r.employeeName}</p>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{bBrand} — {bDivision}</p>
                          </div>
                          <Badge variant="outline" className={`px-2 py-0.5 rounded-full text-[8px] font-black border uppercase tracking-wider ${getStatusBadgeClass(r.status)}`}>
                            Cuti {r.leaveType === 'tahunan' ? 'Tahunan' : r.leaveType}
                          </Badge>
                        </div>
                        
                        <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-50 font-bold">
                          <span>{format(r.startDate.toDate(), 'dd MMM')} - {format(r.endDate.toDate(), 'dd MMM yyyy')}</span>
                          <span className="text-indigo-600">{r.durationDays} Hari</span>
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 py-20">
                      <CalendarOff className="h-8 w-8 mb-2 opacity-30 text-slate-500" />
                      <p className="text-xs font-bold">Tidak ada pengajuan cuti</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">pada bulan {getMonthName(calendarMonth)} {calendarYear}.</p>
                    </div>
                  )}
                </CardContent>
              </Card>

            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* PREMIUM DETAILS VIEW TIMELINE DIALOG */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border-none shadow-2xl max-h-[85vh] flex flex-col my-auto top-[50%] translate-y-[-50%]">
          <DialogHeader className="p-6 pb-4 border-b bg-slate-50/50 dark:bg-slate-900/50 flex-none">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <DialogTitle className="text-lg font-black text-slate-900 dark:text-white">Detail Pengajuan Cuti Karyawan</DialogTitle>
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
                  {selectedRequest?.submittedAtStr || (selectedRequest?.createdAt ? format(selectedRequest.createdAt.toDate(), "EEEE, dd MMMM yyyy 'pukul' HH:mm", { locale: idLocale }) : '-')}
                </p>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Periode Cuti</p>
                <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                  {selectedRequest && format(selectedRequest.startDate.toDate(), 'EEEE, dd MMMM yyyy', { locale: idLocale })} s/d {selectedRequest && format(selectedRequest.endDate.toDate(), 'EEEE, dd MMMM yyyy', { locale: idLocale })}
                </p>
              </div>
            </div>

            {/* Dynamic display balance before and after approval */}
            {selectedRequest && selectedRequestBalance && (
              <div className="p-4 bg-gradient-to-r from-indigo-500/5 to-indigo-600/0 border border-indigo-100/50 rounded-2xl grid grid-cols-2 gap-4 text-center">
                <div className="border-r pr-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Sisa Saldo Saat Ini</p>
                  <p className="text-lg font-black text-slate-800 mt-1">{selectedRequestBalance.currentBalance} Hari</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Saldo Sesudah Approval</p>
                  <p className="text-lg font-black text-indigo-600 mt-1">
                    {['pending_hrd', 'pending_hrd_review'].includes(selectedRequest.status)
                      ? `${Math.max(0, selectedRequestBalance.currentBalance - selectedRequest.durationDays)} Hari`
                      : `${selectedRequestBalance.currentBalance} Hari`
                    }
                  </p>
                </div>
              </div>
            )}

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

            {/* 5. Stepper Timeline Alur Persetujuan (Asia/Jakarta Context) */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800/80 space-y-4">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Timeline Alur Persetujuan</p>
              <div className="relative pl-6 space-y-5 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-200 dark:before:bg-slate-800">
                
                {/* Milestone 1: Staff Submission */}
                <div className="relative">
                  <div className="absolute -left-[20px] top-1 h-[12px] w-[12px] rounded-full bg-emerald-500 ring-4 ring-white dark:ring-slate-900" />
                  <div className="text-xs font-bold text-slate-800 dark:text-white">Diajukan oleh Staff</div>
                  <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                    {selectedRequest?.submittedAtStr || (selectedRequest?.createdAt ? format(selectedRequest.createdAt.toDate(), "EEEE, dd MMMM yyyy 'pukul' HH:mm", { locale: idLocale }) : 'Sudah diajukan ke sistem.')}
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
                    {selectedRequest && !['pending_manager', 'pending_manager_review', 'rejected_by_manager', 'revision_requested', 'revision_requested_by_manager', 'cancelled'].includes(selectedRequest.status) && (
                      <div className="space-y-1">
                        <span>Disetujui Atasan pada {selectedRequest.managerReviewedAt ? format(selectedRequest.managerReviewedAt.toDate(), "EEEE, dd MMMM yyyy 'pukul' HH:mm", { locale: idLocale }) : '-'}</span>
                        {selectedRequest.managerNotes && <p className="italic text-slate-400 bg-slate-100 p-1.5 rounded text-[9px] mt-0.5">"{selectedRequest.managerNotes}"</p>}
                      </div>
                    )}
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
                    {selectedRequest && ['approved', 'approved_by_hrd', 'active_leave', 'completed'].includes(selectedRequest.status) && (
                      <div className="space-y-1">
                        <span>Disetujui HRD pada {selectedRequest.hrdReviewedAt ? format(selectedRequest.hrdReviewedAt.toDate(), "EEEE, dd MMMM yyyy 'pukul' HH:mm", { locale: idLocale }) : '-'}</span>
                        {selectedRequest.hrdNotes && <p className="italic text-slate-400 bg-slate-100 p-1.5 rounded text-[9px] mt-0.5">"{selectedRequest.hrdNotes}"</p>}
                      </div>
                    )}
                  </div>
                </div>

                {/* Milestone 4: Realisasi Status */}
                <div className="relative">
                  <div className={`absolute -left-[20px] top-1 h-[12px] w-[12px] rounded-full ring-4 ring-white dark:ring-slate-900 ${
                    selectedRequest && ['active_leave', 'completed'].includes(selectedRequest.status)
                      ? 'bg-emerald-500'
                      : (selectedRequest && ['approved', 'approved_by_hrd'].includes(selectedRequest.status)
                        ? 'bg-indigo-500 animate-pulse'
                        : 'bg-slate-300')
                  }`} />
                  <div className="text-xs font-bold text-slate-800 dark:text-white">Status Realisasi Cuti</div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                    {selectedRequest && ['approved', 'approved_by_hrd'].includes(selectedRequest.status) && 'Menunggu Tanggal Mulai Cuti'}
                    {selectedRequest?.status === 'active_leave' && 'Cuti Aktif (Sedang Berlangsung)'}
                    {selectedRequest?.status === 'completed' && 'Cuti Selesai'}
                    {selectedRequest && !['approved', 'approved_by_hrd', 'active_leave', 'completed'].includes(selectedRequest.status) && 'Belum Aktif'}
                  </div>
                </div>

              </div>
            </div>

            {selectedRequest?.attachmentUrl && (
              <div className="pt-2">
                <Button variant="outline" asChild className="w-full rounded-xl hover:bg-slate-50">
                  <a href={selectedRequest.attachmentUrl} target="_blank" rel="noopener noreferrer">
                    Lihat Dokumen Lampiran Pendukung
                  </a>
                </Button>
              </div>
            )}

            {/* Sticky Action Footer inside Modal */}
            {selectedRequest && ['pending_hrd', 'pending_hrd_review'].includes(selectedRequest.status) && (
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

      {/* Action Dialog (Approve/Reject/Revise) */}
      <Dialog open={isActionOpen} onOpenChange={setIsActionOpen}>
        <DialogContent className="max-w-md rounded-2xl bg-white dark:bg-slate-900 border-none shadow-2xl my-auto top-[50%] translate-y-[-50%]">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-slate-900 dark:text-white">
              {actionType === 'approve' ? 'Setujui Final Cuti' : (actionType === 'reject' ? 'Tolak Final Cuti' : 'Minta Revisi Cuti')}
            </DialogTitle>
            <DialogDescription className="text-xs font-semibold text-slate-500 mt-1">
              {actionType === 'approve' 
                ? 'Apakah Anda yakin ingin menyetujui final pengajuan cuti ini? Saldo cuti staf akan berkurang secara otomatis.' 
                : 'Harap berikan alasan/keterangan keputusan Anda di bawah ini secara ringkas.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <Textarea
              rows={3}
              placeholder={actionType === 'approve' ? "Catatan persetujuan final (opsional)..." : "Keterangan/alasan (wajib, minimal 5 karakter)..."}
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
        <DialogContent className="max-w-md rounded-2xl bg-white dark:bg-slate-900 border-none shadow-2xl my-auto top-[50%] translate-y-[-50%]">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-slate-900 dark:text-white">Sesuaikan Saldo Cuti Karyawan</DialogTitle>
            <DialogDescription className="text-xs font-semibold text-slate-500 mt-1">
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
