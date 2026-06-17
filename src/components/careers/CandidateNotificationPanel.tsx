"use client";

import { useAuth } from "@/providers/auth-provider";
import {
  useCollection,
  useFirestore,
  useMemoFirebase,
  updateDocumentNonBlocking,
} from "@/firebase";
import {
  collection,
  query,
  orderBy,
  doc,
  writeBatch,
  where,
} from "firebase/firestore";
import type { Notification } from "@/lib/types";
import { useMemo, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  Loader2,
  BellOff,
  Briefcase,
  Calendar,
  UserCheck,
  ClipboardList,
  Megaphone,
} from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";

// ─── Tab definitions ─────────────────────────────────────────────────────────

type CandidateTabKey = "all" | "lamaran" | "wawancara";

const CANDIDATE_TABS: { key: CandidateTabKey; label: string }[] = [
  { key: "all",       label: "Semua"      },
  { key: "lamaran",   label: "Lamaran"    },
  { key: "wawancara", label: "Wawancara"  },
];

// Types that belong to the "wawancara" tab
const WAWANCARA_TYPES = new Set([
  "interview_scheduled",
  "interview_updated",
  "interview_rescheduled",
  "interview_reminder",
  "interview_completed",
]);

// Types that belong to the "lamaran" tab
const LAMARAN_TYPES = new Set([
  "stage_advanced",
  "new_application",
  "application_update",
  "application_submitted",
  "application_under_review",
  "advanced_to_interview",
  "final_instruction",
  "announcement",
]);

function resolveTab(notif: Notification): CandidateTabKey {
  if (WAWANCARA_TYPES.has(notif.type)) return "wawancara";
  return "lamaran";
}

// ─── Icon ─────────────────────────────────────────────────────────────────────

function CandidateNotifIcon({ notif }: { notif: Notification }) {
  const tab = resolveTab(notif);
  if (tab === "wawancara") {
    return <Calendar className="h-4 w-4 text-indigo-600" />;
  }
  switch (notif.type) {
    case "stage_advanced":
    case "advanced_to_interview":
      return <UserCheck className="h-4 w-4 text-teal-600" />;
    case "new_application":
    case "application_submitted":
      return <ClipboardList className="h-4 w-4 text-teal-600" />;
    case "announcement":
    case "final_instruction":
      return <Megaphone className="h-4 w-4 text-amber-600" />;
    default:
      return <Briefcase className="h-4 w-4 text-teal-600" />;
  }
}

function CategoryBadge({ notif }: { notif: Notification }) {
  const tab = resolveTab(notif);
  if (tab === "wawancara") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
        Wawancara
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
      Lamaran
    </span>
  );
}

// ─── Resolve actionUrl for candidate ─────────────────────────────────────────

