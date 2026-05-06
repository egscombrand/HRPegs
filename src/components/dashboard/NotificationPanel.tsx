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
import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";

export function NotificationPanel() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const notificationsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(
      collection(firestore, "users", userProfile.uid, "notifications"),
      orderBy("createdAt", "desc"),
    );
  }, [userProfile?.uid, firestore]);

  const {
    data: userNotifications,
    isLoading: isUserLoading,
    mutate: mutateUser,
  } = useCollection<Notification>(notificationsQuery);

  const hrdNotificationsQuery = useMemoFirebase(() => {
    if (!userProfile?.role || !["hrd", "super-admin"].includes(userProfile.role)) return null;
    return query(
      collection(firestore, "hrd_notifications"),
      orderBy("createdAt", "desc"),
    );
  }, [userProfile?.role, firestore]);

  const {
    data: hrdNotifications,
    isLoading: isHrdLoading,
    mutate: mutateHrd,
  } = useCollection<Notification>(hrdNotificationsQuery);

  const notifications = useMemo(() => {
    const un = (userNotifications || []).map((n) => ({ ...n, _source: "user" }));
    const hn = (hrdNotifications || []).map((n) => ({ ...n, _source: "hrd" }));
    return [...un, ...hn].sort((a, b) => {
      const timeA = a.createdAt?.toMillis?.() || 0;
      const timeB = b.createdAt?.toMillis?.() || 0;
      return timeB - timeA;
    });
  }, [userNotifications, hrdNotifications]);

  const isLoading = isUserLoading || isHrdLoading;

  const handleMarkAsRead = async (notif: any) => {
    if (!userProfile) return;
    try {
      let notifRef;
      if (notif._source === "hrd") {
        notifRef = doc(firestore, "hrd_notifications", notif.id!);
      } else {
        notifRef = doc(
          firestore,
          "users",
          userProfile.uid,
          "notifications",
          notif.id!,
        );
      }
      await updateDocumentNonBlocking(notifRef, { isRead: true });
      // Mutate is not strictly needed if we rely on the link navigation, but good for consistency
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal menandai notifikasi.",
      });
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!userProfile || !notifications) return;
    const unreadNotifs = notifications.filter((n) => !n.isRead);
    if (unreadNotifs.length === 0) return;

    const batch = writeBatch(firestore);
    unreadNotifs.forEach((notif: any) => {
      let ref;
      if (notif._source === "hrd") {
        ref = doc(firestore, "hrd_notifications", notif.id!);
      } else {
        ref = doc(
          firestore,
          "users",
          userProfile.uid,
          "notifications",
          notif.id!,
        );
      }
      batch.update(ref, { isRead: true });
    });

    try {
      await batch.commit();
      mutateUser(); // Re-fetch to update UI immediately
      mutateHrd();
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Gagal menandai semua notifikasi.",
      });
    }
  };

  const getLinkHref = (notification: Notification): string => {
    return notification.actionUrl || "#";
  };

    const renderIcon = (type: Notification["type"]) => {
    switch (type) {
      case "bank_change_request":
        return <Wallet className="h-4 w-4 text-muted-foreground" />;
      case "interview_scheduled":
      case "interview_updated":
        return <Calendar className="h-4 w-4 text-muted-foreground" />;
      case "recruitment_assignment":
      case "offer":
        return <Briefcase className="h-4 w-4 text-muted-foreground" />;
      case "negotiation":
        return <Bell className="h-4 w-4 text-muted-foreground" />;
      case "decision":
        return <CheckCircle className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Briefcase className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold">Notifikasi</h3>
          {notifications && notifications.some((n) => !n.isRead) && (
            <Button
              variant="link"
              size="sm"
              className="text-xs h-auto p-0"
              onClick={handleMarkAllAsRead}
            >
              Tandai semua dibaca
            </Button>
          )}
        </div>
      </div>
      <ScrollArea className="flex-1">
        {isLoading && (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {!isLoading && (!notifications || notifications.length === 0) && (
          <div className="text-center p-8 space-y-2">
            <BellOff className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="font-semibold">Tidak ada notifikasi</p>
            <p className="text-sm text-muted-foreground">
              Semua notifikasi Anda akan muncul di sini.
            </p>
          </div>
        )}
        <div className="p-2 space-y-1">
          {notifications?.map((notif) => {
            return (
              <Link
                key={notif.id}
                href={getLinkHref(notif)}
                className={cn(
                  "block rounded-md transition-colors hover:bg-accent",
                  !notif.isRead && "bg-blue-50 dark:bg-blue-900/20",
                )}
                onClick={() => !notif.isRead && handleMarkAsRead(notif)}
              >
                <div className="flex items-start gap-3 p-3">
                  <div className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted mt-1">
                    {renderIcon(notif.type)}
                    {!notif.isRead && (
                      <span className="absolute top-0 right-0 flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary"></span>
                      </span>
                    )}
                  </div>
                  <div className="flex-grow">
                    <p className="text-xs font-semibold text-muted-foreground">
                      {notif.title}
                    </p>
                    <p className="text-sm text-foreground mt-1">
                      {notif.message}
                    </p>
                    {notif.meta?.changes && notif.meta.changes.length > 0 && (
                      <div className="mt-2 space-y-1 border-l-2 border-border pl-2 text-xs">
                        {notif.meta.changes
                          .slice(0, 3)
                          .map((change: string, i: number) => (
                            <p key={i} className="text-muted-foreground">
                              {change}
                            </p>
                          ))}
                        {notif.meta.changes.length > 3 && (
                          <p className="text-muted-foreground font-semibold italic">
                            + {notif.meta.changes.length - 3} perubahan
                            lainnya...
                          </p>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-1.5">
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
