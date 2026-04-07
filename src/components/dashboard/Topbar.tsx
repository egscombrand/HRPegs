
'use client';

import React from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useAuth as useFirebaseAuth, useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LogOut, Search, Bell } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { getInitials } from '@/lib/utils';
import { ThemeToggle } from '../ui/ThemeToggle';
import { Input } from '../ui/input';
import { SidebarTrigger } from '../ui/sidebar';
import { Badge } from '../ui/badge';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { NotificationPanel } from './NotificationPanel';
import { collection, query, where } from 'firebase/firestore';
import type { Notification } from '@/lib/types';


function UserNav() {
    const { userProfile } = useAuth();
    const auth = useFirebaseAuth();
    const router = useRouter();
    const [open, setOpen] = React.useState(false);

    const handleLogout = async () => {
        await auth.signOut();
        router.push('/admin/login');
    };

    if (!userProfile) return null;

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-10 w-10 rounded-full">
            <Avatar className="h-10 w-10">
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
                <Badge variant="outline" className="capitalize mt-2 w-fit">
                    {userProfile.employmentType || userProfile.role}
                </Badge>
            </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={(e) => {
            e.preventDefault();
            setOpen(false);
            queueMicrotask(handleLogout);
            }}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
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
            collection(firestore, 'users', userProfile.uid, 'notifications'), 
            where('isRead', '==', false)
        );
    }, [userProfile?.uid, firestore]);
    const { data: unreadNotifications } = useCollection<Notification>(unreadNotifsQuery);
    const unreadCount = unreadNotifications?.length || 0;


    return (
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 sm:px-6">
            <SidebarTrigger />
            
            <div className="flex items-center gap-4">
                <h1 className="font-semibold text-lg hidden sm:block">{pageTitle}</h1>
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-2 md:gap-4">
                <div className="relative hidden md:block">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Search..."
                      className="w-full rounded-lg bg-background pl-8 md:w-[200px] lg:w-[336px]"
                    />
                </div>
                {actionArea && <div className="hidden lg:block">{actionArea}</div>}
                <ThemeToggle />

                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" size="icon" className="h-10 w-10 relative">
                            <Bell className="h-5 w-5" />
                            {unreadCount > 0 && (
                                <span className="absolute top-1 right-1 flex h-4 w-4">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-4 w-4 bg-primary text-xs text-primary-foreground items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>
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
    )
}
    