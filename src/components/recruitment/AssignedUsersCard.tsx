'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { getInitials } from '@/lib/utils';
import type { Job, UserProfile, Brand, UserRole } from '@/lib/types';
import { AssignedUsersDialog } from './AssignedUsersDialog';
import { useAuth } from '@/providers/auth-provider';
import { Badge } from '@/components/ui/badge';

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

  const assignedUsers = useMemo(() => {
    if (!job.assignedUserIds) return [];
    return (job.assignedUserIds || [])
      .map(uid => allUsers.find(u => u.uid === uid))
      .filter((u): u is UserProfile => !!u);
  }, [job.assignedUserIds, allUsers]);

  const sortedAssignedUsers = useMemo(() => {
    const roleOrder: Record<UserRole, number> = {
      'super-admin': 1,
      'hrd': 2,
      'manager': 3,
      'karyawan': 4,
      'kandidat': 5,
    };
    return [...assignedUsers].sort((a, b) => {
      const roleA = roleOrder[a.role] || 99;
      const roleB = roleOrder[b.role] || 99;
      if (roleA !== roleB) return roleA - roleB;
      return a.fullName.localeCompare(b.fullName);
    });
  }, [assignedUsers]);
  
  const brandMap = useMemo(() => {
    if (!allBrands) return new Map<string, string>();
    return new Map(allBrands.map(brand => [brand.id!, brand.name]));
  }, [allBrands]);

  if (!currentUser) return null;

  return (
    <>
      <Card className={className}>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Tim Rekrutmen ({assignedUsers.length} anggota)</CardTitle>
              <CardDescription>Pengguna internal yang ditugaskan untuk lowongan ini.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(true)}>
              Kelola Tim
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {sortedAssignedUsers.length > 0 ? (
            <div className="space-y-4">
              {sortedAssignedUsers.map(user => {
                const userBrandName = Array.isArray(user.brandId)
                  ? user.brandId.map(id => brandMap.get(id)).filter(Boolean).join(', ')
                  : (user.brandId && brandMap.get(user.brandId as string)) || '';
                
                return (
                  <div key={user.uid} className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={user.photoUrl} alt={user.fullName} />
                      <AvatarFallback>{getInitials(user.fullName)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold text-sm">{user.fullName}</p>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="capitalize">{user.role.replace('-', ' ')}</span>
                        {userBrandName && <span>• {userBrandName}</span>}
                        {user.division && <span>• {user.division}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
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
