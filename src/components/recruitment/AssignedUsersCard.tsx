'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { getInitials } from '@/lib/utils';
import type { Job, UserProfile, Brand, UserRole } from '@/lib/types';
import { AssignedUsersDialog } from './AssignedUsersDialog';
import { useAuth } from '@/providers/auth-provider';
import { Badge } from '@/components/ui/badge';
import { useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';

interface AssignedUsersCardProps {
  job: Job;
  allUsers: UserProfile[]; // This will be empty for non-privileged users
  allBrands: Brand[];
  onUpdate: () => void;
  className?: string;
}

export function AssignedUsersCard({ job, allUsers, allBrands, onUpdate, className }: AssignedUsersCardProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { userProfile: currentUser } = useAuth();
  const firestore = useFirestore();
  const [fetchedUsers, setFetchedUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const allAvailableUsers = useMemo(() => allUsers.length > 0 ? allUsers : fetchedUsers, [allUsers, fetchedUsers]);

  useEffect(() => {
    if (allUsers.length === 0 && job.assignedUserIds && job.assignedUserIds.length > 0) {
        setIsLoading(true);
        const fetchUsers = async () => {
            try {
                const userDocs = await Promise.all(
                    job.assignedUserIds!.map(uid => getDoc(doc(firestore, 'users', uid)))
                );
                const users = userDocs
                    .filter(docSnap => docSnap.exists())
                    .map(docSnap => ({ ...docSnap.data(), id: docSnap.id } as UserProfile));
                setFetchedUsers(users);
            } catch (err) {
                console.error("Error fetching assigned users in card:", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchUsers();
    } else {
        setIsLoading(false);
    }
  }, [allUsers.length, job.assignedUserIds, firestore]);

  const assignedUsers = useMemo(() => {
    if (!job.assignedUserIds) return [];
    return (job.assignedUserIds || [])
      .map(uid => allAvailableUsers.find(u => u.uid === uid))
      .filter((u): u is UserProfile => !!u);
  }, [job.assignedUserIds, allAvailableUsers]);

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
             {['super-admin', 'hrd'].includes(currentUser.role) && (
                <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(true)}>
                Kelola Tim
                </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : sortedAssignedUsers.length > 0 ? (
            <div className="space-y-4">
              {sortedAssignedUsers.map(user => {
                const userBrandName = Array.isArray(user.brandId)
                  ? user.brandId.map(id => brandMap.get(id)).filter(Boolean).join(', ')
                  : (user.brandId && brandMap.get(user.brandId as string)) || '';
                const isCurrentUser = user.uid === currentUser.uid;
                
                return (
                  <div key={user.uid} className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={user.photoUrl} alt={user.fullName} />
                      <AvatarFallback>{getInitials(user.fullName)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-semibold text-sm flex items-center gap-2">
                        {user.fullName}
                        {isCurrentUser && <Badge variant="secondary">Anda</Badge>}
                      </div>
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
