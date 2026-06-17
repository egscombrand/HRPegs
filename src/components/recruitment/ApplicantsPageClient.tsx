'use client';

import { useMemo, useState, useEffect } from 'react';
import { useAuth } from '@/providers/auth-provider';
import type { JobApplication, Job, UserProfile, Brand } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Eye, Search, X, Users, CheckCircle2, Clock, AlertTriangle, TrendingUp,
  LayoutGrid, Pencil, ChevronDown, Link as LinkIcon, BarChart3, Briefcase,
} from 'lucide-react';
import { MultiApplicationBadge } from './MultiApplicationBadge';
import { ApplicationStatusBadge, statusDisplayLabels } from '@/components/recruitment/ApplicationStatusBadge';
import { Checkbox } from '@/components/ui/checkbox';
import Link from 'next/link';
import { format, differenceInMinutes, add } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { BulkScheduleWizard } from './BulkScheduleWizard';
import { useToast } from '@/hooks/use-toast';
import { ORDERED_RECRUITMENT_STAGES } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { setDocumentNonBlocking, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { doc, serverTimestamp, Timestamp, query, collection, where, writeBatch, getDocs } from 'firebase/firestore';
import type { ScheduleInterviewData } from './ScheduleInterviewDialog';
import { ScheduleInterviewDialog } from './ScheduleInterviewDialog';
import { EditInterviewTemplateDialog } from './EditInterviewTemplateDialog';
import { AssignedUsersCard } from './AssignedUsersCard';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn, getInitials } from '@/lib/utils';

type SelectionState = { selectedIds: Set<string> };

// ─── KPI card ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon: Icon, color, sub }: {
  label: string; value: number | string; icon: React.ElementType; color: string; sub?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-xl border bg-white dark:bg-slate-900 px-3 py-3 shadow-sm ${color}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 truncate">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums leading-none">{value}</p>
          {sub && <p className="mt-0.5 text-[9px] text-slate-400">{sub}</p>}
        </div>
        <div className="rounded-lg p-1.5 shrink-0"><Icon className="h-4 w-4 opacity-70" /></div>
      </div>
    </div>
  );
}

// ─── Interview template compact card ──────────────────────────────────────────

