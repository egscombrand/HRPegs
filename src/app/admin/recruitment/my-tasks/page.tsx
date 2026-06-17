"use client";

import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import type { JobApplication, ApplicationInterview, Job } from "@/lib/types";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { MENU_CONFIG } from "@/lib/menu-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  format, differenceInMinutes, isToday, isTomorrow, isPast, isAfter, startOfDay,
} from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  ArrowRight, Briefcase, Calendar, Clock, Users, Video,
  Info, ExternalLink, ChevronRight, Search, CheckCircle2,
  AlertCircle, Archive, ClipboardCheck,
} from "lucide-react";
import Link from "next/link";
import { getInitials, cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const safeToDate = (ts: any): Date | null => {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate();
  if (typeof ts.toMillis === "function") return new Date(ts.toMillis());
  if (ts.seconds !== undefined) return new Date(ts.seconds * 1000);
  return null;
};

const getDisplayInterview = (app: JobApplication): ApplicationInterview | null => {
  if (!app.interviews?.length) return null;
  const active = app.interviews
    .filter(iv => iv?.status === "scheduled" && iv.startAt)
    .sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis());
  if (active.length > 0) return active[0];
  return app.interviews.filter(iv => iv?.startAt)
    .sort((a, b) => b.startAt.toMillis() - a.startAt.toMillis())[0] || null;
};

// ─── Unified schedule info ─────────────────────────────────────────────────────
// Priority: app.interviews[] > job.interviewTemplate

interface ScheduleInfo {
  date: Date | null;         // start datetime
  endDate: Date | null;      // end datetime
  meetingLink: string | null;
  durationMins: number | null;
  source: "interview" | "template";
  interview: ApplicationInterview | null; // raw interview, for modal
}

function getScheduleInfo(app: JobApplication, job: Job | undefined): ScheduleInfo {
  // 1. Try actual interviews
  const iv = getDisplayInterview(app);
  if (iv) {
    const d = safeToDate(iv.startAt);
    const end = safeToDate(iv.endAt);
    const link = iv.meetingPublished !== false ? (iv.meetingLink || null) : null;
    return {
      date: d,
      endDate: end,
      meetingLink: link,
      durationMins: d && end ? differenceInMinutes(end, d) : null,
      source: "interview",
      interview: iv,
    };
  }

  // 2. Fall back to job interviewTemplate
  const tmpl = job?.interviewTemplate;
  if (tmpl) {
    const dateBase = safeToDate(tmpl.defaultStartDate);
    let combinedDate: Date | null = null;
    if (dateBase && tmpl.workdayStartTime) {
      const [hh, mm] = tmpl.workdayStartTime.split(":").map(Number);
      combinedDate = new Date(dateBase);
      if (!isNaN(hh) && !isNaN(mm)) combinedDate.setHours(hh, mm, 0, 0);
    } else {
      combinedDate = dateBase;
    }
    const durationMins = tmpl.slotDurationMinutes ?? null;
    const endDate = combinedDate && durationMins
      ? new Date(combinedDate.getTime() + durationMins * 60_000)
      : null;
    const link = tmpl.meetingPublished !== false ? (tmpl.meetingLink || null) : null;
    // Only return template schedule if there's any useful data
    if (combinedDate || link) {
      return { date: combinedDate, endDate, meetingLink: link, durationMins, source: "template", interview: null };
    }
  }

  return { date: null, endDate: null, meetingLink: null, durationMins: null, source: "interview", interview: null };
}

const formatScheduleDate = (s: ScheduleInfo): string => {
  const d = s.date;
  if (!d) return s.meetingLink ? "Jadwal tersedia" : "–";
  if (isToday(d)) return `Hari ini, ${format(d, "HH.mm")} WIB`;
  if (isTomorrow(d)) return `Besok, ${format(d, "HH.mm")} WIB`;
  if (isPast(d)) return `Terlewat · ${format(d, "dd MMM, HH.mm")}`;
  return format(d, "dd MMM yyyy, HH.mm") + " WIB";
};

// ─── Task categories ──────────────────────────────────────────────────────────

