'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { getInitials } from '@/lib/utils';
import type { Job, UserProfile, Brand } from '@/lib/types';
import { AssignedUsersDialog } from './AssignedUsersDialog';
import { useAuth } from '@/providers/auth-provider';

interface AssignedUsersCardProps {
  job: Job;
  allUsers: UserProfile[];
  allBrands: Brand[];
  onUpdate: () => void;
  className?: string;
}

export function AssignedUsersCard({ job, allUsers, allBrands, onUpdate, className }: AssignedUsersCardProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { userProfile: currentUser } = useAuth();

  const assignedUsers = (job.assignedUserIds || [])
    .map(uid => allUsers.find(u => u.uid === uid))
    .filter((u): u is UserProfile => !!u);

  if (!currentUser) return null;

  return (
    <>
      <Card className={className}>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Tim Rekrutmen</CardTitle>
              <CardDescription>Pengguna internal yang ditugaskan untuk lowongan ini.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(true)}>
              Kelola Tim
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {assignedUsers.length > 0 ? (
            <div className="flex -space-x-2 overflow-hidden">
              <TooltipProvider>
                {assignedUsers.slice(0, 5).map(user => (
                  <Tooltip key={user.uid}>
                    <TooltipTrigger asChild>
                      <Avatar className="border-2 border-background">
                        <AvatarImage src={user.photoUrl} />
                        <AvatarFallback>{getInitials(user.fullName)}</AvatarFallback>
                      </Avatar>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{user.fullName}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
                 {assignedUsers.length > 5 && (
                    <Avatar className="border-2 border-background bg-muted">
                        <AvatarFallback>+{assignedUsers.length - 5}</AvatarFallback>
                    </Avatar>
                )}
              </TooltipProvider>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Belum ada pengguna yang ditugaskan.
            </p>
          )}
        </CardContent>
      </Card>
      <AssignedUsersDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        job={job}
        allUsers={allUsers}
        allBrands={allBrands}
        currentUser={currentUser}
        onSuccess={onUpdate}
      />
    </>
  );
}
