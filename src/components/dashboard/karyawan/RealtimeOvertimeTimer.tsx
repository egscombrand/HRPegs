'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import {
  doc,
  serverTimestamp,
  Timestamp,
  updateDoc,
  deleteDoc,
  arrayUnion,
} from 'firebase/firestore';
import type { OvertimeSubmission } from '@/lib/types';
import { sendNotification } from '@/lib/notifications';
import {
  Play,
  Pause,
  Square,
  Send,
  Trash2,
  ChevronDown,
  ChevronUp,
  PlusCircle,
  Eye,
  CheckCircle2,
  Pencil,
  Info,
} from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { GoogleDatePicker } from '@/components/ui/google-date-picker';

interface CoordinatorInfo {
  uid: string;
  fullName?: string;
  displayName?: string;
  positionTitle?: string;
  role?: string;
  structuralLevel?: string;
}

interface ManagerInfo {
  uid: string;
  name: string;
  divisionName?: string;
}

export interface EmployeeDisplayInfo {
  fullName?: string;
  brandName?: string;
  division?: string;
  positionTitle?: string;
  employmentStatus?: string;
}

export interface RealtimeOvertimeTimerProps {
  submission: OvertimeSubmission;
  onSubmitted: () => void;
  onCancelled: () => void;
  eligibleCoordinators?: CoordinatorInfo[];
  resolvedDivisionManager?: ManagerInfo | null;
  employeeDisplayInfo?: EmployeeDisplayInfo;
}

type TaskItem = { description: string; estimatedMinutes: number };

const workLocationOptions = [
  { value: 'kantor', label: 'Kantor' },
  { value: 'rumah_wfh', label: 'Rumah / WFH' },
  { value: 'luar_kantor', label: 'Luar Kantor' },
  { value: 'site_klien', label: 'Site / Lokasi Klien' },
  { value: 'lainnya', label: 'Lainnya' },
] as const;

type WorkLocationValue = (typeof workLocationOptions)[number]['value'];

function normalizeWorkLocation(value?: string | null): WorkLocationValue {
  if (value === 'remote') return 'rumah_wfh';
  if (value === 'site') return 'site_klien';
  if (workLocationOptions.some((option) => option.value === value)) {
    return value as WorkLocationValue;
  }
  return 'kantor';
}

function getWorkLocationLabel(value?: string | null, detail?: string | null) {
  const normalized = normalizeWorkLocation(value);
  const label =
    workLocationOptions.find((option) => option.value === normalized)?.label ||
    'Kantor';
  const cleanDetail = detail?.trim();
  return normalized === 'lainnya' && cleanDetail
    ? `${label} - ${cleanDetail}`
    : label;
}

const PAUSE_REASONS = [
  'Istirahat',
  'Makan',
  'Sholat',
  'Menunggu arahan',
  'Gangguan teknis',
  'Kegiatan di luar pekerjaan lembur',
  'Lainnya',
];

function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0 menit';
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hrs > 0 && mins > 0) return `${hrs} jam ${mins} menit`;
  if (hrs > 0) return `${hrs} jam`;
  return `${mins} menit`;
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [
    String(h).padStart(2, '0'),
    String(m).padStart(2, '0'),
    String(s).padStart(2, '0'),
  ].join(':');
}