type TaskTab = "todo" | "today" | "upcoming" | "done" | "archived";

interface CategorizedApp {
  app: JobApplication;
  schedule: ScheduleInfo;
  tab: TaskTab;
  taskBadge: string;
  taskBadgeVariant: "default" | "secondary" | "outline" | "destructive";
  taskBadgeClass: string;
  actionLabel: string;
  actionHref?: string;
  meetingLink?: string | null;
}

function categorize(
  app: JobApplication,
  uid: string,
  jobMap: Map<string, Job>,
): CategorizedApp {
  const job = jobMap.get(app.jobId);
  const schedule = getScheduleInfo(app, job);
  const ivDate = schedule.date;

  // Check if user has submitted evaluations
  const preEvalSubmissions = (app.internalReviewConfig?.evaluations || []) as any[];
  const hasMyPreEval = preEvalSubmissions.some(
    (e: any) => e.reviewerUid === uid || e.uid === uid,
  );
  const postEvalSubmissions = (app.postInterviewEvaluation?.evaluatorSubmissions || []) as any[];
  const hasMyPostEval = postEvalSubmissions.some(
    (e: any) => e.evaluatorUid === uid || e.uid === uid,
  );
  const hasSubmittedEval = hasMyPreEval || hasMyPostEval;

  const isInterviewDone =
    app.interviewCompleted === true ||
    !!app.interviewCompletedAt ||
    (app.postInterviewEvaluation?.submissions ?? 0) > 0 ||
    !!app.postInterviewDecision;

  const isArchivedStatus =
    app.status === "rejected" ||
    app.status === "hired" ||
    app.recruitmentInternalDecision === "tidak_dilanjutkan_saat_ini";

  const isJobClosed = job?.publishStatus === "closed" || job?.publishStatus === "expired";

  // ARCHIVED
  if (isArchivedStatus || isJobClosed) {
    return {
      app, schedule, tab: "archived",
      taskBadge: "Diarsipkan",
      taskBadgeVariant: "secondary",
      taskBadgeClass: "text-slate-500 bg-slate-100 dark:bg-slate-800 border-0",
      actionLabel: "Lihat Detail",
      actionHref: `/admin/recruitment/applications/${app.id}`,
      meetingLink: schedule.meetingLink,
    };
  }

  // DONE
  if (isInterviewDone && hasSubmittedEval) {
    return {
      app, schedule, tab: "done",
      taskBadge: "Selesai",
      taskBadgeVariant: "outline",
      taskBadgeClass: "text-green-700 border-green-300 bg-green-50 dark:bg-green-900/20",
      actionLabel: "Lihat Hasil",
      actionHref: `/admin/recruitment/applications/${app.id}`,
      meetingLink: schedule.meetingLink,
    };
  }

  // TODAY
  if (ivDate && isToday(ivDate)) {
    const link = schedule.meetingLink;
    return {
      app, schedule, tab: "today",
      taskBadge: "Wawancara Hari Ini",
      taskBadgeVariant: "default",
      taskBadgeClass: "text-amber-800 bg-amber-100 dark:bg-amber-900/30 border-amber-300",
      actionLabel: link ? "Buka Link Wawancara" : "Lihat Tugas",
      actionHref: link ? undefined : `/admin/recruitment/applications/${app.id}`,
      meetingLink: link,
    };
  }

  // UPCOMING
  if (ivDate && isAfter(ivDate, startOfDay(new Date())) && !isToday(ivDate)) {
    return {
      app, schedule, tab: "upcoming",
      taskBadge: "Akan Datang",
      taskBadgeVariant: "outline",
      taskBadgeClass: "text-blue-700 border-blue-300 bg-blue-50 dark:bg-blue-900/20",
      actionLabel: "Lihat Tugas",
      actionHref: `/admin/recruitment/applications/${app.id}`,
      meetingLink: schedule.meetingLink,
    };
  }

  // TODO — needs evaluation or active interview without schedule
  const needsEval = (app.status === "interview" || app.status === "screening") && !hasSubmittedEval;
  const hasAnySchedule = !!schedule.date || !!schedule.meetingLink;
  return {
    app, schedule, tab: "todo",
    taskBadge: needsEval ? "Perlu Evaluasi" : hasAnySchedule ? "Perlu Tindakan" : "Menunggu Jadwal",
    taskBadgeVariant: "default",
    taskBadgeClass: "text-teal-800 bg-teal-100 dark:bg-teal-900/30 border-teal-300",
    actionLabel: needsEval ? "Isi Evaluasi" : "Lihat Tugas",
    actionHref: `/admin/recruitment/applications/${app.id}`,
    meetingLink: schedule.meetingLink,
  };
}

