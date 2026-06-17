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
} from "firebase/firestore";
import type { Notification, NotificationType } from "@/lib/types";
import { useMemo, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  Loader2,
  BellOff,
  Bell,
  Briefcase,
  Calendar,
  CheckCircle,
  Wallet,
  UserCheck,
  ClipboardList,
  Clock,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";

// ─── Tab definitions ────────────────────────────────────────────────────────

type TabKey = "all" | NotificationType;

const TABS: { key: TabKey; label: string }[] = [
  { key: "all",              label: "Semua"     },
  { key: "recruitment",      label: "Rekrutmen" },
  { key: "employee_request", label: "Karyawan"  },
  { key: "attendance",       label: "Absensi"   },
  { key: "system",           label: "Sistem"    },
];

// ─── Derive notificationType from legacy fields ──────────────────────────────

function resolveCategory(notif: Notification): NotificationType {
  if (notif.notificationType) return notif.notificationType;
  // Legacy: use module / type to categorise
  if (notif.module === "recruitment") return "recruitment";
  if (
    notif.type === "bank_change_request" ||
    notif.module === "employee"
  )
    return "employee_request";
  return "system";
}

// ─── Icon per category / type ────────────────────────────────────────────────

function NotifIcon({ notif }: { notif: Notification }) {
  const cat = resolveCategory(notif);

  if (cat === "recruitment") {
    switch (notif.type) {
      case "interview_scheduled":
      case "interview_updated":
        return <Calendar className="h-4 w-4 text-teal-600" />;
      case "new_application":
        return <ClipboardList className="h-4 w-4 text-teal-600" />;
      case "stage_advanced":
        return <UserCheck className="h-4 w-4 text-teal-600" />;
      default:
        return <Briefcase className="h-4 w-4 text-teal-600" />;
    }
  }
  if (cat === "employee_request") {
    if (notif.type === "bank_change_request")
      return <Wallet className="h-4 w-4 text-blue-500" />;
    return <UserCheck className="h-4 w-4 text-blue-500" />;
  }
  if (cat === "attendance")
    return <Clock className="h-4 w-4 text-amber-500" />;
  if (cat === "system")
    return <Settings className="h-4 w-4 text-slate-500" />;

  // fallback
  switch (notif.type) {
    case "bank_change_request": return <Wallet className="h-4 w-4 text-muted-foreground" />;
    case "interview_scheduled":
    case "interview_updated":   return <Calendar className="h-4 w-4 text-muted-foreground" />;
    case "negotiation":         return <Bell className="h-4 w-4 text-muted-foreground" />;
    case "decision":            return <CheckCircle className="h-4 w-4 text-muted-foreground" />;
    default:                    return <Briefcase className="h-4 w-4 text-muted-foreground" />;
  }
}

function categoryBadge(notif: Notification) {
  const cat = resolveCategory(notif);
  switch (cat) {
    case "recruitment":
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
          Rekrutmen
        </span>
      );
    case "employee_request":
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
          Karyawan
        </span>
      );
    case "attendance":
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
          Absensi
        </span>
      );
    case "system":
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          Sistem
        </span>
      );
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function NotificationPanel() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>("all");

  // User-level notifications
  const notificationsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(
      collection(firestore, "users", userProfile.uid, "notifications"),
      orderBy("createdAt", "desc"),
    );
  }, [userProfile?.uid, firestore]);
  const { data: userNotifications, isLoading: isUserLoading, mutate: mutateUser } =
    useCollection<Notification>(notificationsQuery);

  // HRD-level notifications (only for hrd / super-admin)
  const hrdNotificationsQuery = useMemoFirebase(() => {
    if (!userProfile?.role || !["hrd", "super-admin"].includes(userProfile.role))
      return null;
    return query(
      collection(firestore, "hrd_notifications"),
      orderBy("createdAt", "desc"),
    );
  }, [userProfile?.role, firestore]);
  const { data: hrdNotifications, isLoading: isHrdLoading, mutate: mutateHrd } =
    useCollection<Notification>(hrdNotificationsQuery);

  // Merge + sort
  const allNotifications = useMemo(() => {
    const un = (userNotifications || []).map((n) => ({ ...n, _source: "user" as const }));
    const hn = (hrdNotifications  || []).map((n) => ({ ...n, _source: "hrd"  as const }));
    return [...un, ...hn].sort((a, b) => {
      return (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0);
    });
  }, [userNotifications, hrdNotifications]);

  // Filtered by active tab
  const notifications = useMemo(() => {
    if (activeTab === "all") return allNotifications;
    return allNotifications.filter(
      (n) => resolveCategory(n) === activeTab,
    );
  }, [allNotifications, activeTab]);

  // Unread counts per tab (for badge)
  const unreadCounts = useMemo(() => {
    const counts: Record<TabKey, number> = {
      all: 0, recruitment: 0, employee_request: 0, attendance: 0, system: 0,
    };
    allNotifications.forEach((n) => {
      if (!n.isRead) {
        counts.all++;
        const cat = resolveCategory(n) as TabKey;
        counts[cat] = (counts[cat] || 0) + 1;
      }
    });
    return counts;
  }, [allNotifications]);

  const isLoading = isUserLoading || isHrdLoading;

  // ── Handlers ──

  const handleMarkAsRead = async (notif: any) => {
    if (!userProfile) return;
    try {
      const ref =
        notif._source === "hrd"
          ? doc(firestore, "hrd_notifications", notif.id!)
          : doc(firestore, "users", userProfile.uid, "notifications", notif.id!);
      await updateDocumentNonBlocking(ref, { isRead: true, notifStatus: "read" });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Gagal menandai notifikasi." });
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!userProfile || !allNotifications) return;
    const unread = allNotifications.filter((n) => !n.isRead);
    if (!unread.length) return;

    const batch = writeBatch(firestore);
    unread.forEach((notif: any) => {
      const ref =
        notif._source === "hrd"
          ? doc(firestore, "hrd_notifications", notif.id!)
          : doc(firestore, "users", userProfile.uid, "notifications", notif.id!);
      batch.update(ref, { isRead: true, notifStatus: "read" });
    });

    try {
      await batch.commit();
      mutateUser();
      mutateHrd();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Gagal menandai semua notifikasi." });
    }
  };

  // ── Render ──

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">Notifikasi</h3>
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

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-hide">
          {TABS.map((tab) => (
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
            <p className="font-semibold">Tidak ada notifikasi</p>
            <p className="text-sm text-muted-foreground">
              {activeTab === "all"
                ? "Semua notifikasi Anda akan muncul di sini."
                : `Belum ada notifikasi kategori ${TABS.find((t) => t.key === activeTab)?.label}.`}
            </p>
          </div>
        )}

        <div className="p-2 space-y-1">
          {notifications.map((notif) => (
            <Link
              key={notif.id}
              href={notif.actionUrl || "#"}
              className={cn(
                "block rounded-lg transition-colors hover:bg-accent",
                !notif.isRead && "bg-blue-50 dark:bg-blue-900/20",
                notif.priority === "action_required" &&
                  !notif.isRead &&
                  "border border-teal-200 dark:border-teal-800",
              )}
              onClick={() => !notif.isRead && handleMarkAsRead(notif)}
            >
              <div className="flex items-start gap-3 p-3">
                {/* Icon circle */}
                <div
                  className={cn(
                    "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full mt-0.5",
                    resolveCategory(notif) === "recruitment"
                      ? "bg-teal-50 dark:bg-teal-900/30"
                      : resolveCategory(notif) === "employee_request"
                        ? "bg-blue-50 dark:bg-blue-900/30"
                        : resolveCategory(notif) === "attendance"
                          ? "bg-amber-50 dark:bg-amber-900/30"
                          : "bg-muted",
                  )}
                >
                  <NotifIcon notif={notif} />
                  {!notif.isRead && (
                    <span className="absolute top-0 right-0 flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                    </span>
                  )}
                </div>

                {/* Content */}
                <div className="flex-grow min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    {categoryBadge(notif)}
                    {notif.priority === "action_required" && !notif.isRead && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                        Perlu Tindakan
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-foreground leading-snug">
                    {notif.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {notif.message}
                  </p>

                  {/* Legacy meta changes */}
                  {notif.meta?.changes && notif.meta.changes.length > 0 && (
                    <div className="mt-2 space-y-0.5 border-l-2 border-border pl-2 text-xs">
                      {notif.meta.changes.slice(0, 3).map((change: string, i: number) => (
                        <p key={i} className="text-muted-foreground">{change}</p>
                      ))}
                      {notif.meta.changes.length > 3 && (
                        <p className="text-muted-foreground font-semibold italic">
                          + {notif.meta.changes.length - 3} perubahan lainnya...
                        </p>
                      )}
                    </div>
                  )}

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
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
