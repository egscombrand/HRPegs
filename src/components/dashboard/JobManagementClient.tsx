'use client';

import { useMemo, useState, useEffect } from 'react';
import { collection, doc, serverTimestamp, query, where } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase, updateDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import type { Job, Brand, UserProfile } from '@/lib/types';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

import SafeRichText from '@/components/ui/SafeRichText';
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
import { MoreHorizontal, PlusCircle, Trash2, Edit, Eye, EyeOff, XCircle, Users, FileText } from 'lucide-react';
import { JobFormDialog } from './JobFormDialog';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/providers/auth-provider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AssignedUsersDialog } from '../recruitment/AssignedUsersDialog';
import Link from 'next/link';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getInitials, normalizeJobCoverImageUrl } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { JobQuickViewPanel } from '../recruitment/JobQuickViewPanel';
import { JobDetailPanel } from './JobDetailPanel';
import { ScrollArea } from '../ui/scroll-area';
import { Separator } from '../ui/separator';
import { X } from 'lucide-react';

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
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [brandFilter, setBrandFilter] = useState('all');
  const [jobFilter, setJobFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [isQuickViewOpen, setIsQuickViewOpen] = useState(false);


  const jobsRef = useMemoFirebase(() => collection(firestore, 'jobs'), [firestore]);
  const { data: jobs, isLoading: isLoadingJobs, error: jobsError, mutate: mutateJobs } = useCollection<Job>(jobsRef);
  
  const brandsRef = useMemoFirebase(() => collection(firestore, 'brands'), [firestore]);
  const { data: brands, isLoading: isLoadingBrands, error: brandsError } = useCollection<Brand>(brandsRef);

  const usersQuery = useMemoFirebase(() =>
    query(
      collection(firestore, 'users'),
      where('role', 'in', ['hrd', 'super-admin', 'manager', 'karyawan']),
      where('isActive', '==', true)
    ),
    [firestore]
  );
  const { data: users, isLoading: isLoadingUsers, error: usersError } = useCollection<UserProfile>(usersQuery);

  const isLoading = isLoadingJobs || isLoadingBrands || isLoadingUsers;
  const error = jobsError || brandsError || usersError;
  
  const assignableUsers = useMemo(() => {
    if (!users) return [];
    return users.filter(u => u.role === 'manager' || (u.role === 'karyawan' && u.employmentType === 'karyawan'));
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

  const handleViewDetail = (job: Job) => {
    setSelectedJob(job);
    setIsDetailOpen(true);
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
                      <TooltipProvider>
                          <Tooltip>
                              <TooltipTrigger asChild>
                                  <div
                                      className="flex items-center -space-x-2 cursor-pointer"
                                      onClick={() => {
                                          setSelectedJob(job);
                                          setIsQuickViewOpen(true);
                                      }}
                                  >
                                      {assignedUsers.length > 0 ? (
                                          <>
                                              {assignedUsers.slice(0, 2).map(user => (
                                                  <Avatar key={user.uid} className="h-7 w-7 border-2 border-background">
                                                      <AvatarFallback>{getInitials(user.fullName)}</AvatarFallback>
                                                  </Avatar>
                                              ))}
                                              {assignedUsers.length > 2 && (
                                                  <Avatar className="h-7 w-7 border-2 border-background bg-muted">
                                                      <AvatarFallback>+{assignedUsers.length - 2}</AvatarFallback>
                                                  </Avatar>
                                              )}
                                          </>
                                      ) : (
                                          <div className="text-muted-foreground text-center w-full">-</div>
                                      )}
                                  </div>
                              </TooltipTrigger>
                              {assignedUsers.length > 0 && (
                                  <TooltipContent>
                                      <p>{assignedUsers.map(u => u.fullName).join(', ')}</p>
                                  </TooltipContent>
                              )}
                          </Tooltip>
                      </TooltipProvider>
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
                        <DropdownMenuItem onSelect={() => { setOpenMenuId(null); queueMicrotask(() => handleViewDetail(job)); }}>
                          <FileText className="mr-2 h-4 w-4" />
                          Detail
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
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
                          disabled={userProfile?.role !== 'super-admin'}
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

      <Sheet open={isQuickViewOpen} onOpenChange={setIsQuickViewOpen}>
        <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
            {selectedJob && (
                <>
                    <SheetHeader className="p-6 pb-4">
                        <SheetTitle>{selectedJob.position}</SheetTitle>
                        <SheetDescription>{brandMap.get(selectedJob.brandId)}</SheetDescription>
                    </SheetHeader>
                    <Separator />
                    <ScrollArea className="flex-1">
                        <JobQuickViewPanel
                            job={selectedJob}
                            assignedUsers={(selectedJob.assignedUserIds || []).map(uid => userProfileMap.get(uid)).filter((u): u is UserProfile => !!u)}
                        />
                    </ScrollArea>
                </>
            )}
        </SheetContent>
      </Sheet>

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-[1280px] h-[85vh] p-0 gap-0 rounded-xl border border-border bg-background shadow-2xl overflow-hidden flex flex-col sm:w-[calc(100%-1rem)] md:w-[85vw]">
          {selectedJob && (() => {
            const coverUrl = normalizeJobCoverImageUrl(selectedJob.coverImageUrl);
            console.log('[JobDetail] coverImageUrl (raw):', selectedJob.coverImageUrl);
            console.log('[JobDetail] coverImageUrl (normalized):', coverUrl);
            console.log('[JobDetail] full job:', selectedJob);
            return (
            <>
              <div className="sticky top-0 z-10 flex items-start justify-between gap-4 p-6 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="flex-1 min-w-0">
                  <DialogTitle className="text-3xl font-bold">{selectedJob.position}</DialogTitle>
                  <DialogDescription className="text-sm mt-2 text-muted-foreground">
                    {brandMap.get(selectedJob.brandId)} • {selectedJob.publishStatus === 'published' ? 'Published' : selectedJob.publishStatus === 'draft' ? 'Draft' : 'Closed'} • Read-only view
                  </DialogDescription>
                </div>
                <button
                  onClick={() => setIsDetailOpen(false)}
                  className="inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0 h-10 w-10"
                  aria-label="Close dialog"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <ScrollArea className="flex-1 overflow-hidden">
                <div className="p-6 space-y-6">
                  {/* Cover Image */}
                  {coverUrl ? (
                    <div className="relative w-full h-80 rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-900 border border-border flex items-center justify-center">
                      {/* Use plain <img> to avoid Next.js Image hostname restrictions */}
                      <img
                        src={coverUrl}
                        alt={selectedJob.position}
                        className="w-full h-full object-contain object-center p-4"
                        onError={(e) => {
                          e.currentTarget.parentElement!.style.display = 'none';
                          const fallback = e.currentTarget.parentElement?.querySelector<HTMLElement>('.cover-image-fallback');
                          if (fallback) fallback.classList.remove('hidden');
                        }}
                      />
                      <div className="cover-image-fallback hidden absolute inset-0 flex items-center justify-center">
                        <div className="text-center text-muted-foreground">
                          <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">Cover image tidak dapat dimuat</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-40 rounded-lg bg-slate-50 dark:bg-slate-900 border border-dashed border-border flex items-center justify-center">
                      <div className="text-center text-muted-foreground">
                        <FileText className="h-10 w-10 mx-auto mb-2 opacity-40" />
                        <p className="text-sm">Tidak ada cover image</p>
                      </div>
                    </div>
                  )}

                  {/* Two Column Layout */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Left Column - Main Info */}
                    <div className="md:col-span-2 space-y-6">
                      {/* Position Details */}
                      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
                        <h3 className="font-semibold text-lg text-foreground">Detail Posisi</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase">Divisi</p>
                            <p className="text-sm text-foreground mt-1">{selectedJob.division || '-'}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase">Tipe</p>
                            <p className="text-sm text-foreground mt-1 capitalize">{selectedJob.statusJob || '-'}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase">Mode Kerja</p>
                            <p className="text-sm text-foreground mt-1 capitalize">{selectedJob.workMode || '-'}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase">Lokasi</p>
                            <p className="text-sm text-foreground mt-1">{selectedJob.location || '-'}</p>
                          </div>
                        </div>
                      </div>

                      {/* General Requirements */}
                      {selectedJob.generalRequirementsHtml && (
                        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
                          <h3 className="font-semibold text-lg text-foreground">Persyaratan Umum</h3>
                          <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-foreground">
                            <SafeRichText html={selectedJob.generalRequirementsHtml} />
                          </div>
                        </div>
                      )}

                      {/* Special Requirements */}
                      {selectedJob.specialRequirementsHtml && (
                        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
                          <h3 className="font-semibold text-lg text-foreground">Persyaratan Khusus</h3>
                          <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-foreground">
                            <SafeRichText html={selectedJob.specialRequirementsHtml} />
                          </div>
                        </div>
                      )}

                      {/* Job Description */}
                      {selectedJob.jobDescription && (
                        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
                          <h3 className="font-semibold text-lg text-foreground">Deskripsi Pekerjaan</h3>
                          <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-foreground">
                            <SafeRichText html={selectedJob.jobDescription} />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right Column - Summary */}
                    <div className="md:col-span-1 space-y-4">
                      {/* Status Card */}
                      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase">Status</p>
                        <Badge className={selectedJob.publishStatus === 'published' ? 'bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-100' : selectedJob.publishStatus === 'draft' ? 'bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-100' : 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-100'}>
                          {selectedJob.publishStatus === 'published' && 'Published'}
                          {selectedJob.publishStatus === 'draft' && 'Draft'}
                          {selectedJob.publishStatus === 'closed' && 'Closed'}
                        </Badge>
                      </div>

                      {/* Recruitment Info */}
                      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
                        <h4 className="font-semibold text-sm text-foreground">Informasi Rekrutmen</h4>
                        <div className="space-y-3">
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase">Lowongan</p>
                            <p className="text-sm font-bold text-foreground mt-1">{selectedJob.numberOfOpenings || '-'} posisi</p>
                          </div>
                          {selectedJob.applyDeadline && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase">Deadline</p>
                              <p className="text-sm text-foreground mt-1">
                                {format(
                                  selectedJob.applyDeadline.seconds ? new Date(selectedJob.applyDeadline.seconds * 1000) : new Date(selectedJob.applyDeadline),
                                  'dd MMM yyyy',
                                  { locale: idLocale }
                                )}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Assigned Team */}
                      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                        <h4 className="font-semibold text-sm text-foreground">Tim Rekrutmen</h4>
                        {(selectedJob.assignedUserIds || []).length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {(selectedJob.assignedUserIds || []).map(uid => {
                              const user = userProfileMap.get(uid);
                              return user ? (
                                <Badge key={uid} variant="secondary">
                                  {user.fullName}
                                </Badge>
                              ) : null;
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">Belum ada tim yang ditugaskan.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