// ─── Modal ─────────────────────────────────────────────────────────────────────

type ModalData = {
  schedule: ScheduleInfo;
  app: JobApplication;
};

function InterviewDetailModal({ data, open, onClose }: {
  data: ModalData | null; open: boolean; onClose: () => void;
}) {
  if (!data) return null;
  const { schedule, app } = data;
  const meetingLink = schedule.meetingLink;
  const startDate = schedule.date;
  const endDate = schedule.endDate;
  const duration = schedule.durationMins;
  const panelistNames = schedule.interview?.panelistNames ?? [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="bg-primary/10 text-primary font-bold text-lg">
                {getInitials(app.candidateName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <DialogTitle className="text-xl mb-1">{app.candidateName}</DialogTitle>
              <DialogDescription>{app.jobPosition} &middot; {app.brandName}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <Separator />
        <div className="grid md:grid-cols-2 gap-x-6 gap-y-6 py-2">
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-0.5">Tanggal</p>
                {startDate ? (
                  <p className="font-semibold">{format(startDate, "EEEE, dd MMMM yyyy", { locale: idLocale })}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Belum ditentukan</p>
                )}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-0.5">Waktu (WIB)</p>
                {startDate ? (
                  <p className="font-semibold">
                    {format(startDate, "HH:mm")}{endDate ? ` – ${format(endDate, "HH:mm")}` : ""} WIB
                  </p>
                ) : <p className="text-sm text-muted-foreground italic">Belum ditentukan</p>}
                {duration != null && <p className="text-xs text-muted-foreground mt-0.5">Durasi: {duration} menit</p>}
              </div>
            </div>
            {panelistNames.length > 0 && (
              <div className="flex items-start gap-3">
                <Users className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Pewawancara / Panelis</p>
                  <div className="flex flex-wrap gap-1.5">
                    {panelistNames.map((name, i) => <Badge key={i} variant="secondary">{name}</Badge>)}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="space-y-4">
            {meetingLink ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <Video className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Link Wawancara</p>
                    <p className="text-xs font-mono text-muted-foreground break-all">{meetingLink}</p>
                  </div>
                </div>
                <Button asChild className="gap-2 w-full">
                  <a href={meetingLink} target="_blank" rel="noopener noreferrer">
                    <Video className="h-4 w-4" />
                    Buka Link Wawancara
                    <ExternalLink className="h-3.5 w-3.5 ml-auto" />
                  </a>
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                <Video className="h-5 w-5 text-muted-foreground shrink-0" />
                <p className="text-sm text-muted-foreground">Link belum tersedia</p>
              </div>
            )}
            {schedule.interview?.notes && (
              <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                <Info className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Catatan</p>
                  <p className="text-sm">{schedule.interview.notes}</p>
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href={`/admin/recruitment/applications/${app.id}`}>
              Lihat Tugas <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({ item, onOpenModal }: {
  item: CategorizedApp;
  onOpenModal: (data: ModalData) => void;
}) {
  const { app, schedule, taskBadge, taskBadgeClass, actionLabel, actionHref, meetingLink } = item;
  const isActuallyToday = schedule.date && isToday(schedule.date);
  const hasSchedule = !!schedule.date || !!schedule.meetingLink;

  return (
    <div className={cn(
      "rounded-xl border bg-white dark:bg-slate-900 p-4 shadow-sm transition-shadow hover:shadow-md",
      isActuallyToday && "border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-900/10",
    )}>
      <div className="flex items-start gap-3">
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarFallback className="bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 font-bold text-sm">
            {getInitials(app.candidateName)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <p className="font-bold text-slate-900 dark:text-white truncate">{app.candidateName}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{app.jobPosition} · {app.brandName}</p>
            </div>
            <Badge className={cn("text-[10px] px-2 py-0 font-semibold border shrink-0", taskBadgeClass)}>
              {taskBadge}
            </Badge>
          </div>

          {/* Schedule row */}
          <div className="mt-2.5 flex items-center gap-4 flex-wrap text-xs">
            {hasSchedule ? (
              <button
                className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                onClick={() => onOpenModal({ schedule, app })}
              >
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                <span className={cn("font-medium", isActuallyToday && "text-amber-700 dark:text-amber-400")}>
                  {formatScheduleDate(schedule)}
                </span>
                {schedule.durationMins != null && (
                  <span className="text-slate-400">· {schedule.durationMins} mnt</span>
                )}
              </button>
            ) : (
              <span className="flex items-center gap-1.5 text-slate-400 italic">
                <Calendar className="h-3.5 w-3.5" /> Menunggu jadwal
              </span>
            )}
          </div>

          {/* Action row */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {meetingLink ? (
              <Button asChild size="sm" className="h-7 px-3 text-xs bg-teal-600 hover:bg-teal-700 text-white">
                <a href={meetingLink} target="_blank" rel="noopener noreferrer">
                  <Video className="h-3 w-3 mr-1.5" />
                  Buka Link Wawancara
                </a>
              </Button>
            ) : actionHref && (
              <Button asChild size="sm" variant="outline" className="h-7 px-3 text-xs">
                <Link href={actionHref}>
                  {actionLabel === "Isi Evaluasi" && <ClipboardCheck className="h-3 w-3 mr-1.5" />}
                  {actionLabel}
                  <ArrowRight className="h-3 w-3 ml-1.5" />
                </Link>
              </Button>
            )}
            {/* Secondary: link to detail page */}
            {meetingLink && actionHref && (
              <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs text-slate-500">
                <Link href={actionHref}>Lihat Tugas</Link>
              </Button>
            )}
            {!meetingLink && hasSchedule && (
              <button
                className="text-xs text-slate-400 hover:text-slate-600 underline-offset-2 hover:underline"
                onClick={() => onOpenModal({ schedule, app })}
              >
                Detail Jadwal
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab pane ─────────────────────────────────────────────────────────────────

function TaskList({ items, emptyText, onOpenModal }: {
  items: CategorizedApp[];
  emptyText: string;
  onOpenModal: (data: ModalData) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
          <Briefcase className="h-6 w-6 text-slate-400" />
        </div>
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{emptyText}</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {items.map(item => (
        <TaskCard key={item.app.id} item={item} onOpenModal={onOpenModal} />
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MyRecruitmentTasksPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();

  const [modalData, setModalData] = useState<ModalData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TaskTab>("todo");
  const [searchTerm, setSearchTerm] = useState("");

  const openModal = (data: ModalData) => { setModalData(data); setIsModalOpen(true); };

  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    return MENU_CONFIG[userProfile.role] || [];
  }, [userProfile]);

  // ── Queries ───────────────────────────────────────────────────────────────

  const directAssignmentQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(collection(firestore, "applications"),
      where("internalReviewConfig.assignedReviewerUids", "array-contains", userProfile.uid));
  }, [firestore, userProfile?.uid]);

  const panelistAssignmentQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(collection(firestore, "applications"),
      where("allPanelistIds", "array-contains", userProfile.uid));
  }, [firestore, userProfile?.uid]);

  const assignedJobsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(collection(firestore, "jobs"),
      where("assignedUserIds", "array-contains", userProfile.uid));
  }, [firestore, userProfile?.uid]);

  const { data: directApps, isLoading: loadingDirect } = useCollection<JobApplication>(directAssignmentQuery);
  const { data: panelistApps, isLoading: loadingPanelist } = useCollection<JobApplication>(panelistAssignmentQuery);
  const { data: assignedJobs, isLoading: loadingAssignedJobs } = useCollection<Job>(assignedJobsQuery);

  const [assignedJobApps, setAssignedJobApps] = useState<JobApplication[]>([]);
  const [loadingAssignedJobApps, setLoadingAssignedJobApps] = useState(false);

  const assignedJobIds = useMemo(() =>
    (assignedJobs || []).map(j => j.id).filter((id): id is string => Boolean(id)),
    [assignedJobs]);

  useEffect(() => {
    let canceled = false;
    const load = async () => {
      if (!assignedJobIds.length) { setAssignedJobApps([]); return; }
      setLoadingAssignedJobApps(true);
      try {
        const results: JobApplication[] = [];
        for (let i = 0; i < assignedJobIds.length; i += 10) {
          const chunk = assignedJobIds.slice(i, i + 10);
          const snap = await getDocs(query(collection(firestore, "applications"), where("jobId", "in", chunk)));
          snap.forEach(d => results.push({ id: d.id, ...d.data() } as JobApplication));
        }
        if (!canceled) setAssignedJobApps(results);
      } catch {}
      finally { if (!canceled) setLoadingAssignedJobApps(false); }
    };
    load();
    return () => { canceled = true; };
  }, [assignedJobIds, firestore]);

  const applications = useMemo(() => {
    const all = [...(directApps || []), ...(panelistApps || []), ...assignedJobApps];
    const unique = Array.from(new Map(all.map(a => [a.id, a])).values());
    return unique.sort((a, b) => {
      const ta = a.updatedAt?.toMillis?.() || (a.updatedAt as any)?.seconds || 0;
      const tb = b.updatedAt?.toMillis?.() || (b.updatedAt as any)?.seconds || 0;
      return tb - ta;
    });
  }, [directApps, panelistApps, assignedJobApps]);

  const allRelevantJobIds = useMemo(() =>
    Array.from(new Set(applications.map(a => a.jobId))),
    [applications]);

  const allJobsQuery = useMemoFirebase(() => {
    if (allRelevantJobIds.length === 0) return null;
    return query(collection(firestore, "jobs"),
      where("__name__", "in", allRelevantJobIds.slice(0, 30)));
  }, [firestore, allRelevantJobIds]);
  const { data: allRelevantJobs, isLoading: loadingAllJobs } = useCollection<Job>(allJobsQuery);

  const jobMap = useMemo(() => {
    const map = new Map<string, Job>();
    (allRelevantJobs || []).forEach(j => { if (j.id) map.set(j.id, j); });
    return map;
  }, [allRelevantJobs]);

  const isLoading = authLoading || loadingDirect || loadingPanelist || loadingAssignedJobs || loadingAssignedJobApps || loadingAllJobs;

  // ── Categorize ────────────────────────────────────────────────────────────

  const categorized = useMemo(() => {
    if (!userProfile?.uid) return [];
    const q = searchTerm.toLowerCase();
    return applications
      .filter(app =>
        !q ||
        app.candidateName.toLowerCase().includes(q) ||
        app.jobPosition.toLowerCase().includes(q),
      )
      .map(app => categorize(app, userProfile.uid, jobMap));
  }, [applications, userProfile?.uid, jobMap, searchTerm]);

  const byTab = useMemo(() => ({
    todo: categorized.filter(c => c.tab === "todo"),
    today: categorized.filter(c => c.tab === "today"),
    upcoming: categorized.filter(c => c.tab === "upcoming"),
    done: categorized.filter(c => c.tab === "done"),
    archived: categorized.filter(c => c.tab === "archived"),
  }), [categorized]);

  const tabLabel = (tab: TaskTab) => {
    const counts: Record<TaskTab, number> = {
      todo: byTab.todo.length,
      today: byTab.today.length,
      upcoming: byTab.upcoming.length,
      done: byTab.done.length,
      archived: byTab.archived.length,
    };
    return counts[tab] > 0 ? counts[tab] : undefined;
  };

  if (!userProfile) return null;

  return (
    <DashboardLayout pageTitle="Tugas Rekrutmen Saya" menuConfig={menuConfig}>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Tugas Rekrutmen Saya
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Kandidat yang ditugaskan kepada Anda untuk evaluasi atau wawancara.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
        ) : applications.length === 0 ? (
          <Card className="border-dashed py-12">
            <CardContent className="flex flex-col items-center justify-center text-center">
              <div className="bg-muted p-4 rounded-full mb-4">
                <Briefcase className="h-10 w-10 text-muted-foreground/40" />
              </div>
              <h3 className="text-lg font-semibold">Tidak Ada Tugas</h3>
              <p className="text-muted-foreground max-w-sm mx-auto mt-2 text-sm">
                Tugas akan muncul di sini jika HRD menambahkan Anda sebagai reviewer atau panelis.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* KPI Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Perlu Dikerjakan", count: byTab.todo.length + byTab.today.length, icon: AlertCircle, color: "text-teal-700 dark:text-teal-400", bg: "bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800" },
                { label: "Jadwal Hari Ini", count: byTab.today.length, icon: Calendar, color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800" },
                { label: "Akan Datang", count: byTab.upcoming.length, icon: Clock, color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800" },
                { label: "Selesai", count: byTab.done.length, icon: CheckCircle2, color: "text-green-700 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" },
              ].map(({ label, count, icon: Icon, color, bg }) => (
                <div key={label} className={cn("rounded-xl border p-3 flex items-center gap-3", bg)}>
                  <Icon className={cn("h-5 w-5 shrink-0", color)} />
                  <div>
                    <p className="text-2xl font-bold tabular-nums leading-none">{count}</p>
                    <p className={cn("text-[11px] font-medium mt-0.5", color)}>{label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Search */}
            <div className="relative max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari kandidat atau posisi..."
                className="pl-8"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={v => setActiveTab(v as TaskTab)}>
              <TabsList className="flex w-full h-auto gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl flex-wrap">
                {([
                  { key: "todo", label: "Perlu Dikerjakan" },
                  { key: "today", label: "Hari Ini" },
                  { key: "upcoming", label: "Akan Datang" },
                  { key: "done", label: "Selesai" },
                  { key: "archived", label: "Arsip" },
                ] as { key: TaskTab; label: string }[]).map(({ key, label }) => {
                  const count = tabLabel(key);
                  return (
                    <TabsTrigger key={key} value={key} className="flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 flex-1 min-w-fit">
                      {label}
                      {count !== undefined && (
                        <span className={cn(
                          "inline-flex items-center justify-center rounded-full text-[10px] font-bold px-1.5 min-w-[18px] h-[18px]",
                          key === "todo" || key === "today"
                            ? "bg-teal-500 text-white"
                            : "bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-200",
                        )}>
                          {count}
                        </span>
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              <TabsContent value="todo" className="mt-4">
                <TaskList
                  items={byTab.todo}
                  emptyText="Tidak ada tugas yang perlu dikerjakan saat ini."
                  onOpenModal={openModal}
                />
              </TabsContent>
              <TabsContent value="today" className="mt-4">
                <TaskList
                  items={byTab.today}
                  emptyText="Tidak ada jadwal wawancara hari ini."
                  onOpenModal={openModal}
                />
              </TabsContent>
              <TabsContent value="upcoming" className="mt-4">
                <TaskList
                  items={byTab.upcoming}
                  emptyText="Tidak ada jadwal wawancara yang akan datang."
                  onOpenModal={openModal}
                />
              </TabsContent>
              <TabsContent value="done" className="mt-4">
                <TaskList
                  items={byTab.done}
                  emptyText="Belum ada tugas yang selesai."
                  onOpenModal={openModal}
                />
              </TabsContent>
              <TabsContent value="archived" className="mt-4">
                <TaskList
                  items={byTab.archived}
                  emptyText="Tidak ada tugas yang diarsipkan."
                  onOpenModal={openModal}
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      <InterviewDetailModal
        data={modalData}
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </DashboardLayout>
  );
}
