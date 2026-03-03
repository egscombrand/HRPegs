
'use client';

import type { ReactNode } from 'react';
import React, { useMemo } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useAuth as useFirebaseAuth, useFirestore, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection, query, where } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { LogOut, ArrowLeft, Leaf } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarProvider,
  SidebarInset,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { MENU_CONFIG } from '@/lib/menu-config';
import type { NavigationSetting, UserRole, JobApplication, AssessmentSession, JobApplicationStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '../ui/ThemeToggle';
import { Separator } from '../ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { ORDERED_RECRUITMENT_STAGES } from '@/lib/types';


function UserNav() {
  const { userProfile } = useAuth();
  const auth = useFirebaseAuth();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const handleLogout = async () => {
    await auth.signOut();
    router.push('/careers');
  };
  
  const getInitials = (name: string = '') => {
    return name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  }

  if (!userProfile) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-9 w-9">
            <AvatarImage src={`https://picsum.photos/seed/${userProfile.uid}/40/40`} alt={userProfile.fullName} data-ai-hint="profile avatar" />
            <AvatarFallback>{getInitials(userProfile.fullName)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{userProfile.fullName}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {userProfile.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={(e) => {
          e.preventDefault();
          setOpen(false);
          queueMicrotask(handleLogout);
        }}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Logout</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


export function CandidatePortalLayout({ children }: { children: ReactNode }) {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const pathname = usePathname();

  const settingsDocRef = useMemoFirebase(
    () => (userProfile ? doc(firestore, 'navigation_settings', userProfile.role) : null),
    [userProfile, firestore]
  );

  const { data: navSettings, isLoading: isLoadingSettings } = useDoc<NavigationSetting>(settingsDocRef);
  
  // --- Data Fetching for Badges & Gating ---
  const applicationsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(collection(firestore, 'applications'), where('candidateUid', '==', userProfile.uid));
  }, [userProfile?.uid, firestore]);
  const { data: applications, isLoading: isLoadingApps } = useCollection<JobApplication>(applicationsQuery);

  const sessionsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(collection(firestore, 'assessment_sessions'), where('candidateUid', '==', userProfile.uid));
  }, [userProfile?.uid, firestore]);
  const { data: sessions, isLoading: isLoadingSessions } = useCollection<AssessmentSession>(sessionsQuery);

  const {
    highestStatus,
    assessmentStatus,
    upcomingInterviewCount,
    activeTestSession,
  } = useMemo(() => {
    const defaultResult = {
        highestStatus: null as JobApplicationStatus | null,
        assessmentStatus: 'Belum',
        upcomingInterviewCount: 0,
        activeTestSession: null as AssessmentSession | null,
    };

    if (!applications || !sessions) return defaultResult;
    
    const activeSession = sessions.find(s => s.status === 'draft');
    if (activeSession) {
        const deadline = activeSession.deadlineAt?.toDate();
        if (!deadline || new Date() < deadline) {
            defaultResult.activeTestSession = activeSession;
        }
    }
    
    // Determine highest application status
    const nonRejectedApps = applications.filter(app => app.status !== 'rejected');
    let highestStageIndex = -1;
    let highestStage: JobApplicationStatus | null = null;
    if (nonRejectedApps.length > 0) {
      nonRejectedApps.forEach(app => {
        const currentIndex = ORDERED_RECRUITMENT_STAGES.indexOf(app.status);
        if (currentIndex > highestStageIndex) {
          highestStageIndex = currentIndex;
          highestStage = app.status;
        }
      });
    }
    defaultResult.highestStatus = highestStage;
    
    // Determine assessment status
    const appSessions = sessions.filter(s => s.applicationId); // Filter for sessions linked to an application
    const submitted = appSessions.find(s => s.status === 'submitted');
    const draft = appSessions.find(s => s.status === 'draft');
    if (submitted) defaultResult.assessmentStatus = 'Selesai';
    else if (draft) defaultResult.assessmentStatus = 'Proses';
    

    // Determine upcoming interview count
    const upcomingInterviews = applications.flatMap(app => app.interviews || [])
        .filter(iv => iv.status === 'scheduled' && iv.startAt.toDate() > new Date());
    defaultResult.upcomingInterviewCount = upcomingInterviews.length;

    return defaultResult;

  }, [applications, sessions]);
  
  const menuConfig = useMemo(() => {
    const roleConfig = MENU_CONFIG[userProfile?.role as UserRole] || [];
    if (isLoadingSettings) {
      return roleConfig;
    }
    if (navSettings) {
      return roleConfig.map(group => ({
        ...group,
        items: group.items.filter(item => navSettings.visibleMenuItems.includes(item.label))
      })).filter(group => group.items.length > 0);
    }
    return roleConfig;
  }, [userProfile, navSettings, isLoadingSettings]);

  const getGatingInfo = (menuLabel: string) => {
    if (!highestStatus) { // Case where user has account but never applied
        const allowedBeforeFirstApp = ['Dashboard', 'Profil Pelamar', 'Daftar Lowongan', 'Lamaran Saya'];
        if (allowedBeforeFirstApp.includes(menuLabel)) {
            return { locked: false, reason: '' };
        }
        if (menuLabel === 'Tes Kepribadian' && !userProfile?.isProfileComplete) {
            return { locked: true, reason: 'Lengkapi profil Anda untuk membuka tes kepribadian.' };
        }
        return { locked: true, reason: 'Lamar pekerjaan pertama Anda untuk memulai tahap ini.' };
    }

    const highestStatusIndex = ORDERED_RECRUITMENT_STAGES.indexOf(highestStatus);

    switch(menuLabel) {
        case 'Pengumpulan Dokumen':
            const docStageIndex = ORDERED_RECRUITMENT_STAGES.indexOf('document_submission');
            return highestStatusIndex >= docStageIndex 
                ? { locked: false, reason: '' }
                : { locked: true, reason: 'Anda akan diundang untuk mengunggah dokumen setelah lolos tahap verifikasi.' };
        case 'Jadwal Wawancara':
            const interviewStageIndex = ORDERED_RECRUITMENT_STAGES.indexOf('interview');
            return highestStatusIndex >= interviewStageIndex
                ? { locked: false, reason: '' }
                : { locked: true, reason: 'Jadwal akan muncul di sini setelah diatur oleh HRD.' };
        default:
            return { locked: false, reason: '' };
    }
  };


  if (!userProfile) {
    return null; // Should be handled by the parent layout's guard
  }

  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="icon" className="bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <SidebarHeader className="border-b border-sidebar-border p-0">
          <div className="flex h-16 items-center px-4">
             <Link href="/careers/portal" className="flex items-center gap-3">
               <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-accent">
                <Leaf className="h-6 w-6 text-primary" />
               </div>
               <div className="leading-tight group-data-[state=collapsed]:hidden">
                 <div className="font-semibold text-foreground text-base">Environesia Karir</div>
                 <div className="text-xs text-muted-foreground">Portal Kandidat</div>
               </div>
             </Link>
           </div>
        </SidebarHeader>
        <SidebarContent className="p-2">
          {menuConfig.map((group, groupIndex) => (
            <React.Fragment key={group.title || groupIndex}>
                <SidebarMenu>
                    {group.title && <h2 className="px-2 py-1 text-xs font-semibold text-muted-foreground tracking-wider group-data-[state=collapsed]:hidden">{group.title}</h2>}
                    {group.items.map(item => {
                        const isCurrentPageTest = pathname.startsWith('/careers/portal/assessment/personality');
                        const isTestInProgress = !!activeTestSession;

                        const { locked: isGated, reason: gateReason } = getGatingInfo(item.label);
                        
                        let locked = isGated;
                        let reason = gateReason;

                        if (isTestInProgress && !item.href.includes('/assessment/personality')) {
                            locked = true;
                            reason = "Selesaikan tes Anda yang sedang berjalan.";
                        }
                        
                        const isActive = pathname === item.href || (item.href !== '/careers/portal' && pathname.startsWith(item.href));
                        
                        let badgeContent = null;
                        if (item.label === 'Tes Kepribadian' && assessmentStatus) {
                            badgeContent = <Badge variant={assessmentStatus === 'Selesai' ? 'default' : 'secondary'} className="text-xs">{assessmentStatus}</Badge>;
                        } else if (item.label === 'Jadwal Wawancara' && upcomingInterviewCount > 0) {
                            badgeContent = <Badge variant="default" className="text-xs">{upcomingInterviewCount}</Badge>;
                        }
                        
                        const button = (
                           <SidebarMenuButton 
                                asChild 
                                tooltip={item.label}
                                isActive={isActive}
                                disabled={locked}
                                className={cn(
                                    "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground font-medium",
                                    "justify-start",
                                    locked && "cursor-not-allowed opacity-60"
                                )}
                            >
                                <Link href={locked ? '#' : item.href}>
                                    {item.icon}
                                    <span className="group-data-[state=collapsed]:hidden">{item.label}</span>
                                    <div className="ml-auto group-data-[state=collapsed]:hidden">{badgeContent}</div>
                                </Link>
                            </SidebarMenuButton>
                        );

                        return (
                            <SidebarMenuItem key={item.label}>
                                {locked ? (
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>{button}</TooltipTrigger>
                                            <TooltipContent side="right"><p>{reason}</p></TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                ) : button}
                            </SidebarMenuItem>
                        )
                    })}
                </SidebarMenu>
                {groupIndex < menuConfig.length - 1 && <Separator className="my-2 bg-sidebar-border group-data-[state=collapsed]:mx-auto group-data-[state=collapsed]:w-1/2" />}
            </React.Fragment>
          ))}
        </SidebarContent>
        <SidebarFooter className="mt-auto p-2">
            <SidebarMenu>
                 <SidebarMenuItem>
                    <SidebarMenuButton 
                      asChild 
                      tooltip="Kembali ke Halaman Karir"
                      className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground justify-start"
                    >
                        <Link href="/careers">
                            <ArrowLeft />
                            <span className="group-data-[state=collapsed]:hidden">Halaman Karir</span>
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="bg-background">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 sm:px-6">
          <SidebarTrigger />
          <div className="flex-1" />
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <UserNav />
          </div>
        </header>

        <main className="flex-1 p-4 sm:px-6 sm:py-6 md:gap-8">
            {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