function resolveActionUrl(notif: Notification): string {
  if (notif.actionUrl) return notif.actionUrl;
  const tab = resolveTab(notif);
  if (tab === "wawancara") return "/careers/portal/interviews";
  return "/careers/portal/applications";
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CandidateNotificationPanel() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<CandidateTabKey>("all");

  // Only read from the candidate's own notification subcollection
  const notificationsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(
      collection(firestore, "users", userProfile.uid, "notifications"),
      orderBy("createdAt", "desc"),
    );
  }, [userProfile?.uid, firestore]);

  const { data: rawNotifications, isLoading, mutate } =
    useCollection<Notification>(notificationsQuery);

  // Filter out any internal/HR notifications that accidentally ended up in the user's collection
  const notifications = useMemo(() => {
    const all = (rawNotifications || []).filter((n) => {
      // Keep only candidate-facing notification types
      const isCandidate =
        n.module === "recruitment" ||
        WAWANCARA_TYPES.has(n.type) ||
        LAMARAN_TYPES.has(n.type) ||
        n.type === "stage_advanced";
      // Drop anything that looks like an internal/HR notif
      const isHrInternal =
        n.module === "employee" ||
        n.module === "attendance" ||
        n.module === "leave" ||
        n.module === "overtime" ||
        n.type === "bank_change_request" ||
        n.type === "recruitment_assignment" ||
        n.notificationType === "system";
      return isCandidate && !isHrInternal;
    });

    if (activeTab === "all") return all;
    return all.filter((n) => resolveTab(n) === activeTab);
  }, [rawNotifications, activeTab]);

  const unreadCounts = useMemo(() => {
    const counts: Record<CandidateTabKey, number> = { all: 0, lamaran: 0, wawancara: 0 };
    (rawNotifications || []).forEach((n) => {
      if (!n.isRead) {
        const tab = resolveTab(n);
        counts.all++;
        counts[tab] = (counts[tab] || 0) + 1;
      }
    });
    return counts;
  }, [rawNotifications]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleMarkAsRead = async (notif: Notification) => {
    if (!userProfile || notif.isRead) return;
    try {
      const ref = doc(firestore, "users", userProfile.uid, "notifications", notif.id!);
      await updateDocumentNonBlocking(ref, { isRead: true, notifStatus: "read" });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Gagal menandai notifikasi." });
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!userProfile || !rawNotifications) return;
    const unread = rawNotifications.filter((n) => !n.isRead);
    if (!unread.length) return;

    const batch = writeBatch(firestore);
    unread.forEach((n) => {
      const ref = doc(firestore, "users", userProfile.uid, "notifications", n.id!);
      batch.update(ref, { isRead: true, notifStatus: "read" });
    });
    try {
      await batch.commit();
      mutate();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Gagal menandai semua notifikasi." });
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex justify-between items-center mb-0.5">
          <h3 className="font-semibold text-sm">Notifikasi</h3>
          {unreadCounts.all > 0 && (
            <Button
              variant="link"
              size="sm"
              className="text-xs h-auto p-0 text-muted-foreground"
              onClick={handleMarkAllAsRead}
            >
              Tandai semua dibaca
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mb-3 leading-snug">
          Informasi terbaru terkait proses lamaran Anda.
        </p>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-hide">
          {CANDIDATE_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-1 shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                activeTab === tab.key
                  ? "bg-teal-600 text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              {tab.label}
              {unreadCounts[tab.key] > 0 && (
                <span
                  className={cn(
                    "inline-flex items-center justify-center h-4 min-w-[16px] px-0.5 rounded-full text-[10px] font-bold",
                    activeTab === tab.key
                      ? "bg-white/30 text-white"
                      : "bg-teal-600 text-white",
                  )}
                >
                  {unreadCounts[tab.key] > 9 ? "9+" : unreadCounts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        {isLoading && (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && notifications.length === 0 && (
          <div className="text-center p-8 space-y-2">
            <BellOff className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="font-semibold text-sm">Belum ada notifikasi</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {activeTab === "all"
                ? "Informasi terbaru terkait lamaran dan jadwal wawancara Anda akan muncul di sini."
                : activeTab === "wawancara"
                  ? "Belum ada informasi jadwal wawancara untuk saat ini."
                  : "Belum ada pembaruan terkait lamaran Anda."}
            </p>
          </div>
        )}

        <div className="p-2 space-y-1">
          {notifications.map((notif) => {
            const href = resolveActionUrl(notif);
            const tabKey = resolveTab(notif);

            return (
              <Link
                key={notif.id}
                href={href}
                className={cn(
                  "block rounded-lg transition-colors hover:bg-accent",
                  !notif.isRead && "bg-teal-50/60 dark:bg-teal-900/10",
                  !notif.isRead && tabKey === "wawancara" && "bg-indigo-50/60 dark:bg-indigo-900/10",
                )}
                onClick={() => handleMarkAsRead(notif)}
              >
                <div className="flex items-start gap-3 p-3">
                  {/* Icon circle */}
                  <div
                    className={cn(
                      "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full mt-0.5",
                      tabKey === "wawancara"
                        ? "bg-indigo-50 dark:bg-indigo-900/30"
                        : "bg-teal-50 dark:bg-teal-900/30",
                    )}
                  >
                    <CandidateNotifIcon notif={notif} />
                    {!notif.isRead && (
                      <span className="absolute top-0 right-0 flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-500 opacity-75" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal-500" />
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-grow min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <CategoryBadge notif={notif} />
                    </div>
                    <p className="text-sm font-semibold text-foreground leading-snug">
                      {notif.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                      {notif.message}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      {notif.createdAt?.toDate
                        ? formatDistanceToNow(notif.createdAt.toDate(), {
                            addSuffix: true,
                            locale: idLocale,
                          })
                        : ""}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
