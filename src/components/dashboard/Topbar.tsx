'use client';

import React from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useAuth as useFirebaseAuth } from '@/firebase';
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
                <Button variant="outline" size="icon" className="h-10 w-10">
                    <Bell className="h-5 w-5" />
                    <span className="sr-only">Notifications</span>
                </Button>
                <UserNav />
            </div>
        </header>
    )
}