function InterviewTemplateCard({ job, detectedTemplate, onEdit, isPrivilegedRecruiter, onUseAsDefault }: {
  job: Job | null;
  detectedTemplate: any;
  onEdit: () => void;
  isPrivilegedRecruiter: boolean;
  onUseAsDefault: () => void;
}) {
  if (!job) return null;
  const template = job.interviewTemplate || detectedTemplate;
  return (
    <Card className="rounded-xl border-slate-200 dark:border-slate-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="h-4 w-4 text-slate-500" />
          Interview Template
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        {template?.meetingLink && (
          <div className="flex items-start gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-2">
            <LinkIcon className="h-3 w-3 shrink-0 text-slate-400 mt-0.5" />
            <a href={template.meetingLink} target="_blank" rel="noopener noreferrer"
              className="text-teal-600 dark:text-teal-400 hover:underline truncate">
              {template.meetingLink.split('/').slice(-1)[0]}
            </a>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {template?.slotDurationMinutes && (
            <div><span className="text-slate-500">Durasi:</span> <span className="font-medium">{template.slotDurationMinutes} min</span></div>
          )}
          {template?.workdayStartTime && (
            <div><span className="text-slate-500">Mulai:</span> <span className="font-medium">{template.workdayStartTime}</span></div>
          )}
        </div>
        <Button size="sm" variant="outline" className="w-full text-xs h-8 rounded-lg mt-2" onClick={onEdit}>
          {isPrivilegedRecruiter ? <>
            <Pencil className="h-3 w-3 mr-1" /> Edit
          </> : <>
            <Eye className="h-3 w-3 mr-1" /> View
          </>}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ApplicantsPageClient({ applications, job, onJobUpdate, allBrands }: {
  applications: JobApplication[];
  job: Job | null;
  onJobUpdate: () => void;
  allBrands: Brand[];
}) {
  const { userProfile } = useAuth();
  const [selectionMode, setSelectionMode] = useState(false);
  const [selection, setSelection] = useState<SelectionState>({ selectedIds: new Set() });
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [isSingleScheduleOpen, setIsSingleScheduleOpen] = useState(false);
  const [activeApplication, setActiveApplication] = useState<JobApplication | null>(null);
  // Map: candidateUid → all OTHER applications (not in this job)
  const [multiAppMap, setMultiAppMap] = useState<Map<string, Pick<JobApplication, 'id' | 'jobPosition' | 'brandName' | 'status'>[]>>(new Map());

  const firestore = useFirestore();
  const { toast } = useToast();

  const isPrivilegedRecruiter = userProfile?.role === 'super-admin' || userProfile?.role === 'hrd';

  // Fetch multi-application data: for each candidateUid in this job's applicants,
  // query all their applications across all jobs (grouped, no per-row query).
  useEffect(() => {
    if (!isPrivilegedRecruiter || applications.length === 0) return;
    const currentJobId = job?.id;
    const uids = [...new Set(applications.map(a => a.candidateUid).filter(Boolean))];
    if (uids.length === 0) return;

    const CHUNK = 30;
    const chunks: string[][] = [];
    for (let i = 0; i < uids.length; i += CHUNK) chunks.push(uids.slice(i, i + CHUNK));

    (async () => {
      const results: JobApplication[] = [];
      await Promise.all(
        chunks.map(async chunk => {
          const snap = await getDocs(
            query(collection(firestore, 'applications'), where('candidateUid', 'in', chunk))
          );
          snap.forEach(d => results.push({ id: d.id, ...d.data() } as JobApplication));
        })
      );
      const map = new Map<string, Pick<JobApplication, 'id' | 'jobPosition' | 'brandName' | 'status'>[]>();
      results.forEach(a => {
        if (a.jobId === currentJobId) return; // skip current job
        const list = map.get(a.candidateUid) || [];
        list.push({ id: a.id, jobPosition: a.jobPosition, brandName: a.brandName, status: a.status });
        map.set(a.candidateUid, list);
      });
      setMultiAppMap(map);
    })();
  }, [applications, firestore, isPrivilegedRecruiter, job?.id]);

  const { data: usersToFilter } = useCollection<UserProfile>(
    useMemoFirebase(() => {
      if (!userProfile || !isPrivilegedRecruiter) return null;
      return query(
        collection(firestore, 'users'),
        where('role', 'in', ['hrd', 'manager', 'karyawan', 'super-admin']),
        where('isActive', '==', true)
      );
    }, [firestore, userProfile, isPrivilegedRecruiter])
  );

  const assignableUsers = useMemo(() => {
    if (!usersToFilter) return [];
    return usersToFilter.filter(u => u.role === 'manager' || (u.role === 'karyawan' && u.employmentType === 'karyawan'));
  }, [usersToFilter]);

  const userMap = useMemo(() => new Map((usersToFilter || []).map(u => [u.uid, u])), [usersToFilter]);

  const detectedTemplate = useMemo(() => {
    if (!job || job.interviewTemplate?.slotDurationMinutes) return null;
    const first = applications.flatMap(a => a.interviews || []).find(i => i.startAt && i.endAt);
    if (!first) return null;
    return {
      meetingLink: first.meetingLink || '',
      slotDurationMinutes: differenceInMinutes(first.endAt.toDate(), first.startAt.toDate()) || 30,
      workdayStartTime: format(first.startAt.toDate(), 'HH:mm'),
    };
  }, [job, applications]);

  const getMostRelevantInterview = (app: JobApplication) => {
    if (!app.interviews?.length) return null;
    const now = new Date().getTime();
    const scheduled = app.interviews.filter(i => ['scheduled', 'reschedule_requested'].includes(i.status));
    if (!scheduled.length) return null;
    const upcoming = scheduled.filter(i => i.startAt.toMillis() >= now).sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis());
    if (upcoming.length > 0) return upcoming[0];
    return scheduled.sort((a, b) => b.startAt.toMillis() - a.startAt.toMillis())[0] || null;
  };

  const filteredApplications = useMemo(() => {
    let result = applications;
    if (stageFilter !== 'all') result = result.filter(a => a.status === stageFilter);
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(a => a.candidateName.toLowerCase().includes(q));
    }
    return result;
  }, [applications, stageFilter, searchTerm]);

  const sortedApplications = useMemo(() => {
    return [...filteredApplications].sort((a, b) =>
      (b.submittedAt?.toMillis() || b.createdAt.toMillis()) - (a.submittedAt?.toMillis() || a.createdAt.toMillis())
    );
  }, [filteredApplications]);

  const stageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    ORDERED_RECRUITMENT_STAGES.forEach(s => counts.set(s, 0));
    applications.forEach(a => counts.set(a.status, (counts.get(a.status) || 0) + 1));
    return counts;
  }, [applications]);

  const summary = useMemo(() => {
    const newCount = applications.filter(a => a.status === 'applied' || a.status === 'submitted').length;
    const interviewCount = applications.filter(a => a.status === 'interview').length;
    const offeredCount = applications.filter(a => a.status === 'offered').length;
    const hiredCount = applications.filter(a => a.status === 'hired').length;
    const rejectedCount = applications.filter(a => a.status === 'rejected').length;
    return { newCount, interviewCount, offeredCount, hiredCount, rejectedCount };
  }, [applications]);

  useEffect(() => {
    setSelection({ selectedIds: new Set() });
  }, [stageFilter, searchTerm, selectionMode]);

  const isAllSelected = filteredApplications.length > 0 && filteredApplications.every(a => selection.selectedIds.has(a.id!));
  const selectedApplications = applications.filter(a => selection.selectedIds.has(a.id!));

  const handleSelectAll = (checked: boolean) => {
    setSelection({ selectedIds: checked ? new Set(filteredApplications.map(a => a.id!)) : new Set() });
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    setSelection(prev => {
      const newIds = new Set(prev.selectedIds);
      if (checked) newIds.add(id); else newIds.delete(id);
      return { selectedIds: newIds };
    });
  };

  const handleSaveTemplate = async (templateData: Partial<Job['interviewTemplate']>) => {
    if (!job) return;
    try {
      await setDocumentNonBlocking(doc(firestore, 'jobs', job.id!), {
        interviewTemplate: { ...job.interviewTemplate, ...templateData },
        updatedAt: serverTimestamp(),
      }, { merge: true });
      toast({ title: 'Template Saved' });
      onJobUpdate();
      setIsTemplateDialogOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed', description: e.message });
    }
  };

  const handleSaveSingleInterview = async (values: ScheduleInterviewData) => {
    if (!activeApplication || !userProfile || !job) return false;
    const existing = getMostRelevantInterview(activeApplication);
    const newInterviews = [...(activeApplication.interviews || [])];

    // Get panelists from job's assigned users or current user
    const assignedUserIds = job.assignedUserIds || [];
    const panelistIds = assignedUserIds.length > 0 ? assignedUserIds : [userProfile.uid];
    const panelistNames = panelistIds.map(uid => {
      const user = userMap.get(uid);
      return user?.fullName || 'Unknown';
    });

    if (existing) {
      const idx = newInterviews.findIndex(i => i.interviewId === existing.interviewId);
      if (idx !== -1) {
        newInterviews[idx] = {
          ...newInterviews[idx],
          startAt: Timestamp.fromDate(values.dateTime),
          endAt: Timestamp.fromDate(add(values.dateTime, { minutes: values.duration })),
          panelistIds,
          panelistNames,
          meetingLink: values.meetingLink || newInterviews[idx].meetingLink || '',
        };
      }
    } else {
      newInterviews.push({
        interviewId: crypto.randomUUID(),
        startAt: Timestamp.fromDate(values.dateTime),
        endAt: Timestamp.fromDate(add(values.dateTime, { minutes: values.duration })),
        panelistIds,
        panelistNames,
        meetingLink: values.meetingLink || job?.interviewTemplate?.meetingLink || '',
        status: 'scheduled',
        meetingPublished: false,
      });
    }

    const allPanelistIds = Array.from(new Set(
      newInterviews.filter(i => i.status !== 'canceled').flatMap(i => i.panelistIds || [])
    ));

    try {
      const batch = writeBatch(firestore);
      batch.set(doc(firestore, 'applications', activeApplication.id!), {
        interviews: newInterviews,
        allPanelistIds,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      const interviewDateStr = format(values.dateTime, 'dd MMMM yyyy', { locale: idLocale });
      const interviewTimeStr = format(values.dateTime, 'HH:mm');
      const meetingLink = values.meetingLink || existing?.meetingLink || job?.interviewTemplate?.meetingLink || '';

      const notifMeta = {
        jobId: activeApplication.jobId,
        applicationId: activeApplication.id!,
        candidateName: activeApplication.candidateName,
        jobTitle: activeApplication.jobPosition,
        interviewDate: interviewDateStr,
        interviewTime: interviewTimeStr,
        meetingLink,
      };

      const recruitmentTeamIds = new Set<string>([...panelistIds, ...(job?.assignedUserIds || [])]);
      const allRecipients = new Set([activeApplication.candidateUid, ...recruitmentTeamIds]);

      allRecipients.forEach(uid => {
        const notifRef = doc(collection(firestore, 'users', uid, 'notifications'));
        const isCandidate = uid === activeApplication.candidateUid;
        batch.set(notifRef, {
          module: 'recruitment',
          targetType: 'application',
          targetId: activeApplication.id!,
          userId: uid,
          type: existing ? 'interview_updated' : 'interview_scheduled',
          title: existing ? 'Jadwal Wawancara Diperbarui' : 'Jadwal Wawancara Baru',
          message: `Jadwal untuk ${activeApplication.candidateName} telah ${existing ? 'diperbarui' : 'ditetapkan'}.`,
          actionUrl: isCandidate ? '/careers/portal/applications' : '/admin/recruitment/my-tasks',
          isRead: false,
          createdAt: serverTimestamp(),
          createdBy: userProfile.uid,
          meta: notifMeta,
        });
      });

      await batch.commit();
      toast({ title: 'Jadwal Diperbarui' });
      onJobUpdate();
      return true;
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed', description: e.message });
      return false;
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (!job) {
    return <div className="space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>;
  }

  return (
    <div className="space-y-6">

      {/* ── Header with job title and summary ──────────────────────────────── */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-1">{job.position}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{job.brandName} • {job.divisionName || 'Umum'}</p>
      </div>

      {/* ── KPI Summary ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <KpiCard label="Total" value={applications.length} icon={Users}
          color="border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400" />
        <KpiCard label="Baru" value={summary.newCount} icon={TrendingUp}
          color="border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-400" />
        <KpiCard label="Interview" value={summary.interviewCount} icon={Clock}
          color="border-purple-200 dark:border-purple-900 text-purple-700 dark:text-purple-400" />
        <KpiCard label="Offering" value={summary.offeredCount} icon={BarChart3}
          color="border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400" />
        <KpiCard label="Diterima" value={summary.hiredCount} icon={CheckCircle2}
          color="border-green-200 dark:border-green-900 text-green-700 dark:text-green-400" />
        <KpiCard label="Ditolak" value={summary.rejectedCount} icon={AlertTriangle}
          color="border-red-200 dark:border-red-900 text-red-700 dark:text-red-400" />
      </div>

      {/* ── Cards row: Team + Template ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <AssignedUsersCard
          job={job}
          allUsers={assignableUsers}
          allBrands={allBrands || []}
          onUpdate={onJobUpdate}
          className="lg:col-span-1"
        />
        <InterviewTemplateCard
          job={job}
          detectedTemplate={detectedTemplate}
          onEdit={() => setIsTemplateDialogOpen(true)}
          isPrivilegedRecruiter={isPrivilegedRecruiter}
          onUseAsDefault={async () => {
            if (!job || !detectedTemplate) return;
            try {
              await setDocumentNonBlocking(doc(firestore, 'jobs', job.id!), {
                interviewTemplate: { ...job.interviewTemplate, ...detectedTemplate },
                updatedAt: serverTimestamp(),
              }, { merge: true });
              toast({ title: 'Template Updated' });
              onJobUpdate();
            } catch (e: any) {
              toast({ variant: 'destructive', description: e.message });
            }
          }}
        />
        <Card className="rounded-xl border-slate-200 dark:border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-slate-500" />
              Job Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div>
              <span className="text-slate-500">Status:</span>
              <Badge variant="outline" className="ml-2 capitalize">{job.publishStatus}</Badge>
            </div>
            {job.applyDeadline || job.applicationDeadline ? (
              <div>
                <span className="text-slate-500">Deadline:</span>
                <span className="ml-2 font-medium">
                  {format((job.applyDeadline || job.applicationDeadline)!.toDate(), 'dd MMM yyyy')}
                </span>
              </div>
            ) : null}
            {job.numberOfOpenings && (
              <div>
                <span className="text-slate-500">Posisi Dibuka:</span>
                <span className="ml-2 font-medium">{job.numberOfOpenings}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Filters & Search ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <input
              placeholder="Cari nama kandidat..."
              className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Stage filter */}
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="h-9 w-48 rounded-lg border-slate-200 dark:border-slate-700 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Stage ({applications.length})</SelectItem>
              {ORDERED_RECRUITMENT_STAGES.map(s => (
                <SelectItem key={s} value={s}>
                  {statusDisplayLabels[s]} ({stageCounts.get(s) || 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Actions */}
          <div className="ml-auto flex items-center gap-2">
            {!selectionMode ? (
              <>
                <Button size="sm" variant="outline" className="text-xs h-9 rounded-lg"
                  onClick={() => { setSelection({ selectedIds: new Set(filteredApplications.map(a => a.id!)) }); setIsWizardOpen(true); }}>
                  Jadwalkan Semua
                </Button>
                <Button size="sm" variant="outline" className="text-xs h-9 rounded-lg" onClick={() => setSelectionMode(true)}>
                  Pilih Kandidat
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" className="text-xs h-9" onClick={() => setSelectionMode(false)}>
                Batal
              </Button>
            )}
          </div>
        </div>

        {/* Selection bar */}
        {selectionMode && (
          <div className="sticky top-16 z-10 p-3 bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-900 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Checkbox checked={isAllSelected} onCheckedChange={handleSelectAll} />
              <span className="text-sm font-medium">{selection.selectedIds.size} kandidat terpilih</span>
            </div>
            <Button size="sm" onClick={() => setIsWizardOpen(true)} disabled={selection.selectedIds.size === 0}>
              Jadwalkan Wawancara
            </Button>
          </div>
        )}
      </div>

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-base">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50">
                {selectionMode && <th className="px-5 py-4 w-[50px]"><Checkbox checked={isAllSelected} onCheckedChange={handleSelectAll} /></th>}
                <th className="px-5 py-4 text-left text-sm font-bold text-slate-700 dark:text-slate-300">Kandidat</th>
                <th className="px-5 py-4 text-left text-sm font-bold text-slate-700 dark:text-slate-300">Stage</th>
                <th className="px-5 py-4 text-left text-sm font-bold text-slate-700 dark:text-slate-300">Jadwal</th>
                <th className="px-5 py-4 text-left text-sm font-bold text-slate-700 dark:text-slate-300">PIC</th>
                <th className="px-5 py-4 text-left text-sm font-bold text-slate-700 dark:text-slate-300">Submit</th>
                <th className="px-5 py-4 text-right text-sm font-bold text-slate-700 dark:text-slate-300">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {sortedApplications.length > 0 ? (
                sortedApplications.map(app => {
                  const interview = getMostRelevantInterview(app);
                  const assignedUsers = app.allPanelistIds?.map(id => userMap.get(id)).filter((u): u is UserProfile => !!u) || [];
                  return (
                    <tr key={app.id} className={cn(
                      'border-b border-slate-100 dark:border-slate-800 transition-colors',
                      selection.selectedIds.has(app.id!) ? 'bg-teal-50 dark:bg-teal-950/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    )}>
                      {selectionMode && (
                        <td className="px-5 py-4 align-middle">
                          <Checkbox checked={selection.selectedIds.has(app.id!)}
                            onCheckedChange={c => handleSelectRow(app.id!, !!c)} />
                        </td>
                      )}
                      <td className="px-5 py-4 align-middle">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-base font-bold text-slate-900 dark:text-white">{app.candidateName}</p>
                          {isPrivilegedRecruiter && (
                            <MultiApplicationBadge otherApplications={multiAppMap.get(app.candidateUid) || []} />
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 align-middle">
                        <ApplicationStatusBadge status={app.status} />
                      </td>
                      <td className="px-5 py-4 align-middle text-sm">
                        {interview ? (
                          <div className="space-y-1">
                            <p className="font-semibold text-slate-800 dark:text-slate-200">{format(interview.startAt.toDate(), 'dd MMM HH:mm')}</p>
                            {interview.status === 'reschedule_requested' && (
                              <Badge variant="outline" className="text-amber-600 text-xs">Reschedule</Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 align-middle">
                        {assignedUsers.length > 0 ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <div className="flex -space-x-2">
                                  {assignedUsers.slice(0, 2).map(u => (
                                    <Avatar key={u.uid} className="h-8 w-8 border-2 border-white dark:border-slate-900 ring-1 ring-slate-200 dark:ring-slate-700">
                                      <AvatarFallback className="text-[9px] font-bold bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
                                        {getInitials(u.fullName)}
                                      </AvatarFallback>
                                    </Avatar>
                                  ))}
                                  {assignedUsers.length > 2 && (
                                    <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 text-[9px] font-bold flex items-center justify-center border-2 border-white dark:border-slate-900 ring-1 ring-slate-200 dark:ring-slate-700">
                                      +{assignedUsers.length - 2}
                                    </div>
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">{assignedUsers.map(u => u.fullName).join(', ')}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span className="text-slate-400 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 align-middle text-sm text-slate-600 dark:text-slate-400">
                        {app.submittedAt ? format(app.submittedAt.toDate(), 'dd MMM') : '—'}
                      </td>
                      <td className="px-5 py-4 align-middle text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-9 px-2.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200">
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/recruitment/applications/${app.id}`} className="gap-2 text-sm">
                                <Eye className="h-4 w-4" /> Lihat Detail
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => { setActiveApplication(app); setIsSingleScheduleOpen(true); }} className="gap-2 text-sm">
                              <Clock className="h-4 w-4" /> Jadwalkan
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2 text-sm">
                              <Pencil className="h-4 w-4" /> Ubah Stage
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr><td colSpan={selectionMode ? 7 : 6} className="h-32 text-center text-slate-400 align-middle py-8">
                  <p className="text-base">Tidak ada kandidat</p>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Dialogs ──────────────────────────────────────────────────────────── */}
      {userProfile && job && (
        <BulkScheduleWizard
          isOpen={isWizardOpen}
          onOpenChange={setIsWizardOpen}
          candidates={selectedApplications}
          recruiter={userProfile}
          job={job}
          onSuccess={() => { setSelection({ selectedIds: new Set() }); onJobUpdate(); }}
        />
      )}
      {job && (
        <EditInterviewTemplateDialog
          open={isTemplateDialogOpen}
          onOpenChange={setIsTemplateDialogOpen}
          job={job}
          initialTemplateData={detectedTemplate || undefined}
          onSave={handleSaveTemplate}
          readOnly={!isPrivilegedRecruiter}
        />
      )}
      {activeApplication && userProfile && job && (
        <ScheduleInterviewDialog
          open={isSingleScheduleOpen}
          onOpenChange={setIsSingleScheduleOpen}
          onConfirm={handleSaveSingleInterview}
          initialData={getMostRelevantInterview(activeApplication) ? {
            dateTime: getMostRelevantInterview(activeApplication)!.startAt.toDate(),
            duration: differenceInMinutes(
              getMostRelevantInterview(activeApplication)!.endAt.toDate(),
              getMostRelevantInterview(activeApplication)!.startAt.toDate()
            ),
            meetingLink: getMostRelevantInterview(activeApplication)!.meetingLink,
          } : undefined}
          candidateName={activeApplication.candidateName}
          recruiter={userProfile}
          job={job}
        />
      )}
    </div>
  );
}
