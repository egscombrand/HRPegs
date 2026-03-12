'use client';

import { useMemo, useState, useEffect } from 'react';
import { collection, doc } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { UserProfile, ROLES, UserRole, Brand } from '@/lib/types';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Pencil, Trash2, PlusCircle } from 'lucide-react';
import { UserFormDialog } from './UserFormDialog';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/providers/auth-provider';
import { useRouter } from 'next/navigation';

function UserTableSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

const groupDisplayNames: Record<string, string> = {
  'super-admin': 'Super Admins',
  hrd: 'HRD',
  manager: 'Managers',
  karyawan_aktif: 'Karyawan Aktif',
  probation: 'Karyawan Probation',
  magang: 'Magang',
  kandidat: 'Kandidat',
};

const displayOrder: string[] = [
  'super-admin',
  'hrd',
  'manager',
  'karyawan_aktif',
  'probation',
  'magang',
  'kandidat'
];


export function UserManagementClient() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { firebaseUser, auth } = useAuth();
  const router = useRouter();

  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [openMenuUid, setOpenMenuUid] = useState<string | null>(null);

  const usersCollectionRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'users') : null),
    [firestore]
  );
  
  const { data: users, isLoading, error } = useCollection<UserProfile>(usersCollectionRef);

  const brandsCollectionRef = useMemoFirebase(() => collection(firestore, 'brands'), [firestore]);
  const { data: brands } = useCollection<Brand>(brandsCollectionRef);

  const brandMap = useMemo(() => {
    if (!brands) return {};
    return brands.reduce((acc, brand) => {
        if (brand.id) {
            acc[brand.id] = brand.name;
        }
        return acc;
    }, {} as Record<string, string>);
  }, [brands]);

  const usersByGroup = useMemo(() => {
    if (!users) return {};
    const groups: { [key: string]: UserProfile[] } = {};

    users.forEach((user) => {
        let groupKey = user.role;

        // Specific grouping for 'karyawan' role based on their employment stage/type
        if (user.role === 'karyawan') {
            if (user.employmentType === 'magang') {
                groupKey = 'magang';
            } else if (user.employmentType === 'training' || user.employmentStage === 'probation') {
                groupKey = 'probation';
            } else {
                groupKey = 'karyawan_aktif';
            }
        }
        
        if (!groups[groupKey]) {
            groups[groupKey] = [];
        }
        groups[groupKey].push(user);
    });

    return groups;
  }, [users]);


  const handleCreateUser = () => {
    setSelectedUser(null);
    setIsFormDialogOpen(true);
  };

  const handleEditUser = (user: UserProfile) => {
    setSelectedUser(user);
    setIsFormDialogOpen(true);
  };

  const handleDeleteUser = (user: UserProfile) => {
    setUserToDelete(user);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!userToDelete || !firebaseUser) return;
    try {
        const idToken = await firebaseUser.getIdToken();
        const res = await fetch(`/api/users/${userToDelete.uid}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${idToken}`,
            },
        });

        if (res.status === 401) {
            toast({ variant: 'destructive', title: 'Sesi Habis', description: "Sesi Anda telah berakhir. Silakan login kembali." });
            if (auth) await auth.signOut();
            router.push('/admin/login');
            return;
        }
        
        if (!res.ok) {
            let errorMsg = 'Failed to delete user.';
            try {
                const errorData = await res.json();
                errorMsg = errorData.error || errorMsg;
            } catch (e) {
                errorMsg = res.statusText || 'An unknown server error occurred.';
            }
            throw new Error(errorMsg);
        }

        toast({ title: 'User Deleted', description: `User account for ${userToDelete.fullName} has been deleted.` });
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Error deleting user',
            description: error.message,
        });
    } finally {
        setIsDeleteDialogOpen(false);
        setUserToDelete(null);
    }
  };

  if (isLoading) {
    return <UserTableSkeleton />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          Failed to load users: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  const displayGroups = displayOrder.filter(group => usersByGroup[group] && usersByGroup[group].length > 0);

  return (
    <div className="w-full space-y-4">
      <div className="flex justify-end">
        <Button onClick={handleCreateUser}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Create User
        </Button>
      </div>

       {displayGroups.length > 0 ? (
        <Accordion type="multiple" className="w-full space-y-4" defaultValue={displayGroups.map(group => `group-${group}`)}>
          {displayGroups.map((groupKey) => (
            <AccordionItem value={`group-${groupKey}`} key={groupKey} className="border rounded-lg bg-card">
              <AccordionTrigger className="px-6 py-4 hover:no-underline">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold">{groupDisplayNames[groupKey]}</h3>
                  <Badge variant="secondary">{usersByGroup[groupKey]?.length || 0}</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-1">
                <div className="border-t">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Full Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Jabatan/Tugas</TableHead>
                        <TableHead>Brand</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usersByGroup[groupKey].map((user) => {
                        const brandDisplay = user.brandId 
                            ? (Array.isArray(user.brandId)
                                ? user.brandId.map(id => brandMap[id] || id).join(', ')
                                : brandMap[user.brandId as string] || '-')
                            : '-';

                        return (
                        <TableRow key={user.uid}>
                          <TableCell className="font-medium">{user.fullName}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell><Badge variant="outline" className="capitalize">{user.role.replace('_', ' ')}</Badge></TableCell>
                          <TableCell>{user.positionTitle ? <Badge variant="secondary">{user.positionTitle}</Badge> : '-'}</TableCell>
                          <TableCell>{brandDisplay}</TableCell>
                          <TableCell>
                            <Badge variant={user.isActive ? 'default' : 'destructive'}>
                              {user.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu
                              open={openMenuUid === user.uid}
                              onOpenChange={(isOpen) => setOpenMenuUid(isOpen ? user.uid : null)}
                            >
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={(e) => {
                                  e.preventDefault();
                                  setOpenMenuUid(null);
                                  queueMicrotask(() => handleEditUser(user));
                                }}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  <span>Edit</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                  onSelect={(e) => {
                                    e.preventDefault();
                                    setOpenMenuUid(null);
                                    queueMicrotask(() => handleDeleteUser(user));
                                  }}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  <span>Delete</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      )})}
                    </TableBody>
                  </Table>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      ) : (
        <div className="text-center text-muted-foreground py-10">No users found. Try running the seeder.</div>
      )}
      <UserFormDialog
        user={selectedUser}
        open={isFormDialogOpen}
        onOpenChange={setIsFormDialogOpen}
      />
      <DeleteConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={confirmDelete}
        itemName={userToDelete?.fullName}
        itemType="user"
      />
    </div>
  );
}
