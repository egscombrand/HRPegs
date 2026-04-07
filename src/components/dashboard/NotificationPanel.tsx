'use client';

import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase, updateDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, doc, writeBatch } from 'firebase/firestore';
import type { Notification } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Loader2, BellRing, BellOff } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';

export function NotificationPanel() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const notificationsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(collection(firestore, 'users', userProfile.uid, 'notifications'), orderBy('createdAt', 'desc'));
  }, [userProfile?.uid, firestore]);

  const { data: notifications, isLoading, mutate } = useCollection<Notification>(notificationsQuery);

  const handleMarkAsRead = async (notificationId: string) => {
    if (!userProfile) return;
    try {
      const notifRef = doc(firestore, 'users', userProfile.uid, 'notifications', notificationId);
      await updateDocumentNonBlocking(notifRef, { isRead: true });
      // Mutate is not strictly needed if we rely on the link navigation, but good for consistency
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: "Gagal menandai notifikasi." });
    }
  };
  
  const handleMarkAllAsRead = async () => {
     if (!userProfile || !notifications) return;
     const unreadNotifs = notifications.filter(n => !n.isRead);
     if (unreadNotifs.length === 0) return;

     const batch = writeBatch(firestore);
     unreadNotifs.forEach(notif => {
        const ref = doc(firestore, 'users', userProfile.uid, 'notifications', notif.id!);
        batch.update(ref, { isRead: true });
     });
     
     try {
        await batch.commit();
        mutate(); // Re-fetch to update UI immediately
     } catch (e: any) {
        toast({ variant: 'destructive', title: 'Error', description: 'Gagal menandai semua notifikasi.' });
     }
  }

  const getLinkHref = (notification: Notification): string => {
    switch (notification.type) {
      case 'recruitment_assignment':
        return `/admin/recruitment/jobs/${notification.jobId}`;
      default:
        return '#';
    }
  }


  return (
    <div className="flex flex-col h-full">
        <div className="p-4 border-b">
            <div className="flex justify-between items-center">
                <h3 className="font-semibold">Notifikasi</h3>
                {notifications && notifications.some(n => !n.isRead) && (
                    <Button variant="link" size="sm" className="text-xs h-auto p-0" onClick={handleMarkAllAsRead}>
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
                    <p className="text-sm text-muted-foreground">Semua notifikasi Anda akan muncul di sini.</p>
                </div>
            )}
            <div className="p-2 space-y-1">
                {notifications?.map(notif => (
                    <Link
                        key={notif.id}
                        href={getLinkHref(notif)}
                        className={cn(
                            "block p-3 rounded-md transition-colors hover:bg-accent",
                            !notif.isRead && "bg-blue-50 dark:bg-blue-900/20"
                        )}
                        onClick={() => !notif.isRead && handleMarkAsRead(notif.id!)}
                    >
                        <div className="flex items-start gap-3">
                            {!notif.isRead && (
                                <div className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0"></div>
                            )}
                            <div className={cn("flex-grow", notif.isRead && "pl-5")}>
                                <div className="flex justify-between items-center">
                                    <p className="font-semibold text-sm">{notif.title}</p>
                                    <p className="text-xs text-muted-foreground">{formatDistanceToNow(notif.createdAt.toDate(), { addSuffix: true, locale: idLocale })}</p>
                                </div>
                                <p className="text-sm text-muted-foreground">{notif.message}</p>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
        </ScrollArea>
    </div>
  );
}