function timestampToHHmm(ts: Timestamp): string {
  const d = ts.toDate();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function RealtimeOvertimeTimer({
  submission,
  onSubmitted,
  onCancelled,
  eligibleCoordinators = [],
  resolvedDivisionManager = null,
  employeeDisplayInfo,
}: RealtimeOvertimeTimerProps) {
  const firestore = useFirestore();
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const clearRealtimeDraftCache = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!userProfile?.uid) return;
    window.localStorage.removeItem(`overtime-realtime-draft:${userProfile.uid}`);
  }, [userProfile?.uid]);

  const docRef = useMemoFirebase(
    () => doc(firestore, 'overtime_submissions', submission.id!),
    [firestore, submission.id],
  );
  const { data: liveDoc } = useDoc<OvertimeSubmission>(docRef);
  const live = (liveDoc ?? submission) as OvertimeSubmission;
  const timerStatus = (live as any).timerStatus ?? 'draft';

  // ── Draft form state (initialized once from submission) ──
  const [tasks, setTasks] = useState<TaskItem[]>(() => {
    const src = submission.tasks || (submission as any).taskDetails || [];
    if (src.length > 0)
      return src.map((t: any) => ({
        description: t.description || '',
        estimatedMinutes: t.estimatedMinutes ?? 60,
      }));
    return [{ description: '', estimatedMinutes: 60 }];
  });
  const [overtimeDate, setOvertimeDate] = useState<Date>(() => {
    const d = (submission as any).overtimeDate ?? submission.date;
    if (d && typeof d.toDate === 'function') return d.toDate();
    if (d instanceof Date) return d;
    return new Date();
  });
  const [overtimeType, setOvertimeType] = useState<
    'hari_kerja' | 'hari_libur' | 'urgent'
  >(submission.overtimeType ?? 'hari_kerja');
  const [location, setLocation] = useState<WorkLocationValue>(
    normalizeWorkLocation(submission.location),
  );
  const [workLocationDetail, setWorkLocationDetail] = useState(
    () => (submission as any).workLocationDetail ?? '',
  );
  const [reasonNotes, setReasonNotes] = useState(submission.reason ?? '');

  // ── Draft UI ──
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [showPreviewPlan, setShowPreviewPlan] = useState(false);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [isSavingStart, setIsSavingStart] = useState(false);

  // ── Timer counters ──
  const [grossElapsedSec, setGrossElapsedSec] = useState(0);
  const grossIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pauseElapsedSec, setPauseElapsedSec] = useState(0);
  const pauseIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Pause dialog ──
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [pauseReason, setPauseReason] = useState('');
  const [pauseNote, setPauseNote] = useState('');
  const [isSavingPause, setIsSavingPause] = useState(false);
  const [isSavingResume, setIsSavingResume] = useState(false);

  // ── Finish ──
  const [isSavingFinish, setIsSavingFinish] = useState(false);

  // ── Submit preview ──
  const [selectedCoordinatorUid, setSelectedCoordinatorUid] = useState(
    () => (submission as any).overtimeCoordinatorUid ?? '',
  );
  const [isSavingSubmit, setIsSavingSubmit] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editTasks, setEditTasks] = useState<TaskItem[]>([]);
  const [editReason, setEditReason] = useState('');

  // ── Misc ──
  const [showPauseLogs, setShowPauseLogs] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // ── Derived pause data ──
  const pauseLogs = useMemo(
    () =>
      (((live as any).pauseLogs as Array<{
        startedAt: Timestamp;
        endedAt?: Timestamp | null;
        reason: string;
        note?: string;
        durationSeconds?: number;
        durationMinutes?: number;
      }>) ?? []),
    [(live as any).pauseLogs],
  );

  const activePauseStartedAt =
    ((live as any).pauseStartedAt as Timestamp | null | undefined) ?? null;
  const activePauseReason = (live as any).currentPauseReason as string | undefined;
  const activePauseNote = (live as any).currentPauseNote as string | undefined;

  const completedPausedMs = useMemo(
    () =>
      pauseLogs.reduce((sum, log) => {
        if (typeof log.durationSeconds === 'number') {
          return sum + Math.max(0, log.durationSeconds * 1000);
        }
        if (typeof log.durationMinutes === 'number') {
          return sum + Math.max(0, log.durationMinutes * 60000);
        }
        if (log.endedAt)
          return (
            sum + (log.endedAt.toDate().getTime() - log.startedAt.toDate().getTime())
          );
        return sum;
      }, 0),
    [pauseLogs],
  );

  // ── Gross elapsed counter ──
  const computeGross = useCallback(() => {
    const started = (live as any).timerStartedAt as Timestamp | null | undefined;
    if (!started) return 0;
    return Math.max(0, Math.floor((Date.now() - started.toDate().getTime()) / 1000));
  }, [(live as any).timerStartedAt]);

  useEffect(() => {
    if (timerStatus === 'running' || timerStatus === 'paused') {
      setGrossElapsedSec(computeGross());
      grossIntervalRef.current = setInterval(
        () => setGrossElapsedSec(computeGross()),
        1000,
      );
    } else {
      if (grossIntervalRef.current) {
        clearInterval(grossIntervalRef.current);
        grossIntervalRef.current = null;
      }
      const started = (live as any).timerStartedAt as Timestamp | null | undefined;
      if (started) setGrossElapsedSec(computeGross());
    }
    return () => {
      if (grossIntervalRef.current) clearInterval(grossIntervalRef.current);
    };
  }, [timerStatus, computeGross]);

  // ── Current pause elapsed counter ──
  const currentPauseStartMs = useMemo(() => {
    if (timerStatus !== 'paused') return null;
    if (activePauseStartedAt) return activePauseStartedAt.toDate().getTime();
    const last = pauseLogs[pauseLogs.length - 1];
    if (last && !last.endedAt) return last.startedAt.toDate().getTime();
    return null;
  }, [timerStatus, activePauseStartedAt, pauseLogs]);

  useEffect(() => {
    if (currentPauseStartMs === null) {
      setPauseElapsedSec(0);
      if (pauseIntervalRef.current) {
        clearInterval(pauseIntervalRef.current);
        pauseIntervalRef.current = null;
      }
      return;
    }
    const update = () =>
      setPauseElapsedSec(Math.floor((Date.now() - currentPauseStartMs) / 1000));
    update();
    pauseIntervalRef.current = setInterval(update, 1000);
    return () => {
      if (pauseIntervalRef.current) clearInterval(pauseIntervalRef.current);
    };
  }, [currentPauseStartMs]);

  const completedPausedSec = Math.floor(completedPausedMs / 1000);
  const totalPausedSec =
    completedPausedSec + (timerStatus === 'paused' ? pauseElapsedSec : 0);
  const netElapsedSec = Math.max(0, grossElapsedSec - totalPausedSec);

  // ── HANDLERS ──

  const handleSaveDraft = async () => {
    if (!tasks.some((t) => t.description.trim())) {
      toast({
        variant: 'destructive',
        title: 'Isi minimal satu deskripsi pekerjaan',
      });
      return;
    }
    if (location === 'lainnya' && !workLocationDetail.trim()) {
      toast({
        variant: 'destructive',
        title: 'Detail lokasi kerja wajib diisi',
      });
      return;
    }
    setIsSavingDraft(true);
    try {
      const coordinator = eligibleCoordinators.find(c => c.uid === selectedCoordinatorUid);
      await updateDoc(docRef!, {
        overtimeDate: Timestamp.fromDate(overtimeDate),
        overtimeType,
        location,
        workLocation: location,
        workLocationDetail:
          location === 'lainnya' ? workLocationDetail.trim() : '',
        workLocationLabel: getWorkLocationLabel(location, workLocationDetail),
        overtimeTypeLabel:
          overtimeType === 'hari_kerja'
            ? 'Hari Kerja'
            : overtimeType === 'hari_libur'
              ? 'Hari Libur'
              : 'Urgent',
        tasks: tasks.filter((t) => t.description.trim()),
        taskDetails: tasks.filter((t) => t.description.trim()),
        reason: reasonNotes.trim(),
        overtimeCoordinatorUid: selectedCoordinatorUid || null,
        overtimeCoordinatorName: coordinator?.fullName || coordinator?.displayName || null,
        overtimeCoordinatorPosition: coordinator?.positionTitle || coordinator?.structuralLevel || coordinator?.role || null,
        updatedAt: serverTimestamp(),
      });
      toast({ title: 'Draft disimpan' });
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal menyimpan draft',
        description: e.message,
      });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleStartTimer = async () => {
    if (location === 'lainnya' && !workLocationDetail.trim()) {
      toast({
        variant: 'destructive',
        title: 'Detail lokasi kerja wajib diisi',
      });
      return;
    }
    setIsSavingStart(true);
    try {
      const coordinator = eligibleCoordinators.find(c => c.uid === selectedCoordinatorUid);
      await updateDoc(docRef!, {
        timerStatus: 'running',
        timerStartedAt: serverTimestamp(),
        status: 'timer_running',
        approvalStatus: 'timer_running',
        overtimeDate: Timestamp.fromDate(overtimeDate),
        overtimeType,
        location,
        workLocation: location,
        workLocationDetail:
          location === 'lainnya' ? workLocationDetail.trim() : '',
        workLocationLabel: getWorkLocationLabel(location, workLocationDetail),
        overtimeTypeLabel:
          overtimeType === 'hari_kerja'
            ? 'Hari Kerja'
            : overtimeType === 'hari_libur'
              ? 'Hari Libur'
              : 'Urgent',
        tasks: tasks.filter((t) => t.description.trim()),
        taskDetails: tasks.filter((t) => t.description.trim()),
        reason: reasonNotes.trim(),
        overtimeCoordinatorUid: selectedCoordinatorUid || null,
        overtimeCoordinatorName: coordinator?.fullName || coordinator?.displayName || null,
        overtimeCoordinatorPosition: coordinator?.positionTitle || coordinator?.structuralLevel || coordinator?.role || null,
        pauseLogs: [],
        totalPausedDurationMinutes: 0,
        updatedAt: serverTimestamp(),
      });
      setShowStartConfirm(false);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal memulai timer',
        description: e.message,
      });
    } finally {
      setIsSavingStart(false);
    }
  };

  const handleConfirmPause = async () => {
    if (!pauseReason) {
      toast({ variant: 'destructive', title: 'Pilih alasan jeda' });
      return;
    }
    setIsSavingPause(true);
    try {
      const pauseStartedAt = Timestamp.now();
      await updateDoc(docRef!, {
        timerStatus: 'paused',
        status: 'timer_paused',
        approvalStatus: 'timer_paused',
        pauseStartedAt,
        currentPauseReason: pauseReason,
        currentPauseNote: pauseNote.trim() || null,
        updatedAt: serverTimestamp(),
      });
      setShowPauseDialog(false);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal menjeda timer',
        description: e.message,
      });
    } finally {
      setIsSavingPause(false);
    }
  };

  const handleResume = async () => {
    setIsSavingResume(true);
    try {
      const endedAt = Timestamp.now();
      const startedAt =
        activePauseStartedAt ||
        pauseLogs
          .slice()
          .reverse()
          .find((log) => log.startedAt && !log.endedAt)?.startedAt ||
        endedAt;
      const durationSeconds = Math.max(
        0,
        Math.floor(
          (endedAt.toDate().getTime() - startedAt.toDate().getTime()) / 1000,
        ),
      );
      const completedLogs = pauseLogs.filter((log) => log.endedAt);
      const logs = [
        ...completedLogs,
        {
          startedAt,
          endedAt,
          reason: activePauseReason || pauseReason || 'Jeda',
          note: activePauseNote || null,
          durationSeconds,
          durationMinutes: Math.round(durationSeconds / 60),
        },
      ];
      await updateDoc(docRef!, {
        timerStatus: 'running',
        status: 'timer_running',
        approvalStatus: 'timer_running',
        pauseLogs: logs,
        pauseStartedAt: null,
        currentPauseReason: null,
        currentPauseNote: null,
        updatedAt: serverTimestamp(),
      });
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal melanjutkan timer',
        description: e.message,
      });
    } finally {
      setIsSavingResume(false);
    }
  };

  const handleFinish = async () => {
    setIsSavingFinish(true);
    try {
      const now = Timestamp.now();
      const started = (live as any).timerStartedAt as Timestamp | null | undefined;
      const startMs = started?.toDate().getTime() ?? Date.now();
      const grossMs = now.toDate().getTime() - startMs;
      const grossMinutes = Math.round(grossMs / 60000);
      const activePauseMs =
        timerStatus === 'paused' && activePauseStartedAt
          ? Math.max(
              0,
              now.toDate().getTime() - activePauseStartedAt.toDate().getTime(),
            )
          : 0;
      const pausedMinutes = Math.round((completedPausedMs + activePauseMs) / 60000);
      const netMinutes = Math.max(0, grossMinutes - pausedMinutes);
      const logsForFinish =
        timerStatus === 'paused' && activePauseStartedAt
          ? [
              ...pauseLogs.filter((log) => log.endedAt),
              {
                startedAt: activePauseStartedAt,
                endedAt: now,
                reason: activePauseReason || 'Jeda',
                note: activePauseNote || null,
                durationSeconds: Math.max(0, Math.floor(activePauseMs / 1000)),
                durationMinutes: Math.round(activePauseMs / 60000),
              },
            ]
          : pauseLogs;

      await updateDoc(docRef!, {
        timerStatus: 'finished_pending_submit',
        timerFinishedAt: now,
        status: 'timer_finished_pending_submit',
        approvalStatus: 'timer_finished_pending_submit',
        totalGrossDurationMinutes: grossMinutes,
        totalPausedDurationMinutes: pausedMinutes,
        totalNetDurationMinutes: netMinutes,
        pauseLogs: logsForFinish,
        pauseStartedAt: null,
        currentPauseReason: null,
        currentPauseNote: null,
        updatedAt: serverTimestamp(),
      });
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal menyelesaikan timer',
        description: e.message,
      });
    } finally {
      setIsSavingFinish(false);
    }
  };

  const handleSaveEditedNotes = async () => {
    try {
      await updateDoc(docRef!, {
        tasks: editTasks.filter((t) => t.description.trim()),
        taskDetails: editTasks.filter((t) => t.description.trim()),
        reason: editReason.trim(),
        updatedAt: serverTimestamp(),
      });
      setIsEditingNotes(false);
      toast({ title: 'Catatan diperbarui' });
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal menyimpan catatan',
        description: e.message,
      });
    }
  };

  const handleFinalSubmit = async () => {
    if (!selectedCoordinatorUid) {
      toast({
        variant: 'destructive',
        title: 'Pilih Koordinator/Pengawas Lembur',
      });
      return;
    }
    const started = (live as any).timerStartedAt as Timestamp | null | undefined;
    const finished = (live as any).timerFinishedAt as Timestamp | null | undefined;
    if (!started || !finished) {
      toast({ variant: 'destructive', title: 'Data timer tidak lengkap' });
      return;
    }
    setIsSavingSubmit(true);
    try {
      const coordinator = eligibleCoordinators.find(
        (c) => c.uid === selectedCoordinatorUid,
      );
      const isSame =
        !!resolvedDivisionManager?.uid &&
        selectedCoordinatorUid === resolvedDivisionManager.uid;
      const initialStatus = isSame ? 'pending_supervisor' : 'pending_coordinator';

      await updateDoc(docRef!, {
        status: initialStatus,
        approvalStatus: initialStatus,
        timerStatus: 'finished_pending_submit',
        inputMode: 'realtime',
        startTime: timestampToHHmm(started),
        endTime: timestampToHHmm(finished),
        totalDurationMinutes: (live as any).totalNetDurationMinutes ?? 0,
        overtimeCoordinatorUid: selectedCoordinatorUid,
        overtimeCoordinatorName:
          coordinator?.fullName || coordinator?.displayName || '',
        overtimeCoordinatorPosition:
          coordinator?.positionTitle ||
          coordinator?.structuralLevel ||
          coordinator?.role ||
          '',
        directSupervisorUid: resolvedDivisionManager?.uid ?? null,
        directSupervisorName: resolvedDivisionManager?.name ?? null,
        managerUid: resolvedDivisionManager?.uid ?? null,
        managerName: resolvedDivisionManager?.name ?? null,
        managerDivisionName: resolvedDivisionManager?.divisionName ?? null,
        approvalFlowType: isSame
          ? 'staff_to_manager_to_hrd'
          : 'staff_to_coordinator_to_manager_to_hrd',
        approvalFlow: isSame
          ? `${resolvedDivisionManager?.name} → HRD`
          : `${coordinator?.fullName || 'Koordinator'} → ${resolvedDivisionManager?.name ?? 'Manager'} → HRD`,
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      try {
        const recipientUid = selectedCoordinatorUid || resolvedDivisionManager?.uid;
        if (recipientUid) {
          await sendNotification(firestore, {
            userId: recipientUid,
            type: 'status_update',
            module: 'employee',
            title: 'Pengajuan Lembur Baru Menunggu Persetujuan',
            message: `${userProfile?.fullName} mengajukan lembur dan menunggu persetujuan Anda.`,
            targetType: 'user',
            targetId: submission.id!,
            actionUrl: '/admin/manager/persetujuan-lembur',
            createdBy: userProfile?.uid ?? '',
            meta: { submissionId: submission.id, employeeUid: userProfile?.uid },
          });
        }
      } catch {}

      toast({
        title: 'Pengajuan Dikirim',
        description: 'Pengajuan lembur realtime berhasil dikirim untuk persetujuan.',
      });
      clearRealtimeDraftCache();
      onSubmitted();
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal mengirim pengajuan',
        description: e.message,
      });
    } finally {
      setIsSavingSubmit(false);
    }
  };

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      await deleteDoc(docRef!);
      toast({ title: 'Draft dibatalkan' });
      clearRealtimeDraftCache();
      onCancelled();
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal menghapus draft',
        description: e.message,
      });
    } finally {
      setIsCancelling(false);
      setShowCancelConfirm(false);
    }
  };

  // ── Shared cancel dialog ──
  const cancelDialog = (
    <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Batalkan Draft Lembur?</DialogTitle>
          <DialogDescription>
            Semua data timer akan dihapus permanen dan tidak bisa dikembalikan.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowCancelConfirm(false)}>
            Periksa Lagi
          </Button>
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={isCancelling}
          >
            {isCancelling ? 'Menghapus...' : 'Ya, Hapus Draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // ════════════════════════════════════
  // DRAFT — Persiapan Lembur
  // ════════════════════════════════════
  if (timerStatus === 'draft') {
    const totalEstimatedMinutes = tasks.reduce((s, t) => s + (t.estimatedMinutes || 0), 0);
    const selectedCoordinator = eligibleCoordinators.find(c => c.uid === selectedCoordinatorUid);
    const isSameAsManager = !!resolvedDivisionManager?.uid && selectedCoordinatorUid === resolvedDivisionManager.uid;
    const approvalFlowText = !selectedCoordinatorUid
      ? 'Pilih koordinator terlebih dahulu'
      : isSameAsManager
        ? `${resolvedDivisionManager?.name ?? 'Manager'} → HRD`
        : `${selectedCoordinator?.fullName || 'Koordinator'} → ${resolvedDivisionManager?.name ?? 'Manager Divisi'} → HRD`;

    return (
      <div className="space-y-5">
        {/* Status header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              Draft Persiapan — Belum Dimulai
            </span>
          </div>
          <Badge variant="outline" className="text-xs text-muted-foreground">
            Menunggu Anda memulai timer
          </Badge>
        </div>

        {/* Disclaimer */}
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex gap-3">
          <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700 leading-relaxed">
            Data ini <strong>belum menjadi pengajuan</strong>. Pengajuan baru dikirim setelah Anda menyelesaikan timer dan menekan tombol <strong>Kirim Pengajuan</strong>. Jika modal ditutup, draft tetap tersimpan dan dapat dilanjutkan kembali.
          </p>
        </div>

        {/* 2-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* LEFT: Form (3/5) */}
          <div className="lg:col-span-3 space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Tanggal Lembur <span className="text-destructive">*</span></label>
              <GoogleDatePicker
                value={overtimeDate}
                onChange={(d) => d && setOvertimeDate(d)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Tipe Lembur</label>
                <Select value={overtimeType} onValueChange={(v) => setOvertimeType(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hari_kerja">Hari Kerja</SelectItem>
                    <SelectItem value="hari_libur">Hari Libur</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Lokasi Kerja</label>
                <Select value={location} onValueChange={(v) => setLocation(v as WorkLocationValue)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {workLocationOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {location === 'lainnya' && (
                  <Input
                    className="mt-2"
                    placeholder="Contoh: perjalanan dinas, event, gudang, lokasi project, dll."
                    value={workLocationDetail}
                    onChange={(event) => setWorkLocationDetail(event.target.value)}
                  />
                )}
              </div>
            </div>

            {/* Multi-task */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold">Daftar Pekerjaan Lembur <span className="text-destructive">*</span></label>
                <Button
                  type="button" variant="ghost" size="sm"
                  className="h-7 text-xs gap-1 text-primary"
                  onClick={() => setTasks((t) => [...t, { description: '', estimatedMinutes: 30 }])}
                >
                  <PlusCircle className="h-3.5 w-3.5" /> Tambah Pekerjaan
                </Button>
              </div>
              <div className="space-y-2.5">
                {tasks.map((task, i) => (
                  <div key={i} className="rounded-lg border bg-background p-3 space-y-2">
                    <div className="flex gap-2 items-start">
                      <span className="mt-2 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-700">{i + 1}</span>
                      <Input
                        className="flex-1"
                        placeholder={`Deskripsi pekerjaan ${i + 1}...`}
                        value={task.description}
                        onChange={(e) => {
                          const next = [...tasks];
                          next[i] = { ...next[i], description: e.target.value };
                          setTasks(next);
                        }}
                      />
                      {tasks.length > 1 && (
                        <Button
                          type="button" variant="ghost" size="sm"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          onClick={() => setTasks((t) => t.filter((_, idx) => idx !== i))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 pl-7">
                      <span className="text-xs text-muted-foreground">Estimasi durasi:</span>
                      <Input
                        type="number" min={1}
                        className="w-20 h-7 text-xs"
                        value={task.estimatedMinutes}
                        onChange={(e) => {
                          const next = [...tasks];
                          next[i] = { ...next[i], estimatedMinutes: parseInt(e.target.value) || 0 };
                          setTasks(next);
                        }}
                      />
                      <span className="text-xs text-muted-foreground">menit</span>
                    </div>
                  </div>
                ))}
              </div>
              {totalEstimatedMinutes > 0 && (
                <div className="flex justify-between items-center rounded-lg bg-teal-50 border border-teal-200 px-3 py-2 text-sm">
                  <span className="text-teal-700 font-medium">Total estimasi:</span>
                  <span className="font-bold text-teal-800">{formatDuration(totalEstimatedMinutes)}</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Catatan / Alasan Lembur</label>
              <Textarea
                rows={3}
                placeholder="Jelaskan konteks atau alasan pekerjaan ini perlu dilemburkan..."
                value={reasonNotes}
                onChange={(e) => setReasonNotes(e.target.value)}
              />
            </div>
          </div>

          {/* RIGHT: Info sidebar (2/5) */}
          <div className="lg:col-span-2 space-y-4">
            {/* Employee Profile Card */}
            {employeeDisplayInfo && (
              <Card className="border-slate-200">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identitas Pengaju</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2.5 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Nama</p>
                    <p className="font-semibold">{employeeDisplayInfo.fullName || userProfile?.fullName || '-'}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Brand</p>
                      <p className="font-medium text-xs">{employeeDisplayInfo.brandName || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Divisi</p>
                      <p className="font-medium text-xs">{employeeDisplayInfo.division || '-'}</p>
                    </div>
                  </div>
                  {employeeDisplayInfo.positionTitle && (
                    <div>
                      <p className="text-xs text-muted-foreground">Jabatan</p>
                      <p className="font-medium text-xs">{employeeDisplayInfo.positionTitle}</p>
                    </div>
                  )}
                  {employeeDisplayInfo.employmentStatus && (
                    <Badge variant="outline" className="text-xs">{employeeDisplayInfo.employmentStatus}</Badge>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Coordinator Selector */}
            <Card className={`border-2 ${selectedCoordinatorUid ? 'border-teal-300 bg-teal-50/30' : 'border-dashed border-slate-300'}`}>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  Koordinator / Pengawas Lembur
                  <span className="text-destructive">*</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {eligibleCoordinators.length > 0 ? (
                  <>
                    <Select value={selectedCoordinatorUid} onValueChange={setSelectedCoordinatorUid}>
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder="Pilih koordinator/pengawas..." />
                      </SelectTrigger>
                      <SelectContent>
                        {eligibleCoordinators.map((c) => (
                          <SelectItem key={c.uid} value={c.uid}>
                            <span className="font-medium">{c.fullName || c.displayName}</span>
                            {c.positionTitle && <span className="text-muted-foreground"> — {c.positionTitle}</span>}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedCoordinator && (
                      <p className="text-xs text-teal-600">
                        ✓ {selectedCoordinator.fullName || selectedCoordinator.displayName}
                        {selectedCoordinator.positionTitle && ` (${selectedCoordinator.positionTitle})`}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Tidak ada koordinator tersedia untuk divisi Anda.</p>
                )}
              </CardContent>
            </Card>

            {/* Approval Flow */}
            <Card className="border-slate-200">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Alur Persetujuan</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2.5">
                {[
                  { label: 'Koordinator', value: selectedCoordinator ? (selectedCoordinator.fullName || selectedCoordinator.displayName) : 'Belum dipilih', ok: !!selectedCoordinatorUid },
                  { label: 'Manager Divisi', value: resolvedDivisionManager?.name ?? 'Belum ditentukan', ok: !!resolvedDivisionManager },
                  { label: 'HRD', value: 'Persetujuan akhir', ok: true },
                ].filter(step => !isSameAsManager || step.label !== 'Koordinator' || selectedCoordinator?.uid !== resolvedDivisionManager?.uid).map((step) => (
                  <div key={step.label} className="flex items-start gap-2.5 text-xs">
                    <span className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${step.ok ? 'bg-teal-500 text-white' : 'bg-slate-200 text-slate-400'}`}>
                      {step.ok ? '✓' : '?'}
                    </span>
                    <div>
                      <p className="font-semibold text-foreground">{step.label}</p>
                      <p className="text-muted-foreground">{step.value}</p>
                    </div>
                  </div>
                ))}
                {selectedCoordinatorUid && (
                  <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
                    Alur: <span className="font-medium text-foreground">{approvalFlowText}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3 pt-4 border-t">
          <Button
            variant="ghost" size="sm"
            className="text-destructive hover:text-destructive gap-1"
            onClick={() => setShowCancelConfirm(true)}
          >
            <Trash2 className="h-4 w-4" /> Batalkan Draft
          </Button>
          <div className="flex gap-2 flex-wrap justify-end">
            <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={isSavingDraft}>
              {isSavingDraft ? 'Menyimpan...' : 'Simpan Draft'}
            </Button>
            <Button variant="outline" size="sm" className="gap-1" onClick={() => setShowPreviewPlan(true)}>
              <Eye className="h-3.5 w-3.5" /> Preview Rencana
            </Button>
            <Button
              className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5"
              onClick={() => {
                if (!tasks.some((t) => t.description.trim())) {
                  toast({ variant: 'destructive', title: 'Isi minimal satu deskripsi pekerjaan' });
                  return;
                }
                setShowStartConfirm(true);
              }}
            >
              <Play className="h-4 w-4" /> Mulai Lembur
            </Button>
          </div>
        </div>

        {/* Preview Rencana */}
        <Dialog open={showPreviewPlan} onOpenChange={setShowPreviewPlan}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Preview Rencana Lembur</DialogTitle>
              <DialogDescription className="sr-only">Ringkasan rencana sebelum memulai timer</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm py-2 max-h-[60vh] overflow-y-auto pr-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tanggal</span>
                <span className="font-medium">{format(overtimeDate, 'eeee, dd MMM yyyy', { locale: idLocale })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tipe</span>
                <span className="font-medium">
                  {overtimeType === 'hari_kerja' ? 'Hari Kerja' : overtimeType === 'hari_libur' ? 'Hari Libur' : 'Urgent'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Lokasi</span>
                <span className="font-medium">
                  {getWorkLocationLabel(location, workLocationDetail)}
                </span>
              </div>
              {selectedCoordinator && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Koordinator</span>
                  <span className="font-medium">{selectedCoordinator.fullName || selectedCoordinator.displayName}</span>
                </div>
              )}
              <div className="border-t pt-3 space-y-1">
                <p className="font-semibold mb-2">Daftar Pekerjaan</p>
                {tasks.filter((t) => t.description.trim()).map((t, i) => (
                  <div key={i} className="flex justify-between py-1.5 border-b last:border-0">
                    <span>{i + 1}. {t.description}</span>
                    <span className="text-muted-foreground flex-shrink-0 ml-4">{t.estimatedMinutes} mnt</span>
                  </div>
                  ))}
                <div className="flex justify-between pt-2 font-semibold">
                  <span>Total estimasi</span>
                  <span>{tasks.reduce((s, t) => s + t.estimatedMinutes, 0)} menit</span>
                </div>
              </div>
              {reasonNotes.trim() && (
                <div className="border-t pt-3">
                  <p className="font-semibold mb-1">Catatan</p>
                  <p className="text-muted-foreground">{reasonNotes}</p>
                </div>
              )}
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
                Data ini belum menjadi pengajuan. Pengajuan dikirim setelah timer
                selesai.
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowPreviewPlan(false)}>
                Tutup
              </Button>
              <Button
                className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5"
                onClick={() => {
                  setShowPreviewPlan(false);
                  setShowStartConfirm(true);
                }}
              >
                <Play className="h-4 w-4" />
                Mulai Lembur
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Konfirmasi mulai */}
        <Dialog open={showStartConfirm} onOpenChange={setShowStartConfirm}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Mulai mencatat lembur sekarang?</DialogTitle>
              <DialogDescription>
                Timer akan mulai berjalan secara realtime. Pastikan rencana pekerjaan
                sudah sesuai. Data ini belum dikirim sebagai pengajuan.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setShowStartConfirm(false)}
              >
                Periksa Lagi
              </Button>
              <Button
                className="bg-teal-600 hover:bg-teal-700 text-white"
                onClick={handleStartTimer}
                disabled={isSavingStart}
              >
                {isSavingStart ? 'Memulai...' : 'Ya, Mulai Timer'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {cancelDialog}
      </div>
    );
  }

  // ════════════════════════════════════
  // RUNNING — Timer berjalan
  // ════════════════════════════════════
  if (timerStatus === 'running') {
    const taskList = (live as any).tasks || (live as any).taskDetails || [];
    return (
      <div className="space-y-5">
        <Card className="border-2 border-teal-400 bg-teal-50">
          <CardContent className="pt-5 space-y-4">
            <div className="flex items-center justify-between">
              <Badge
                variant="outline"
                className="border-teal-500 text-teal-700 gap-1.5"
              >
                <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse inline-block" />
                Sedang Berjalan
              </Badge>
              <span className="text-xs text-teal-700">
                Mulai:{' '}
                {(live as any).timerStartedAt
                  ? timestampToHHmm((live as any).timerStartedAt)
                  : '--:--'}
              </span>
            </div>
            <div className="text-center">
              <div className="text-5xl font-mono font-bold tracking-wider text-teal-800">
                {formatElapsed(netElapsedSec)}
              </div>
              <p className="text-xs text-teal-600 mt-1">Durasi bersih</p>
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-teal-200 pt-3">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Durasi berjalan</p>
                <p className="text-sm font-semibold">
                  {formatElapsed(grossElapsedSec)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Total jeda</p>
                <p className="text-sm font-semibold text-amber-600">
                  {formatDuration(Math.round(completedPausedMs / 60000))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {taskList.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Daftar Pekerjaan
            </p>
            <div className="space-y-1.5">
              {taskList.map((t: any, i: number) => (
                <div
                  key={i}
                  className="flex justify-between items-start rounded-lg border px-3 py-2 bg-background text-sm"
                >
                  <span>
                    {i + 1}. {t.description}
                  </span>
                  <span className="text-muted-foreground text-xs flex-shrink-0 ml-3">
                    {t.estimatedMinutes || 0} mnt
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3 justify-center">
          <Button
            variant="outline"
            className="border-amber-400 text-amber-700 hover:bg-amber-50 gap-2"
            onClick={() => {
              setPauseReason('');
              setPauseNote('');
              setShowPauseDialog(true);
            }}
          >
            <Pause className="h-4 w-4" />
            Jeda
          </Button>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white gap-2"
            onClick={handleFinish}
            disabled={isSavingFinish}
          >
            <Square className="h-4 w-4" />
            {isSavingFinish ? 'Menyimpan...' : 'Selesaikan Lembur'}
          </Button>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="w-full text-destructive hover:text-destructive gap-1"
          onClick={() => setShowCancelConfirm(true)}
        >
          <Trash2 className="h-4 w-4" />
          Batalkan Draft Lembur
        </Button>

        {/* Pause dialog */}
        <Dialog open={showPauseDialog} onOpenChange={setShowPauseDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Jeda Lembur</DialogTitle>
              <DialogDescription>
                Pilih alasan jeda untuk dicatat dalam riwayat.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Alasan Jeda</label>
                <div className="grid gap-2">
                  {PAUSE_REASONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setPauseReason(r)}
                      className={`text-left rounded-lg border px-3 py-2 text-sm transition-colors ${
                        pauseReason === r
                          ? 'border-amber-400 bg-amber-50 font-medium'
                          : 'border-border hover:border-slate-300'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              {pauseReason === 'Lainnya' && (
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Catatan (opsional)</label>
                  <Textarea
                    rows={2}
                    placeholder="Jelaskan lebih lanjut..."
                    value={pauseNote}
                    onChange={(e) => setPauseNote(e.target.value)}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowPauseDialog(false)}>
                Batal
              </Button>
              <Button
                className="bg-amber-600 hover:bg-amber-700 text-white"
                onClick={handleConfirmPause}
                disabled={isSavingPause || !pauseReason}
              >
                {isSavingPause ? 'Menyimpan...' : 'Jeda Sekarang'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {cancelDialog}
      </div>
    );
  }

  // ════════════════════════════════════
  // PAUSED — Lembur dijeda
  // ════════════════════════════════════
  if (timerStatus === 'paused') {
    const lastLog = pauseLogs[pauseLogs.length - 1];
    const currentReason = lastLog?.reason ?? '-';
    const currentNote = lastLog?.note;

    return (
      <div className="space-y-5">
        <Card className="border-2 border-amber-400 bg-amber-50">
          <CardContent className="pt-5 space-y-4">
            <div className="flex items-center justify-between">
              <Badge
                variant="outline"
                className="border-amber-500 text-amber-700"
              >
                ⏸ Lembur Sedang Dijeda
              </Badge>
              <span className="text-xs text-amber-700">
                Mulai:{' '}
                {(live as any).timerStartedAt
                  ? timestampToHHmm((live as any).timerStartedAt)
                  : '--:--'}
              </span>
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-amber-800">
                Alasan jeda: {currentReason}
              </p>
              {currentNote && (
                <p className="text-xs text-amber-600 italic">{currentNote}</p>
              )}
              <div className="text-4xl font-mono font-bold tracking-wider text-amber-700 mt-3">
                {formatElapsed(pauseElapsedSec)}
              </div>
              <p className="text-xs text-amber-600">Durasi jeda saat ini</p>
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-amber-200 pt-3">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Durasi bersih</p>
                <p className="text-sm font-semibold text-teal-700">
                  {formatElapsed(netElapsedSec)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Total jeda</p>
                <p className="text-sm font-semibold text-amber-700">
                  {formatDuration(Math.round(totalPausedSec / 60))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button
          className="w-full bg-teal-600 hover:bg-teal-700 text-white gap-2"
          onClick={handleResume}
          disabled={isSavingResume}
        >
          <Play className="h-4 w-4" />
          {isSavingResume ? 'Melanjutkan...' : 'Lanjutkan Timer'}
        </Button>

        {pauseLogs.length > 0 && (
          <div className="space-y-1">
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowPauseLogs((p) => !p)}
            >
              {showPauseLogs ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              Riwayat jeda ({pauseLogs.length} sesi)
            </button>
            {showPauseLogs && (
              <div className="rounded-lg border overflow-hidden text-xs">
                {pauseLogs.map((log, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-3 py-2 border-b last:border-0"
                  >
                    <span className="text-muted-foreground w-4">{i + 1}</span>
                    <span className="font-medium">{log.reason}</span>
                    <span className="text-muted-foreground">
                      {timestampToHHmm(log.startedAt)} –{' '}
                      {log.endedAt ? timestampToHHmm(log.endedAt) : '...'}
                    </span>
                    {log.note && (
                      <span className="italic text-muted-foreground">{log.note}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="w-full text-destructive hover:text-destructive gap-1"
          onClick={() => setShowCancelConfirm(true)}
        >
          <Trash2 className="h-4 w-4" />
          Batalkan Draft Lembur
        </Button>

        {cancelDialog}
      </div>
    );
  }

  // ════════════════════════════════════
  // FINISHED — Preview & Kirim Pengajuan
  // ════════════════════════════════════
  if (timerStatus === 'finished_pending_submit') {
    const grossMin = (live as any).totalGrossDurationMinutes ?? 0;
    const pausedMin = (live as any).totalPausedDurationMinutes ?? 0;
    const netMin = (live as any).totalNetDurationMinutes ?? 0;
    const started = (live as any).timerStartedAt as Timestamp | null | undefined;
    const finished = (live as any).timerFinishedAt as Timestamp | null | undefined;
    const startTimeStr = started ? timestampToHHmm(started) : '--:--';
    const endTimeStr = finished ? timestampToHHmm(finished) : '--:--';
    const overtimeDateVal = (live as any).overtimeDate ?? live.date;
    let overtimeDateObj: Date | null = null;
    if (overtimeDateVal && typeof overtimeDateVal.toDate === 'function')
      overtimeDateObj = overtimeDateVal.toDate();
    else if (overtimeDateVal instanceof Date) overtimeDateObj = overtimeDateVal;
    const taskList = (live as any).tasks || (live as any).taskDetails || [];

    const selectedCoordinator = eligibleCoordinators.find(
      (c) => c.uid === selectedCoordinatorUid,
    );
    const isSame =
      !!resolvedDivisionManager?.uid &&
      selectedCoordinatorUid === resolvedDivisionManager.uid;

    // Edit notes view
    if (isEditingNotes) {
      return (
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Edit catatan pekerjaan sebelum mengirim pengajuan.
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold">Daftar Pekerjaan</label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 text-primary"
                onClick={() =>
                  setEditTasks((t) => [
                    ...t,
                    { description: '', estimatedMinutes: 30 },
                  ])
                }
              >
                <PlusCircle className="h-3.5 w-3.5" />
                Tambah
              </Button>
            </div>
            {editTasks.map((task, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1 space-y-1.5">
                  <Input
                    placeholder={`Pekerjaan ${i + 1}...`}
                    value={task.description}
                    onChange={(e) => {
                      const n = [...editTasks];
                      n[i] = { ...n[i], description: e.target.value };
                      setEditTasks(n);
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Estimasi:</span>
                    <Input
                      type="number"
                      min={1}
                      className="w-20 h-7 text-xs"
                      value={task.estimatedMinutes}
                      onChange={(e) => {
                        const n = [...editTasks];
                        n[i] = {
                          ...n[i],
                          estimatedMinutes: parseInt(e.target.value) || 0,
                        };
                        setEditTasks(n);
                      }}
                    />
                    <span className="text-xs text-muted-foreground">menit</span>
                  </div>
                </div>
                {editTasks.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive mt-0.5"
                    onClick={() =>
                      setEditTasks((t) => t.filter((_, idx) => idx !== i))
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">Catatan / Alasan Lembur</label>
            <Textarea
              rows={3}
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
            />
          </div>
          <div className="flex gap-3 pt-2 border-t">
            <Button variant="ghost" onClick={() => setIsEditingNotes(false)}>
              Batal
            </Button>
            <Button
              className="bg-teal-600 hover:bg-teal-700 text-white"
              onClick={handleSaveEditedNotes}
            >
              Simpan Catatan
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-5">
        {/* Banner */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">
              Lembur Selesai Dicatat
            </p>
            <p className="text-xs text-emerald-600 mt-1">
              Tinjau ringkasan berikut. Pengajuan baru dikirim setelah Anda menekan{' '}
              <strong>Kirim Pengajuan</strong>.
            </p>
          </div>
        </div>

        {/* Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Ringkasan Lembur Realtime</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tanggal</span>
              <span className="font-medium">
                {overtimeDateObj
                  ? format(overtimeDateObj, 'eeee, dd MMMM yyyy', {
                      locale: idLocale,
                    })
                  : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Jam Mulai</span>
              <span className="font-medium">{startTimeStr}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Jam Selesai</span>
              <span className="font-medium">{endTimeStr}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tipe Lembur</span>
              <span className="font-medium">
                {live.overtimeType === 'hari_kerja'
                  ? 'Hari Kerja'
                  : live.overtimeType === 'hari_libur'
                    ? 'Hari Libur'
                    : 'Urgent'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Lokasi</span>
              <span className="font-medium">
                {getWorkLocationLabel(
                  live.workLocation || live.location,
                  (live as any).workLocationDetail,
                )}
              </span>
            </div>
            <div className="border-t pt-3 space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Durasi Kotor</span>
                <span className="font-medium">{formatDuration(grossMin)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Total Jeda ({pauseLogs.length} sesi)
                </span>
                <span className="font-medium text-amber-600">
                  {formatDuration(pausedMin)}
                </span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-semibold">Durasi Bersih (yang diajukan)</span>
                <span className="font-bold text-teal-700">
                  {formatDuration(netMin)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tasks */}
        {taskList.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Daftar Pekerjaan
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1"
                onClick={() => {
                  setEditTasks(
                    taskList.map((t: any) => ({
                      description: t.description || '',
                      estimatedMinutes: t.estimatedMinutes || 0,
                    })),
                  );
                  setEditReason(live.reason || '');
                  setIsEditingNotes(true);
                }}
              >
                <Pencil className="h-3 w-3" />
                Edit Catatan
              </Button>
            </div>
            <div className="space-y-1.5">
              {taskList.map((t: any, i: number) => (
                <div
                  key={i}
                  className="flex justify-between text-sm rounded-lg border px-3 py-2 bg-muted"
                >
                  <span>
                    {i + 1}. {t.description}
                  </span>
                  <span className="text-muted-foreground text-xs flex-shrink-0 ml-3">
                    {t.estimatedMinutes || 0} mnt
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reason */}
        {live.reason && (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Catatan / Alasan
            </p>
            <p className="text-sm text-muted-foreground">{live.reason}</p>
          </div>
        )}

        {/* Pause logs */}
        {pauseLogs.length > 0 && (
          <div className="space-y-1">
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowPauseLogs((p) => !p)}
            >
              {showPauseLogs ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              Log Jeda ({pauseLogs.length} sesi)
            </button>
            {showPauseLogs && (
              <div className="rounded-lg border overflow-hidden text-xs">
                {pauseLogs.map((log, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-3 py-2 border-b last:border-0"
                  >
                    <span className="text-muted-foreground w-4">{i + 1}</span>
                    <span className="font-medium">{log.reason}</span>
                    <span className="text-muted-foreground">
                      {timestampToHHmm(log.startedAt)} –{' '}
                      {log.endedAt ? timestampToHHmm(log.endedAt) : '?'}
                    </span>
                    {log.note && (
                      <span className="italic text-muted-foreground">{log.note}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Coordinator selection */}
        <div className="space-y-3 border-t pt-4">
          <div>
            <p className="text-sm font-semibold">Pengawas / Koordinator Lembur</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pilih atasan yang akan menyetujui pengajuan ini.
            </p>
          </div>
          {eligibleCoordinators.length > 0 ? (
            <Select
              value={selectedCoordinatorUid}
              onValueChange={setSelectedCoordinatorUid}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih koordinator/pengawas..." />
              </SelectTrigger>
              <SelectContent>
                {eligibleCoordinators.map((c) => (
                  <SelectItem key={c.uid} value={c.uid}>
                    {c.fullName || c.displayName}
                    {c.positionTitle ? ` — ${c.positionTitle}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Data koordinator tidak tersedia. Hubungi HRD untuk proses manual.
            </p>
          )}

          {resolvedDivisionManager && selectedCoordinatorUid && (
            <div className="rounded-lg border bg-muted px-3 py-2.5 text-xs space-y-1.5">
              <p className="font-semibold text-muted-foreground uppercase tracking-wide">
                Alur Persetujuan
              </p>
              {!isSame && (
                <p>
                  1. {selectedCoordinator?.fullName || '—'}{' '}
                  <span className="text-muted-foreground">(Koordinator)</span>
                </p>
              )}
              <p>
                {isSame ? '1.' : '2.'} {resolvedDivisionManager.name}{' '}
                <span className="text-muted-foreground">(Manager Divisi)</span>
              </p>
              <p>
                {isSame ? '2.' : '3.'} HRD{' '}
                <span className="text-muted-foreground">(Final approval)</span>
              </p>
            </div>
          )}
        </div>

        {/* Submit actions */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive gap-1"
            onClick={() => setShowCancelConfirm(true)}
          >
            <Trash2 className="h-4 w-4" />
            Batalkan Draft
          </Button>
          <Button
            className="bg-teal-600 hover:bg-teal-700 text-white gap-2"
            onClick={handleFinalSubmit}
            disabled={isSavingSubmit || !selectedCoordinatorUid}
          >
            <Send className="h-4 w-4" />
            {isSavingSubmit ? 'Mengirim...' : 'Kirim Pengajuan'}
          </Button>
        </div>

        {cancelDialog}
      </div>
    );
  }

  return (
    <div className="p-4 text-sm text-muted-foreground">
      Pengajuan lembur realtime ini sudah dikirim dan sedang dalam proses
      persetujuan.
    </div>
  );
}
