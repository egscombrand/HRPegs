'use client';

import { useMemo, useState, useEffect } from 'react';
import { collection, doc, serverTimestamp, query, where } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase, updateDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import type { Job, Brand, UserProfile } from '@/lib/types';
import { format } from 'date-fns';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, PlusCircle, Trash2, Edit, Eye, EyeOff, XCircle, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { JobFormDialog } from './JobFormDialog';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import { useAuth } from '@/providers/auth-provider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AssignedUsersDialog } from '../recruitment/AssignedUsersDialog';
import Link from 'next/link';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';


function JobTableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><Skeleton className="h-5 w-24" /></TableHead>
              <TableHead><Skeleton className="h-5 w-20" /></TableHead>
              <TableHead><Skeleton className="h-5 w-16" /></TableHead>
              <TableHead><Skeleton className="h-5 w-16" /></TableHead>
              <TableHead><Skeleton className="h-5 w-16" /></TableHead>
              <TableHead><Skeleton className="h-5 w-24" /></TableHead>
              <TableHead><Skeleton className="h-5 w-24" /></TableHead>
              <TableHead><Skeleton className="h-5 w-24" /></TableHead>
              <TableHead className="w-[100px] text-right"><Skeleton className="h-5 w-12" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(3)].map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function JobManagementClient() {
  const firestore = useFirestore();
  const { userProfile } = useAuth();
  const { toast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isAssignUsersOpen, setIsAssignUsersOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [brandFilter, setBrandFilter] = useState('all');
  const [jobFilter, setJobFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');


  const jobsRef = useMemoFirebase(() => collection(firestore, 'jobs'), [firestore]);
  const { data: jobs, isLoading: isLoadingJobs, error: jobsError, mutate: mutateJobs } = useCollection<Job>(jobsRef);
  
  const brandsRef = useMemoFirebase(() => collection(firestore, 'brands'), [firestore]);
  const { data: brands, isLoading: isLoadingBrands, error: brandsError } = useCollection<Brand>(brandsRef);

  const usersToFilterQuery = useMemoFirebase(() =>
    query(
      collection(firestore, 'users'),
      where('role', 'in', ['manager', 'karyawan']),
      where('isActive', '==', true)
    ),
    [firestore]
  );
  const { data: users, isLoading: isLoadingUsers, error: usersError } = useCollection<UserProfile>(usersToFilterQuery);

  const isLoading = isLoadingJobs || isLoadingBrands || isLoadingUsers;
  const error = jobsError || brandsError || usersError;
  
  const assignableUsers = useMemo(() => {
    if (!users) return [];
    return users.filter(u => u.role === 'manager' || u.role === 'karyawan');
  }, [users]);

  const brandMap = useMemo(() => {
    if (!brands) return new Map<string, string>();
    return new Map(brands.map(brand => [brand.id!, brand.name]));
  }, [brands]);
  
  const userProfileMap = useMemo(() => {
    if (!users) return new Map<string, UserProfile>();
    return new Map(users.map(user => [user.uid, user]));
  }, [users]);
  
  const jobsForFilter = useMemo(() => {
    if (!jobs || brandFilter === 'all') {
      return [];
    }
    return jobs.filter(job => job.brandId === brandFilter);
  }, [jobs, brandFilter]);

  const jobsWithDetails = useMemo(() => {
    if (!jobs) return [];

    let filteredJobs = jobs;
    if (brandFilter !== 'all') {
        filteredJobs = filteredJobs.filter(job => job.brandId === brandFilter);
    }

    if (jobFilter !== 'all') {
        filteredJobs = filteredJobs.filter(job => job.id === jobFilter);
    }
    
    if (typeFilter !== 'all') {
        filteredJobs = filteredJobs.filter(job => job.statusJob === typeFilter);
    }

    return filteredJobs.map(job => ({
      ...job,
      brandName: brandMap.get(job.brandId) || 'N/A',
      updatedByName: userProfileMap.get(job.updatedBy)?.fullName || 'Unknown',
    })).sort((a, b) => {
      const timeA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : Date.now();
      const timeB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : Date.now();
      return timeB - timeA;
    });
  }, [jobs, brandMap, userProfileMap, brandFilter, jobFilter, typeFilter]);


  const handleCreate = () => {
    setSelectedJob(null);
    setIsFormOpen(true);
  };

  const handleEdit = (job: Job) => {
    setSelectedJob(job);
    setIsFormOpen(true);
  };
  
  const handleDelete = (job: Job) => {
    setSelectedJob(job);
    setIsDeleteConfirmOpen(true);
  };
  
  const handleAssignUsers = (job: Job) => {
    setSelectedJob(job);
    setIsAssignUsersOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedJob || !selectedJob.id) return;
    try {
        await deleteDocumentNonBlocking(doc(firestore, 'jobs', selectedJob.id));
        toast({
          title: 'Job Deleted',
          description: `The job posting for "${selectedJob.position}" has been deleted.`,
        });
    } catch (error: any) {
        toast({
            variant: "destructive",
            title: "Error deleting job",
            description: error.message,
        });
    } finally {
        setIsDeleteConfirmOpen(false);
        setSelectedJob(null);
    }
  };

  const handleStatusChange = async (job: Job, status: Job['publishStatus']) => {
    if (!job.id || !userProfile) return;
    try {
        await updateDocumentNonBlocking(doc(firestore, 'jobs', job.id), {
          publishStatus: status,
          updatedAt: serverTimestamp(),
          updatedBy: userProfile.uid,
        });
        toast({
          title: 'Job Status Updated',
          description: `Job "${job.position}" has been ${status}.`,
        });
    } catch (error: any) {
        toast({
            variant: "destructive",
            title: "Error updating status",
            description: error.message,
        });
    } finally {
        setIsDeleteConfirmOpen(false);
        setSelectedJob(null);
    }
  };

  if (isLoading) {
    return <JobTableSkeleton />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error Loading Jobs</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
            <Select value={brandFilter} onValueChange={(value) => {
                setBrandFilter(value);
                setJobFilter('all');
            }} disabled={isLoadingBrands}>
                <SelectTrigger className="w-[240px]">
                    <SelectValue placeholder="Filter by brand..." />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Brands</SelectItem>
                    {brands?.map(brand => (
                        <SelectItem key={brand.id} value={brand.id!}>{brand.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {brandFilter !== 'all' && (
                <Select value={jobFilter} onValueChange={setJobFilter} disabled={jobsForFilter.length === 0}>
                    <SelectTrigger className="w-[240px]">
                        <SelectValue placeholder="Filter by job..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Jobs for this Brand</SelectItem>
                        {jobsForFilter.map(job => (
                            <SelectItem key={job.id} value={job.id!}>{job.position}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
            
            <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by type..." />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="fulltime">Full-time</SelectItem>
                    <SelectItem value="internship">Internship</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                </SelectContent>
            </Select>
        </div>
        <Button onClick={handleCreate}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Create Job
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Position</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Openings</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assigned</TableHead>
              <TableHead>Deadline</TableHead>
              <TableHead>Last Update</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobsWithDetails && jobsWithDetails.length > 0 ? (
              jobsWithDetails.map((job) => {
                const assignedUsers = job.assignedUserIds?.map(uid => userProfileMap.get(uid)).filter((u): u is UserProfile => !!u) || [];
                return (
                <TableRow key={job.id}>
                  <TableCell className="font-medium">{job.position}</TableCell>
                  <TableCell>{job.brandName}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{job.statusJob}</Badge></TableCell>
                  <TableCell className="text-center">{job.numberOfOpenings || '-'}</TableCell>
                  <TableCell>
                    <Badge variant={
                      job.publishStatus === 'published' ? 'default' 
                      : job.publishStatus === 'closed' ? 'destructive' 
                      : 'secondary'
                    } className="capitalize">
                      {job.publishStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>
                      {assignedUsers.length > 0 ? (
                          <TooltipProvider>
                              <Tooltip>
                                  <TooltipTrigger asChild>
                                      <div className="flex items-center -space-x-2 cursor-pointer" onClick={() => handleAssignUsers(job)}>
                                          {assignedUsers.slice(0, 2).map(user => (
                                              <Avatar key={user.uid} className="h-7 w-7 border-2 border-background">
                                                  <AvatarFallback>{getInitials(user.fullName)}</AvatarFallback>
                                              </Avatar>
                                          ))}
                                          {assignedUsers.length > 2 && (
                                              <Avatar className="h-7 w-7 border-2 border-background">
                                                  <AvatarFallback>+{assignedUsers.length - 2}</AvatarFallback>
                                              </Avatar>
                                          )}
                                      </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                      <p>{assignedUsers.map(u => u.fullName).join(', ')}</p>
                                  </TooltipContent>
                              </Tooltip>
                          </TooltipProvider>
                      ) : (
                          <div onClick={() => handleAssignUsers(job)} className="text-muted-foreground text-center cursor-pointer hover:text-foreground">
                              -
                          </div>
                      )}
                  </TableCell>
                  <TableCell>
                    {job.applyDeadline?.toDate ? format(job.applyDeadline.toDate(), 'dd MMM yyyy') : '-'}
                  </TableCell>
                  <TableCell>
                     <div className="font-medium">{job.updatedByName}</div>
                      <div className="text-xs text-muted-foreground">
                        {job.updatedAt?.toDate ? format(job.updatedAt.toDate(), 'dd MMM yyyy') : 'Just now'}
                      </div>
                  </TableCell>
                  <TableCell className="text-right">
                     <DropdownMenu open={openMenuId === job.id} onOpenChange={(isOpen) => setOpenMenuId(isOpen ? job.id : null)}>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Actions for {job.position}</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => handleAssignUsers(job)}>
                            <Users className="mr-2 h-4 w-4" /> Kelola Tim
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setOpenMenuId(null); queueMicrotask(() => handleEdit(job)); }}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {job.publishStatus !== 'published' && (
                          <DropdownMenuItem onSelect={() => handleStatusChange(job, 'published')}>
                            <Eye className="mr-2 h-4 w-4" />
                            Publish
                          </DropdownMenuItem>
                        )}
                        {job.publishStatus === 'published' && (
                          <DropdownMenuItem onSelect={() => handleStatusChange(job, 'draft')}>
                            <EyeOff className="mr-2 h-4 w-4" />
                            Unpublish (Draft)
                          </DropdownMenuItem>
                        )}
                        {job.publishStatus !== 'closed' && (
                            <DropdownMenuItem onSelect={() => handleStatusChange(job, 'closed')}>
                                <XCircle className="mr-2 h-4 w-4" />
                                Close
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive focus:bg-destructive/10"
                          onSelect={(e) => { e.preventDefault(); setOpenMenuId(null); queueMicrotask(() => handleDelete(job)); }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )})
            ) : (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center">
                  No jobs found for the selected filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <JobFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        job={selectedJob}
        brands={brands || []}
      />
      
      <DeleteConfirmationDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        onConfirm={confirmDelete}
        itemName={selectedJob?.position}
        itemType="Job Posting"
      />
      
      {userProfile && (
        <AssignedUsersDialog
          open={isAssignUsersOpen}
          onOpenChange={setIsAssignUsersOpen}
          job={selectedJob}
          allUsers={assignableUsers || []}
          allBrands={brands || []}
          currentUser={userProfile}
          onSuccess={mutateJobs}
        />
      )}
    </div>
  );
}
