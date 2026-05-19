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
import { Search, Bell, ChevronDown } from "lucide-react";
import { ThemeToggle } from "../ui/ThemeToggle";
import { Input } from "../ui/input";
import { SidebarTrigger } from "../ui/sidebar";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NotificationPanel } from "./NotificationPanel";
import { collection, query, where } from "firebase/firestore";
import type { Notification } from "@/lib/types";

function getDisplayName(
  userProfile: NonNullable<ReturnType<typeof useAuth>["userProfile"]>,
) {
  if (userProfile.fullName?.trim()) return userProfile.fullName;
  if (userProfile.email?.includes("@")) return userProfile.email.split("@")[0];
  return "User";
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function UserNav() {
  const { userProfile } = useAuth();
  const auth = useFirebaseAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await auth.signOut();
    router.push("/");
  };

  const handleAccountSettings = () => {
    router.push("/admin/karyawan/account-settings");
  };

  if (!userProfile) return null;

  const displayName = getDisplayName(userProfile);
  const roleLabel = userProfile.role?.replace(/-/g, " ") ?? "User";
  const initials = getInitials(displayName);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-10 min-w-[160px] gap-2 rounded-full px-3 text-left"
        >
          <Avatar className="h-9 w-9">
            {userProfile.photoUrl ? (
              <AvatarImage src={userProfile.photoUrl} alt={displayName} />
            ) : (
              <AvatarFallback>{initials || "U"}</AvatarFallback>
            )}
          </Avatar>

          <div className="hidden shrink-0 flex-col items-start gap-0 overflow-hidden text-sm text-slate-800 dark:text-slate-100 sm:flex">
            <span className="truncate font-medium">{displayName}</span>
            <span className="truncate text-xs text-slate-500 dark:text-slate-400 capitalize">
              {roleLabel}
            </span>
          </div>

          <ChevronDown className="h-4 w-4 text-slate-500 dark:text-slate-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72 bg-background p-0" align="end">
        <div className="px-4 py-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-11 w-11">
              {userProfile.photoUrl ? (
                <AvatarImage src={userProfile.photoUrl} alt={displayName} />
              ) : (
                <AvatarFallback>{initials || "U"}</AvatarFallback>
              )}
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {displayName}
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                {roleLabel}
              </p>
            </div>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleAccountSettings}>
          Pengaturan Akun
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onSelect={handleLogout}>
          Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
