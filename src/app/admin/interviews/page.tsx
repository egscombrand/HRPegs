
'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { JobApplication, ApplicationInterview, UserProfile, Brand } from '@/lib/types';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Link as LinkIcon, Video, Users, MoreHorizontal, Briefcase, Search } from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { ManagePanelistsDialog } from '@/components/recruitment/ManagePanelistsDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

// Interface to hold processed interview data for display
interface EnrichedInterview extends ApplicationInterview {
  application: JobApplication;
}

// Reusable Interview Card Component
function InterviewCard({ interview, allUsers, allBrands, currentUser, onMutate }: { interview: EnrichedInterview; allUsers: UserProfile[]; allBrands: Brand[]; currentUser: UserProfile; onMutate: () => void }) {
    const now = new Date();
    const isOngoing = interview.startAt.toDate() <= now && interview.endAt.toDate() >= now;
    const isUpcoming = interview.startAt.toDate() > now;
    
    const showLinkButton = (isUpcoming || isOngoing) && interview.meetingPublished;
    const showWaitingButton = (isUpcoming || isOngoing) && !interview.meetingPublished;

    const [isManagePanelistsOpen, setIsManagePanelistsOpen] = useState(false);

    const currentInterviewInApp = interview.application.interviews?.find(iv => iv.interviewId === interview.interviewId);

    return (
        <>
            <Card className="flex flex-col">
                <CardHeader>
                    <div className="flex justify-between items-start gap-4">
                        <div>
                            <CardTitle className="text-lg">{interview.application.jobPosition}</CardTitle>
                            <CardDescription>
                                {interview.application.candidateName} • {interview.application.brandName}
                            </CardDescription>
                        </div>
                        {isUpcoming || isOngoing ? (
                            <Badge>Akan Datang</Badge>
                        ) : (
                            <Badge variant="secondary">Telah Lewat</Badge>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm flex-grow">
                    <div className="flex items-start gap-3">
                        <Calendar className="h-5 w-5 mt-0.5 text-primary" />
                        <div>
                            <p className="font-semibold">{format(interview.startAt.toDate(), 'eeee, dd MMMM yyyy', { locale: id })}</p>
                            <p>{format(interview.startAt.toDate(), 'HH:mm')} - {format(interview.endAt.toDate(), 'HH:mm')} WIB</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <Users className="h-5 w-5 mt-0.5 text-primary" />
                        <div>
                            <p className="font-semibold">Pewawancara</p>
                            <p>{(interview.panelistNames || interview.interviewerNames || []).join(', ')}</p>
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="flex flex-row justify-end items-center gap-2 pt-4 border-t">
                    {showWaitingButton && (
                       <Button variant="outline" size="sm" disabled className="flex-grow sm:flex-grow-0">
                           Menunggu link dari HRD
                       </Button>
                    )}
                    {showLinkButton && (
                        <Button asChild size="sm" className="flex-grow sm:flex-grow-0">
                            <a href={interview.meetingLink} target="_blank" rel="noopener noreferrer">
                                <LinkIcon className="mr-2 h-4 w-4" />
                                Buka Link
                            </a>
                        </Button>
                    )}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-9 w-9">
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {['super-admin', 'hrd'].includes(currentUser.role) && (
                                <DropdownMenuItem onSelect={() => setIsManagePanelistsOpen(true)}>
                                    <Users className="mr-2 h-4 w-4" />
                                    <span>Kelola Panelis</span>
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuItem asChild>
                                <Link href={`/admin/interviews/${interview.application.id}`}>
                                    <Briefcase className="mr-2 h-4 w-4" />
                                    <span>Buka Interview Kit</span>
                                </Link>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </CardFooter>
            </Card>
            {currentInterviewInApp && currentUser && (
                 <ManagePanelistsDialog
                    open={isManagePanelistsOpen}
                    onOpenChange={setIsManagePanelistsOpen}
                    application={interview.application}
                    interview={currentInterviewInApp}
                    currentUser={currentUser}
                    allUsers={allUsers}
                    allBrands={allBrands}
                    onSuccess={onMutate}
                />
            )}
        </>
    );
}

// Skeleton for loading state
function InterviewsPageSkeleton() {
    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-5 w-80" />
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
            </div>
        </div>
    );
}

// Main page component
export default function MyInterviewsPage() {
    const hasAccess = useRoleGuard(['super-admin', 'hrd', 'manager', 'karyawan']);
    const { userProfile, loading: authLoading } = useAuth();
    const firestore = useFirestore();

    const [activeTab, setActiveTab] = useState('upcoming');
    const [brandFilter, setBrandFilter] = useState('all');
    const [searchFilter, setSearchFilter] = useState('');

    const interviewsQuery = useMemoFirebase(() => {
        if (!userProfile) return null;
        if (['super-admin', 'hrd'].includes(userProfile.role)) {
            return query(
                collection(firestore, 'applications'),
                where('status', '==', 'interview')
            );
        }
        return query(
            collection(firestore, 'applications'),
            where('allPanelistIds', 'array-contains', userProfile.uid)
        );
    }, [userProfile, firestore]);

    const { data: applications, isLoading: appsLoading, mutate } = useCollection<JobApplication>(interviewsQuery);
    
    const internalUsersQuery = useMemoFirebase(() => {
        if (!userProfile || !['super-admin', 'hrd'].includes(userProfile.role)) return null;
        return query(
            collection(firestore, 'users'),
            where('role', 'in', ['hrd', 'manager', 'karyawan', 'super-admin']),
            where('isActive', '==', true)
        );
    }, [firestore, userProfile?.role]);

    const { data: internalUsers, isLoading: isLoadingUsers } = useCollection<UserProfile>(internalUsersQuery);
    const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(useMemoFirebase(() => collection(firestore, 'brands'), [firestore]));

    const allInterviews = useMemo(() => {
        if (!applications || !userProfile) return [];

        const interviews: EnrichedInterview[] = [];
        applications.forEach(app => {
            if (app.interviews) {
                app.interviews.forEach(interview => {
                    const isPanelist = (interview.panelistIds && interview.panelistIds.includes(userProfile.uid)) || (interview.interviewerIds && interview.interviewerIds.includes(userProfile.uid));

                    if (['super-admin', 'hrd'].includes(userProfile.role) || isPanelist) {
                        if (interview.status === 'scheduled' || interview.status === 'reschedule_requested' || interview.status === 'completed') {
                            interviews.push({ ...interview, application: app });
                        }
                    }
                });
            }
        });
        return interviews;
    }, [applications, userProfile]);

    const filteredInterviews = useMemo(() => {
        if (!allInterviews) return [];
        const lowercasedSearch = searchFilter.toLowerCase();
        return allInterviews.filter(interview => {
            const brandMatch = brandFilter === 'all' || interview.application.brandId === brandFilter;
            const searchMatch = searchFilter.trim() === '' || 
                interview.application.candidateName.toLowerCase().includes(lowercasedSearch) ||
                interview.application.jobPosition.toLowerCase().includes(lowercasedSearch);
            return brandMatch && searchMatch;
        });
    }, [allInterviews, brandFilter, searchFilter]);

    const categorizedInterviews = useMemo(() => {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        const upcoming: EnrichedInterview[] = [];
        const today: EnrichedInterview[] = [];
        const history: EnrichedInterview[] = [];

        filteredInterviews.forEach(interview => {
            const startTime = interview.startAt.toDate();
            // Upcoming should not include today
            if (startTime > endOfToday) {
                upcoming.push(interview);
            }
            // Today includes interviews happening now
            if (startTime >= startOfToday && startTime <= endOfToday) {
                today.push(interview);
            }
            // History is anything before start of today
            if (startTime < startOfToday) {
                history.push(interview);
            }
        });
        
        history.sort((a,b) => b.startAt.toDate().getTime() - a.startAt.toDate().getTime());
        upcoming.sort((a,b) => a.startAt.toDate().getTime() - b.startAt.toDate().getTime());
        today.sort((a,b) => a.startAt.toDate().getTime() - b.startAt.toDate().getTime());

        return { upcoming, today, history };
    }, [filteredInterviews]);

    const interviewsToDisplay = activeTab === 'upcoming' 
        ? categorizedInterviews.upcoming 
        : activeTab === 'today' 
        ? categorizedInterviews.today 
        : categorizedInterviews.history;
    
    const menuConfig = useMemo(() => {
        if (!userProfile) return [];
        return MENU_CONFIG[userProfile.role] || [];
    }, [userProfile]);

    const isLoading = authLoading || appsLoading || isLoadingUsers || isLoadingBrands;

    if (!hasAccess || isLoading) {
        return (
            <DashboardLayout pageTitle="Wawancara Saya" menuConfig={menuConfig}>
                <InterviewsPageSkeleton />
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout pageTitle="Wawancara Saya" menuConfig={menuConfig}>
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Jadwal Wawancara Saya</h1>
                    <p className="text-muted-foreground">
                        Berikut adalah semua jadwal wawancara di mana Anda terdaftar sebagai panelis.
                    </p>
                </div>

                 <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <div className="flex flex-wrap items-center justify-between gap-4 pb-4">
                        <TabsList>
                            <TabsTrigger value="upcoming">Akan Datang ({categorizedInterviews.upcoming.length})</TabsTrigger>
                            <TabsTrigger value="today">Hari Ini ({categorizedInterviews.today.length})</TabsTrigger>
                            <TabsTrigger value="history">Riwayat ({categorizedInterviews.history.length})</TabsTrigger>
                        </TabsList>
                        
                        <div className="flex flex-wrap items-center gap-2">
                             <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    placeholder="Cari kandidat/posisi..."
                                    value={searchFilter}
                                    onChange={e => setSearchFilter(e.target.value)}
                                    className="w-full sm:w-[200px] pl-8"
                                />
                            </div>
                            <Select value={brandFilter} onValueChange={setBrandFilter}>
                                <SelectTrigger className="w-full sm:w-[180px]">
                                    <SelectValue placeholder="Semua Brand" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Semua Brand</SelectItem>
                                    {brands?.map(brand => (
                                        <SelectItem key={brand.id} value={brand.id!}>{brand.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    
                    <TabsContent value={activeTab} className="mt-0">
                         {interviewsToDisplay.length > 0 ? (
                            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {interviewsToDisplay.map((interview, index) => (
                                   <InterviewCard 
                                        key={`${interview.application.id}-${interview.interviewId || index}`} 
                                        interview={interview} 
                                        allUsers={internalUsers || []}
                                        allBrands={brands || []}
                                        currentUser={userProfile!}
                                        onMutate={mutate}
                                   />
                                ))}
                            </div>
                        ) : (
                            <Card className="h-64 flex flex-col items-center justify-center text-center">
                                <CardHeader>
                                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                                        <Video className="h-6 w-6 text-muted-foreground" />
                                    </div>
                                    <CardTitle className="mt-4">Belum Ada Jadwal Wawancara</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-muted-foreground">
                                        Tidak ada jadwal wawancara untuk kategori dan filter ini.
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>
                </Tabs>
            </div>
        </DashboardLayout>
    );
}
