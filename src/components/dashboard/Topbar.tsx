"use client";

import React from "react";
import { useAuth } from "@/providers/auth-provider";
import {
  useAuth as useFirebaseAuth,
  useCollection,
  useFirestore,
  useMemoFirebase,
} from "@/firebase";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Search, Bell } from "lucide-react";
import { ThemeToggle } from "../ui/ThemeToggle";
import { Input } from "../ui/input";
import { SidebarTrigger } from "../ui/sidebar";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { NotificationPanel } from "./NotificationPanel";
import { collection, query, where } from "firebase/firestore";
import type { Notification } from "@/lib/types";

function UserNav() {
  const { userProfile } = useAuth();
  const auth = useFirebaseAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await auth.signOut();
    router.push("/");
  };

  if (!userProfile) return null;

  return (
    <div className="flex items-center gap-4 text-sm text-slate-200">
      <span className="truncate max-w-[180px] hidden sm:inline">
        {userProfile.email}
      </span>
      <Button variant="outline" size="sm" onClick={handleLogout}>
        Log out
      </Button>
    </div>
  );
}

interface TopbarProps {
  pageTitle: string;
  actionArea?: React.ReactNode;
}

export function Topbar({ pageTitle, actionArea }: TopbarProps) {
  const { userProfile } = useAuth();
  const firestore = useFirestore();

  const unreadNotifsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(
      collection(firestore, "users", userProfile.uid, "notifications"),
      where("isRead", "==", false),
    );
  }, [userProfile?.uid, firestore]);
  const { data: unreadNotifications } =
    useCollection<Notification>(unreadNotifsQuery);

  const hrdUnreadNotifsQuery = useMemoFirebase(() => {
    if (
      !userProfile?.role ||
      !["hrd", "super-admin"].includes(userProfile.role)
    )
      return null;
    return query(
      collection(firestore, "hrd_notifications"),
      where("isRead", "==", false),
    );
  }, [userProfile?.role, firestore]);
  const { data: hrdUnreadNotifications } =
    useCollection<Notification>(hrdUnreadNotifsQuery);

  const unreadCount =
    (unreadNotifications?.length || 0) + (hrdUnreadNotifications?.length || 0);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background px-4 sm:px-5">
      <SidebarTrigger />

      <div className="flex items-center gap-3">
        <h1 className="font-semibold text-base hidden sm:block">{pageTitle}</h1>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2 md:gap-3">
        <div className="relative hidden md:block">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search..."
            className="w-full rounded-lg bg-background pl-8 md:w-[170px] lg:w-[260px]"
          />
        </div>
        {actionArea && <div className="hidden lg:block">{actionArea}</div>}
        <ThemeToggle />

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 relative"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-primary text-xs text-primary-foreground items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                </span>
              )}
              <span className="sr-only">Notifications</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 h-[50vh] p-0" align="end">
            <NotificationPanel />
          </PopoverContent>
        </Popover>

        <UserNav />
      </div>
    </header>
  );
}
