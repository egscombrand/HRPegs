'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { collection, query, doc, serverTimestamp, writeBatch, updateDoc } from 'firebase/firestore';
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
import { Label } from '@/components/ui/label';
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
  
  const [isSaving, setIsSaving] = useState(false);

  // Calendar State completely removed

  // Interactive filter state
  const [isCashoutOpen, setIsCashoutOpen] = useState(false);
  const [cashoutDays, setCashoutDays] = useState<number>(0);
  const [cashoutAmount, setCashoutAmount] = useState<number>(0);
  const [cashoutReason, setCashoutReason] = useState('Pencairan Nilai Cuti ke Payroll');
  
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

  // 5. Fetch master brands and divisions
  const brandsQuery = useMemoFirebase(() => collection(firestore, 'brands'), [firestore]);
  const { data: masterBrands } = useCollection<any>(brandsQuery);

  const divisionsQuery = useMemoFirebase(() => {
    if (filterBrand === 'all') return null;
    return collection(firestore, 'brands', filterBrand, 'divisions');
  }, [firestore, filterBrand]);
  const { data: masterDivisions } = useCollection<any>(divisionsQuery);

  // Filter unique dropdown options dynamically
  const brandOptions = useMemo(() => {
    const map = new Map<string, {id: string, name: string}>();
    if (masterBrands) {
      masterBrands.forEach(b => {
        if (b.name) map.set(b.id, { id: b.id, name: b.name });
      });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [masterBrands]);

  const divisionOptions = useMemo(() => {
    const map = new Map<string, {id: string, name: string, brandId: string}>();
    if (masterDivisions && filterBrand !== 'all') {
      masterDivisions.forEach(d => {
        if (d.name) map.set(d.id, { id: d.id, name: d.name, brandId: filterBrand });
      });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [masterDivisions, filterBrand]);

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
      const profile = employeeProfilesMap.get(r.employeeId);
      // 2. Brand
      if (filterBrand !== 'all') {
        const bBrandId = r.brandId || profile?.hrdEmploymentInfo?.brandId || profile?.brandId || '';
        if (bBrandId !== filterBrand) return false;
      }
      // 3. Division
      if (filterDivision !== 'all') {
        const fDivId = filterDivision.split('__')[1] || filterDivision;
        const bDivId = r.divisionId || profile?.hrdEmploymentInfo?.divisionId || profile?.divisionId || '';
        if (bDivId !== fDivId) return false;
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

  // Tab 3 List: Employee Quota balances filtered (Sourced from Employee Profiles to show uninitialized ones)
  const filteredBalances = useMemo(() => {
    if (!employeeProfiles) return [];
    
    const balanceMap = new Map<string, any>();
    if (balances) balances.forEach(b => balanceMap.set(b.employeeId, b));

    const eligible = employeeProfiles.filter(p => {
      const bEmploymentType = p.hrdEmploymentInfo?.employeeType || '';
      const contractMonths = p.hrdEmploymentInfo?.contractDurationMonths || 0;
      
      const isTetap = bEmploymentType.toLowerCase().includes('tetap');
      const isEligibleKontrak = bEmploymentType.toLowerCase().includes('kontrak') && contractMonths >= 12;
      
      if (!isTetap && !isEligibleKontrak) return false;

      // 1. Search text
      if (filterSearch) {
        if (!p.fullName?.toLowerCase().includes(filterSearch.toLowerCase())) return false;
      }

      // 2. Brand
      if (filterBrand !== 'all') {
        const bBrandId = p.hrdEmploymentInfo?.brandId || p.brandId || '';
        if (bBrandId !== filterBrand) return false;
      }
      // 3. Division
      if (filterDivision !== 'all') {
        const fDivId = filterDivision.split('__')[1] || filterDivision;
        const bDivId = p.hrdEmploymentInfo?.divisionId || p.divisionId || '';
        if (bDivId !== fDivId) return false;
      }
      return true;
    });

    return eligible.map(p => {
      const bal = balanceMap.get(p.uid || p.id);
      return { profile: p, balance: bal || null };
    });
  }, [employeeProfiles, balances, filterSearch, filterBrand, filterDivision]);

  // Tab 4 List: Audit Mutasi Saldo Cuti ledger logs filtered
  const sortedAdjustmentsFiltered = useMemo(() => {
    if (!adjustments) return [];
    
    const processed = adjustments.map(a => {
      const profile = employeeProfilesMap.get(a.employeeId);
      const bBrandId = (a as any).brandId || profile?.hrdEmploymentInfo?.brandId || profile?.brandId || '';
      const bDivisionId = (a as any).divisionId || profile?.hrdEmploymentInfo?.divisionId || profile?.divisionId || '';
      return {
        ...a,
        brandId: bBrandId,
        divisionId: bDivisionId,
        brandName: (a as any).brandName || profile?.hrdEmploymentInfo?.brandName || profile?.brandName || '-',
        divisionName: (a as any).divisionName || profile?.hrdEmploymentInfo?.divisionName || profile?.divisionName || '-'
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
        if (a.brandId !== filterBrand) return false;
      }
      // 3. Division
      if (filterDivision !== 'all') {
        const fDivId = filterDivision.split('__')[1] || filterDivision;
        if (a.divisionId !== fDivId) return false;
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



  const handleInitializeBalance = async (profile: any) => {
    if (!firestore || !userProfile) return;
    setIsSaving(true);
    try {
      const balanceRef = doc(firestore, 'leave_balances', profile.uid || profile.id);
      const bBrandId = profile.hrdEmploymentInfo?.brandId || profile.brandId || '';
      const bBrandName = profile.hrdEmploymentInfo?.brandName || profile.brandName || '';
      const bDivId = profile.hrdEmploymentInfo?.divisionId || profile.divisionId || '';
      const bDivName = profile.hrdEmploymentInfo?.divisionName || profile.divisionName || '';
      
      const newBal = {
        employeeId: profile.uid || profile.id,
        employeeName: profile.fullName || '',
        brandId: bBrandId,
        brandName: bBrandName,
        divisionId: bDivId,
        divisionName: bDivName,
        employmentType: profile.hrdEmploymentInfo?.employeeType || '',
        contractDurationMonths: profile.hrdEmploymentInfo?.contractDurationMonths || 0,
        initialQuota: 12, // Default
        allocatedLeave: 0,
        pendingLeave: 0,
        currentBalance: 12,
        annualAllowance: 12,
        usedDays: 0,
        pendingDays: 0,
        remainingDays: 12,
        cashoutRatePerDay: 0,
        updatedAt: serverTimestamp(),
      };
      
      const batch = writeBatch(firestore);
      batch.set(balanceRef, newBal);
      
      const adjRef = doc(collection(firestore, 'leave_balance_adjustments'));
      batch.set(adjRef, {
        employeeId: newBal.employeeId,
        employeeName: newBal.employeeName,
        brandId: newBal.brandId,
        brandName: newBal.brandName,
        divisionId: newBal.divisionId,
        divisionName: newBal.divisionName,
        previousBalance: 0,
        newBalance: 12,
        adjustmentValue: 12,
        reason: 'Inisialisasi kuota cuti tahunan awal',
        type: 'inisialisasi_kuota',
        adjustedBy: userProfile.uid,
        adjustedByName: userProfile.fullName,
        createdAt: serverTimestamp()
      });
      
      await batch.commit();
      toast({ title: "Saldo Diinisialisasi", description: `Saldo cuti ${profile.fullName} berhasil dibuat.` });
      mutateBalances();
      mutateAdjustments();
    } catch(e:any) {
      toast({ variant: 'destructive', title: "Gagal Inisialisasi", description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenCashout = (bal: any, profile: any) => {
    setSelectedBalance(bal);
    setCashoutDays(0);
    setCashoutAmount(0);
    setCashoutReason('');
    setIsCashoutOpen(true);
  };

  const handleConfirmCashout = async () => {
    if (!selectedBalance || !userProfile || !firestore) return;
    if (cashoutDays <= 0) {
      toast({ variant: 'destructive', title: "Validasi Gagal", description: "Jumlah hari untuk dicashout harus lebih dari 0." });
      return;
    }
    if (cashoutAmount <= 0) {
      toast({ variant: 'destructive', title: "Validasi Gagal", description: "Nominal cashout harus lebih dari 0." });
      return;
    }
    const prevRemaining = (selectedBalance as any).remainingDays || selectedBalance.currentBalance || 0;
    if (cashoutDays > prevRemaining) {
      toast({ variant: 'destructive', title: "Validasi Gagal", description: "Hari yang dicashout melebihi sisa saldo saat ini." });
      return;
    }
    setIsSaving(true);
    try {
      const balanceRef = doc(firestore, 'leave_balances', selectedBalance.employeeId);
      const newRemaining = prevRemaining - cashoutDays;

      const batch = writeBatch(firestore);

      batch.update(balanceRef, {
        currentBalance: newRemaining,
        remainingDays: newRemaining,
        updatedAt: serverTimestamp()
      } as any);

      const adjRef = doc(collection(firestore, 'leave_balance_adjustments'));
      batch.set(adjRef, {
        employeeId: selectedBalance.employeeId,
        employeeName: selectedBalance.employeeName,
        brandId: (selectedBalance as any).brandId || '',
        brandName: (selectedBalance as any).brandName || '',
        divisionId: (selectedBalance as any).divisionId || '',
        divisionName: (selectedBalance as any).divisionName || '',
        previousBalance: prevRemaining,
        newBalance: newRemaining,
        adjustmentValue: -cashoutDays,
        cashoutAmount: cashoutAmount,
        reason: cashoutReason,
        type: 'cashout_cuti',
        adjustedBy: userProfile.uid,
        adjustedByName: userProfile.fullName,
        createdAt: serverTimestamp()
      });

      await batch.commit();

      toast({ title: "Cashout Berhasil", description: `Saldo cuti ${selectedBalance.employeeName} dikurangi ${cashoutDays} hari sejumlah Rp ${cashoutAmount.toLocaleString('id-ID')}.` });
      setIsCashoutOpen(false);
      mutateBalances();
      mutateAdjustments();
    } catch (e: any) {
      toast({ variant: 'destructive', title: "Gagal", description: e.message });
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
              <div className="mt-3 text-[10px] text-indigo-500 font-black tracking-wider uppercase bg-indigo-500/5 py-1 px-2 rounded w-fit">Menunggu Keputusan</div>
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
              <div className="mt-3 text-[10px] text-emerald-600 font-black tracking-wider uppercase bg-emerald-500/5 py-1 px-2 rounded w-fit">Direncanakan & Berjalan</div>
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
              <div className="mt-3 text-[10px] text-blue-600 font-black tracking-wider uppercase bg-blue-500/5 py-1 px-2 rounded w-fit">Sedang Menjalani Cuti</div>
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
              <div className="mt-3 text-[10px] text-violet-600 font-black tracking-wider uppercase bg-violet-500/5 py-1 px-2 rounded w-fit">Total Keseluruhan Cuti</div>
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
              <div className="mt-3 text-[10px] text-amber-600 font-black tracking-wider uppercase bg-amber-500/5 py-1 px-2 rounded w-fit">Butuh Perhatian</div>
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
                    onChange={e => {
                      setFilterBrand(e.target.value);
                      setFilterDivision('all');
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-bold text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="all">Semua Brand (Default)</option>
                    {brandOptions.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                {/* 2. Division Filter */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Filter Divisi</label>
                  <select
                    value={filterDivision}
                    onChange={e => setFilterDivision(e.target.value)}
                    disabled={filterBrand === 'all'}
                    className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-bold text-slate-700 focus:border-indigo-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="all">{filterBrand === 'all' ? 'Pilih brand terlebih dahulu' : (divisionOptions.length === 0 ? 'Brand ini belum memiliki divisi' : 'Semua Divisi')}</option>
                    {divisionOptions.map(d => (
                      <option key={`${d.brandId}-${d.id}`} value={`${d.brandId}__${d.id}`}>{d.name}</option>
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
          <TabsList className="grid w-full grid-cols-4 rounded-2xl bg-slate-100 dark:bg-slate-950 p-1 mb-6 h-12 shadow-sm border border-slate-200/40">
            <TabsTrigger value="pending" className="rounded-xl font-bold text-xs gap-1.5 transition-all py-2">
              Persetujuan Cuti HRD
              <Badge className="bg-indigo-600 text-white font-black text-[9px] rounded-full px-1.5 py-0.5">{activeRequestsFiltered.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="history" className="rounded-xl font-bold text-xs transition-all py-2">Semua Pengajuan Cuti</TabsTrigger>
            <TabsTrigger value="balances" className="rounded-xl font-bold text-xs transition-all py-2">Saldo & Hak Cuti</TabsTrigger>
            <TabsTrigger value="adjustments" className="rounded-xl font-bold text-xs transition-all py-2">Mutasi Saldo Cuti</TabsTrigger>
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
                        <TableHead className="text-right pr-8 py-4 font-bold text-slate-800 dark:text-slate-200">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBalances.length > 0 ? filteredBalances.map(item => {
                        const { profile, balance: b } = item as { profile: any, balance: any };
                        const bBrand = b?.brandName || profile?.hrdEmploymentInfo?.brandName || profile?.brandName || '-';
                        const bDivision = b?.divisionName || profile?.hrdEmploymentInfo?.divisionName || profile?.divisionName || '-';
                        const employeeName = profile?.fullName || profile?.name || profile?.displayName || profile?.personalData?.fullName || profile?.dataDiriIdentitas?.namaLengkap || profile?.email || b?.employeeName || 'Nama belum tersedia';
                        
                        const initQuota = b ? (b.initialQuota !== undefined ? b.initialQuota : (b as any).annualAllowance || 0) : 0;
                        const usedLeave = b ? (b.allocatedLeave !== undefined ? b.allocatedLeave : (b as any).usedDays || 0) : 0;
                        const pendLeave = b ? (b.pendingLeave !== undefined ? b.pendingLeave : (b as any).pendingDays || 0) : 0;
                        const currBal = b ? (b.currentBalance !== undefined ? b.currentBalance : (b as any).remainingDays || 0) : 0;
                        const lowBal = currBal <= 2;

                        const empCashoutRate = b?.cashoutRatePerDay || profile?.hrdEmploymentInfo?.cashoutRatePerDay || 0;
                        
                        return (
                          <TableRow key={profile.uid || profile.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-900/10 transition-colors border-b border-slate-100 dark:border-slate-800/80">
                            <TableCell className="pl-8 py-5">
                              <span className="text-slate-800 dark:text-white font-black text-sm block">{employeeName}</span>
                            </TableCell>
                            <TableCell className="py-5 font-bold text-slate-500 text-xs uppercase tracking-wider">
                              <div className="flex flex-col">
                                <span>{bBrand}</span>
                                <span className="text-[10px] text-slate-400 font-semibold">{bDivision}</span>
                              </div>
                            </TableCell>
                            <TableCell className="py-5 text-xs font-black uppercase tracking-widest text-slate-400">
                              {b?.employmentType || profile?.hrdEmploymentInfo?.employeeType || '-'}
                            </TableCell>
                            <TableCell className="py-5 font-bold text-slate-600 text-sm">
                              {b ? `${initQuota} Hari` : '-'}
                            </TableCell>
                            <TableCell className="py-5 font-bold text-emerald-600 text-sm">
                              {b ? `${usedLeave} Hari` : '-'}
                            </TableCell>
                            <TableCell className="py-5 font-bold text-amber-500 text-sm">
                              {b ? `${pendLeave} Hari` : '-'}
                            </TableCell>
                            <TableCell className="py-5 py-5 font-black text-sm">
                              {b ? (
                                <span className={lowBal ? 'text-red-500 animate-pulse' : 'text-indigo-600 dark:text-indigo-400'}>
                                  {currBal} Hari
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-amber-500 bg-amber-50 px-2 py-1 rounded border border-amber-200">Belum Inisialisasi</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right pr-8 py-5">
                              <div className="flex items-center justify-end gap-2">
                                {b ? (
                                  <Button size="sm" variant="outline" onClick={() => handleOpenCashout(b, profile)} className="rounded-xl font-bold text-[10px] text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200">
                                    Proses Cashout
                                  </Button>
                                ) : (
                                  <Button size="sm" variant="outline" onClick={() => handleInitializeBalance(profile)} className="rounded-xl border-amber-200 text-amber-600 font-bold text-[10px] hover:bg-amber-50">
                                    Inisialisasi Saldo
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      }) : (
                        <TableRow>
                          <TableCell colSpan={8} className="h-28 text-center text-slate-400">
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {sortedAdjustmentsFiltered.length > 0 ? sortedAdjustmentsFiltered.map(a => {
                const profile = employeeProfilesMap.get(a.employeeId);
                const bBrand = a.brandName || profile?.hrdEmploymentInfo?.brandName || profile?.hrdEmploymentInfo?.brand || '-';
                const bDivision = a.divisionName || profile?.hrdEmploymentInfo?.divisionName || profile?.hrdEmploymentInfo?.division || '-';
                
                const isPositive = a.adjustmentValue > 0;
                let mutationBadge = a.type === 'cashout_cuti' ? 'Cashout Cuti' : 'Pengurangan Cuti';
                let mutationColor = 'bg-blue-500/10 border-blue-500/20 text-blue-600';
                
                if (a.reason?.toLowerCase().includes('cuti') && a.reason?.toLowerCase().includes('setujui')) {
                  mutationBadge = 'Cuti Disetujui HRD';
                  mutationColor = 'bg-rose-500/10 border-rose-500/20 text-rose-600';
                } else if (a.reason?.toLowerCase().includes('inisialisasi') || a.adjustedBy === 'system' || a.type === 'inisialisasi_kuota') {
                  mutationBadge = 'Jatah Cuti Tahunan Dibuat Otomatis';
                  mutationColor = 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600';
                } else if (a.type === 'cashout_cuti') {
                  mutationBadge = 'Pencairan Sisa Cuti Ke Payroll';
                  mutationColor = 'bg-amber-500/10 border-amber-500/20 text-amber-600';
                }

                return (
                  <Card key={a.id} className="border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-indigo-100 dark:hover:border-indigo-900 transition-all rounded-2xl overflow-hidden group">
                    <CardHeader className="p-4 pb-0 bg-slate-50/50 dark:bg-slate-900/30 flex flex-row items-center justify-between border-b border-slate-50 dark:border-slate-800">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">
                          {a.createdAt ? format(a.createdAt.toDate(), 'dd MMM yyyy HH:mm', { locale: idLocale }) : '-'}
                        </span>
                        <h3 className="font-black text-slate-800 dark:text-white text-sm line-clamp-1">{a.employeeName}</h3>
                      </div>
                      <Badge variant="outline" className={`font-black text-[9px] rounded-full uppercase ml-2 flex-shrink-0 ${mutationColor}`}>
                        {mutationBadge}
                      </Badge>
                    </CardHeader>
                    <CardContent className="p-4 pt-4 space-y-4">
                      
                      <div className="flex items-start justify-between">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Brand & Divisi</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300 text-xs">{bBrand}</span>
                          <span className="text-[10px] text-slate-500 font-semibold">{bDivision}</span>
                        </div>
                        
                        <div className="flex flex-col items-end text-right">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Perubahan</span>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-400 text-xs line-through">{a.previousBalance}</span>
                            <span className="text-slate-300">→</span>
                            <span className="font-black text-slate-800 dark:text-white text-sm">{a.newBalance}</span>
                            <span className={`font-black text-xs ml-1 px-1.5 py-0.5 rounded ${isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                              {isPositive ? `+${a.adjustmentValue}` : a.adjustmentValue}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Catatan / Alasan</span>
                        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 leading-snug line-clamp-2" title={a.reason}>
                          {a.reason}
                        </p>
                      </div>
                      
                      {a.type === 'cashout_cuti' && a.cashoutAmount && (
                         <div className="bg-amber-50/50 border border-amber-100 rounded-lg p-2.5 flex justify-between items-center mt-2">
                           <span className="text-[10px] font-black text-amber-600 uppercase tracking-wider">Nilai Pencairan</span>
                           <span className="text-xs font-black text-amber-700">Rp {a.cashoutAmount.toLocaleString('id-ID')}</span>
                         </div>
                      )}

                      <div className="flex justify-between items-center pt-2">
                        <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Dilakukan Oleh</span>
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded-md">{a.adjustedByName ? `${a.adjustedByName}` : 'Sistem'}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              }) : (
                <div className="col-span-full h-40 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                  <p className="text-slate-500 font-bold text-sm">Belum ada catatan mutasi saldo yang terdaftar.</p>
                </div>
              )}
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

      {/* Cashout Modal */}
      <Dialog open={isCashoutOpen} onOpenChange={setIsCashoutOpen}>
        <DialogContent className="max-w-md rounded-2xl bg-white dark:bg-slate-900 border-none shadow-2xl my-auto top-[50%] translate-y-[-50%]">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-slate-900 dark:text-white">Proses Cashout Cuti Tahunan</DialogTitle>
            <DialogDescription className="text-xs font-semibold text-slate-500 mt-1">
              Uangkan sisa cuti {selectedBalance?.employeeName} ke dalam nominal pencairan ke payroll.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl space-y-2 border border-slate-100 dark:border-slate-800">
               <div className="flex justify-between items-center text-sm">
                 <span className="font-semibold text-slate-500">Sisa Cuti Tersedia</span>
                 <span className="font-black text-indigo-600">{selectedBalance ? ((selectedBalance as any).remainingDays || selectedBalance.currentBalance || 0) : 0} Hari</span>
               </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500">Jumlah Hari Diuangkan</Label>
              <Input type="number" min={0} value={cashoutDays} onChange={e => setCashoutDays(Number(e.target.value))} className="h-12 bg-slate-50 border-slate-200 font-bold" />
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500">Total Nominal Cashout (Rp)</Label>
              <Input type="number" min={0} value={cashoutAmount} onChange={e => setCashoutAmount(Number(e.target.value))} placeholder="Contoh: 200000" className="h-12 border-emerald-200 focus:border-emerald-500 font-bold" />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-500 uppercase">Catatan Pencairan (Opsional)</label>
              <Textarea
                rows={2}
                placeholder="Catatan HRD..."
                value={cashoutReason}
                onChange={e => setCashoutReason(e.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setIsCashoutOpen(false)} className="rounded-xl font-bold">Batal</Button>
            <Button onClick={handleConfirmCashout} disabled={isSaving || cashoutDays <= 0 || cashoutAmount <= 0} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl px-5">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Proses Cashout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  );
}
