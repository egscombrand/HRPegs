'use client';

import Link from 'next/link';
import { useMemo, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  ArrowRight, Briefcase, MapPin, Search, Trash2, Bookmark,
  Building, Check, Clock, Users, Filter, X, ChevronDown
} from 'lucide-react';
import { useCollection, useFirestore, useMemoFirebase, setDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, where, doc, serverTimestamp, getDocs } from 'firebase/firestore';
import type { Job, Brand, SavedJob, JobApplication } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { isPast, differenceInDays, format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { isApplicationActive, MAX_ACTIVE_APPLICATIONS } from '@/lib/application-rules';

/**
 * Extract a clean city name from a raw location label.
 * Returns the matched canonical city, or the trimmed raw value as fallback.
 */
function normalizeCity(raw?: string | null): string {
  if (!raw) return '';
  const s = raw.toLowerCase();

  // Order matters: check longer / more specific patterns first
  const CITY_PATTERNS: [RegExp, string][] = [
    [/yogyakarta|yogya\b|jogja|jogyakarta/, 'Yogyakarta'],
    [/surakarta|solo\b|kota solo|surakarte/, 'Surakarta'],
    [/semarang/, 'Semarang'],
    [/jakarta/, 'Jakarta'],
    [/bandung/, 'Bandung'],
    [/surabaya/, 'Surabaya'],
    [/malang/, 'Malang'],
    [/medan/, 'Medan'],
    [/makassar/, 'Makassar'],
    [/denpasar|bali\b/, 'Bali'],
    [/bekasi/, 'Bekasi'],
    [/tangerang/, 'Tangerang'],
    [/depok/, 'Depok'],
    [/bogor/, 'Bogor'],
    [/remote/, 'Remote'],
  ];

  for (const [pattern, city] of CITY_PATTERNS) {
    if (pattern.test(s)) return city;
  }

  // Fallback: return the raw value trimmed (capitalise first letter)
  const trimmed = raw.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

interface JobCardProps {
  job: Job;
  isSaved: boolean;
  onToggleSave: (job: Job, isSaved: boolean) => void;
  applicationStatus?: JobApplication | null;
}

const JobCard = ({ job, isSaved, onToggleSave, applicationStatus }: JobCardProps) => {
  const deadline = job.applyDeadline || job.applicationDeadline;
  const daysLeft = deadline ? differenceInDays(deadline.toDate(), new Date()) : null;
  const isExpired = deadline ? isPast(deadline.toDate()) : false;
  const isUrgent = deadline && daysLeft !== null && daysLeft <= 7 && daysLeft >= 0;
  const divisionLabel = job.divisionName || job.division;

  if (isExpired && job.publishStatus !== 'reopened') return null;

  const deadlineText = deadline
    ? format(deadline.toDate(), 'dd MMMM yyyy', { locale: idLocale })
    : 'Tanpa deadline';

  const workModeLabel =
    job.workMode === 'onsite' ? 'On-site' :
    job.workMode === 'hybrid' ? 'Hybrid' :
    job.workMode === 'remote' ? 'Remote' : null;

  return (
    <Card className="group border border-slate-200 dark:border-slate-800 hover:border-teal-400 dark:hover:border-teal-600 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3 justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug">
              {job.position}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
              <Building className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{job.brandName}</span>
            </p>
          </div>
          {applicationStatus && (
            <Badge className="bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 shrink-0 text-xs">
              Sudah Dilamar
            </Badge>
          )}
        </div>

        {/* Badges Row */}
        <div className="flex flex-wrap gap-1.5">
          <Badge
            variant="outline"
            className="text-xs py-1 px-2 border-slate-300 dark:border-slate-700 gap-1"
            title={job.location || undefined}
          >
            <MapPin className="h-3 w-3" />
            {normalizeCity(job.location)}
          </Badge>
          {divisionLabel && (
            <Badge variant="outline" className="text-xs py-1 px-2 border-slate-300 dark:border-slate-700">
              {divisionLabel}
            </Badge>
          )}
          <Badge variant="secondary" className="text-xs py-1 px-2">
            {job.statusJob === 'fulltime' ? 'Full-time' : 'Internship'}
          </Badge>
          {workModeLabel && (
            <Badge variant="secondary" className="text-xs py-1 px-2">
              {workModeLabel}
            </Badge>
          )}
        </div>

        {/* Info Row */}
        <div className="flex items-center gap-4 text-sm border-t border-slate-100 dark:border-slate-800 pt-3">
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
            <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>{job.numberOfOpenings || 1} posisi</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 flex-1">
            <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="truncate">Deadline: {deadlineText}</span>
          </div>
          {daysLeft !== null && (
            <span className={cn(
              'shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full',
              daysLeft <= 3
                ? 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400'
                : daysLeft <= 7
                ? 'bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            )}>
              {daysLeft === 0 ? 'Hari ini' : `${daysLeft} hari`}
            </span>
          )}
          {isUrgent && daysLeft !== null && daysLeft > 3 && (
            <Badge className="shrink-0 bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800 text-xs">
              Segera Berakhir
            </Badge>
          )}
        </div>

        {/* Application Status */}
        {applicationStatus && (
          <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg px-3 py-2 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
            <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">Status Lamaran</span>
            <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200 capitalize">
              {applicationStatus.status.replace(/_/g, ' ')}
            </span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-1">
          <Button asChild className="h-9 bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600 text-white font-semibold text-sm gap-1.5 flex-1">
            <Link href={`/careers/portal/jobs/${job.slug}`}>
              {applicationStatus ? 'Lihat Lamaran' : 'Lihat Detail'}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-3 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 gap-1.5 shrink-0"
            onClick={() => onToggleSave(job, isSaved)}
            aria-label={isSaved ? 'Hapus dari tersimpan' : 'Simpan lowongan'}
          >
            {isSaved ? (
              <>
                <Check className="h-3.5 w-3.5 text-teal-600" />
                <span className="text-xs font-medium hidden sm:inline">Tersimpan</span>
              </>
            ) : (
              <>
                <Bookmark className="h-3.5 w-3.5" />
                <span className="text-xs font-medium hidden sm:inline">Simpan</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
};

const JobCardSkeleton = () => (
  <Card className="border border-slate-200 dark:border-slate-800">
    <div className="p-5 space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-20" />
      </div>
      <Skeleton className="h-px w-full" />
      <div className="flex gap-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-24" />
      </div>
    </div>
  </Card>
);

export default function CandidateJobsPage() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const firestore = useFirestore();

  const [searchTerm, setSearchTerm] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'newest' | 'deadline' | 'a-z' | 'company'>('newest');
  const [filterOpen, setFilterOpen] = useState(false);

  const jobsQuery = useMemoFirebase(
    () => query(
      collection(firestore, 'jobs'),
      where('publishStatus', 'in', ['published', 'reopened'])
    ),
    [firestore]
  );
  const { data: jobs, isLoading: isLoadingJobs } = useCollection<Job>(jobsQuery);

  const brandsQuery = useMemoFirebase(() => query(collection(firestore, 'brands')), [firestore]);
  const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(brandsQuery);

  const applicationsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(
      collection(firestore, 'applications'),
      where('candidateUid', '==', userProfile.uid)
    );
  }, [userProfile?.uid, firestore]);
  const { data: applications, isLoading: isLoadingApps } = useCollection<JobApplication>(applicationsQuery);

  const savedJobsQuery = useMemoFirebase(() => {
    if (!userProfile) return null;
    return collection(firestore, 'users', userProfile.uid, 'saved_jobs');
  }, [userProfile, firestore]);
  const { data: savedJobs, isLoading: isLoadingSavedJobs } = useCollection<SavedJob>(savedJobsQuery);
  const savedJobIds = useMemo(() => new Set(savedJobs?.map(j => j.jobId) || []), [savedJobs]);

  const [savedJobsDetails, setSavedJobsDetails] = useState<Job[]>([]);
  const [isLoadingSavedDetails, setIsLoadingSavedDetails] = useState(false);
  const savedJobIdsForQuery = useMemo(() => savedJobs?.map(j => j.jobId) || [], [savedJobs]);

  const isLoading = isLoadingJobs || isLoadingBrands || isLoadingSavedJobs || isLoadingApps;

  const applicationsByJobId = useMemo(() => {
    const map = new Map<string, JobApplication>();
    applications?.forEach(app => {
      if (app.jobId) map.set(app.jobId, app);
    });
    return map;
  }, [applications]);

  const activeApplicationCount = useMemo(
    () => (applications || []).filter((app) => isApplicationActive(app.status)).length,
    [applications],
  );

  useEffect(() => {
    const fetchSavedJobDetails = async () => {
      if (savedJobIdsForQuery.length === 0) {
        setSavedJobsDetails([]);
        return;
      }
      setIsLoadingSavedDetails(true);
      const chunks = [];
      for (let i = 0; i < savedJobIdsForQuery.length; i += 30) {
        chunks.push(savedJobIdsForQuery.slice(i, i + 30));
      }
      try {
        const promises = chunks.map(chunk =>
          getDocs(query(collection(firestore, 'jobs'), where('__name__', 'in', chunk)))
        );
        const snapshots = await Promise.all(promises);
        const jobsData = snapshots.flatMap(snap => snap.docs.map(d => ({ ...d.data(), id: d.id } as Job)));
        setSavedJobsDetails(jobsData);
      } catch {
        toast({ variant: 'destructive', title: 'Gagal memuat lowongan tersimpan.' });
      } finally {
        setIsLoadingSavedDetails(false);
      }
    };
    if (!isLoadingSavedJobs) fetchSavedJobDetails();
  }, [savedJobIdsForQuery, firestore, isLoadingSavedJobs, toast]);

  const locations = useMemo(() => {
    const cities = new Set<string>();
    jobs?.forEach(j => {
      const city = normalizeCity(j.location);
      if (city) cities.add(city);
    });
    return Array.from(cities).sort((a, b) => a.localeCompare(b, 'id'));
  }, [jobs]);

  const hasActiveFilters = searchTerm || brandFilter !== 'all' || locationFilter !== 'all' ||
    typeFilter !== 'all' || modeFilter !== 'all' || sortBy !== 'newest';

  const sortedJobs = useMemo(() => {
    if (!jobs) return [];
    const filtered = jobs.filter(job => {
      const deadline = job.applyDeadline || job.applicationDeadline;
      if (deadline && isPast(deadline.toDate()) && job.publishStatus !== 'reopened') return false;
      const matchesSearch = job.position.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (job.brandName || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesBrand = brandFilter === 'all' || job.brandId === brandFilter;
      const matchesLocation = locationFilter === 'all' || normalizeCity(job.location) === locationFilter;
      const matchesType = typeFilter === 'all' || job.statusJob === typeFilter;
      const matchesMode = modeFilter === 'all' || job.workMode === modeFilter;
      return matchesSearch && matchesBrand && matchesLocation && matchesType && matchesMode;
    });

    const sorted = [...filtered];
    switch (sortBy) {
      case 'newest':
        sorted.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        break;
      case 'deadline':
        sorted.sort((a, b) => {
          const dA = (a.applyDeadline || a.applicationDeadline)?.toMillis?.() ?? Infinity;
          const dB = (b.applyDeadline || b.applicationDeadline)?.toMillis?.() ?? Infinity;
          return dA - dB;
        });
        break;
      case 'a-z':
        sorted.sort((a, b) => a.position.localeCompare(b.position, 'id'));
        break;
      case 'company':
        sorted.sort((a, b) => (a.brandName || '').localeCompare(b.brandName || '', 'id'));
        break;
    }
    sorted.sort((a, b) => (applicationsByJobId.has(a.id!) ? 1 : 0) - (applicationsByJobId.has(b.id!) ? 1 : 0));
    return sorted;
  }, [jobs, searchTerm, brandFilter, locationFilter, typeFilter, modeFilter, sortBy, applicationsByJobId]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setBrandFilter('all');
    setLocationFilter('all');
    setTypeFilter('all');
    setModeFilter('all');
    setSortBy('newest');
  };

  const handleToggleSave = async (job: Job, isCurrentlySaved: boolean) => {
    if (!userProfile) {
      toast({ variant: 'destructive', title: 'Anda harus login' });
      return;
    }
    const savedJobRef = doc(firestore, 'users', userProfile.uid, 'saved_jobs', job.id!);
    if (isCurrentlySaved) {
      try {
        await deleteDocumentNonBlocking(savedJobRef);
        toast({ title: 'Dihapus dari Tersimpan', description: `"${job.position}" dihapus.` });
      } catch (error: any) {
        toast({ variant: 'destructive', title: 'Gagal menghapus', description: error.message });
      }
    } else {
      const savedJobData: Omit<SavedJob, 'id'> = {
        userId: userProfile.uid,
        jobId: job.id!,
        jobPosition: job.position,
        jobSlug: job.slug,
        brandName: job.brandName || '',
        savedAt: serverTimestamp() as any,
      };
      try {
        await setDocumentNonBlocking(savedJobRef, savedJobData, { merge: false });
        toast({ title: 'Lowongan Disimpan', description: `"${job.position}" disimpan.` });
      } catch (error: any) {
        toast({ variant: 'destructive', title: 'Gagal menyimpan', description: error.message });
      }
    }
  };

  const FilterPanel = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
          <Filter className="h-4 w-4" />
          Filter & Urutan
        </h3>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={handleResetFilters}
            className="h-6 px-2 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 gap-1">
            <X className="h-3 w-3" />
            Reset
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Cari</label>
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <Input
            placeholder="Posisi atau perusahaan..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-8 text-sm border-slate-300 dark:border-slate-700"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Perusahaan</label>
        <Select value={brandFilter} onValueChange={setBrandFilter} disabled={isLoadingBrands}>
          <SelectTrigger className="h-8 text-sm border-slate-300 dark:border-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Perusahaan</SelectItem>
            {brands?.map((brand) => (
              <SelectItem key={brand.id} value={brand.id!}>{brand.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Lokasi</label>
        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger className="h-8 text-sm border-slate-300 dark:border-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Lokasi</SelectItem>
            {locations.map((loc) => (
              <SelectItem key={loc} value={loc}>{loc}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Tipe Pekerjaan</label>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 text-sm border-slate-300 dark:border-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Tipe</SelectItem>
            <SelectItem value="fulltime">Full-time</SelectItem>
            <SelectItem value="internship">Internship</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Mode Kerja</label>
        <Select value={modeFilter} onValueChange={setModeFilter}>
          <SelectTrigger className="h-8 text-sm border-slate-300 dark:border-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Mode</SelectItem>
            <SelectItem value="onsite">On-site</SelectItem>
            <SelectItem value="hybrid">Hybrid</SelectItem>
            <SelectItem value="remote">Remote</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Urutan</label>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="h-8 text-sm border-slate-300 dark:border-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Terbaru</SelectItem>
            <SelectItem value="deadline">Deadline Terdekat</SelectItem>
            <SelectItem value="a-z">A–Z</SelectItem>
            <SelectItem value="company">Perusahaan</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Daftar Lowongan</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Temukan peluang karir di Environesia Group
        </p>
      </div>

      <Tabs defaultValue="explore" className="w-full">
        <TabsList className="grid w-full max-w-xs grid-cols-2 h-9 rounded-lg bg-slate-200 dark:bg-slate-800 p-1">
          <TabsTrigger value="explore" className="rounded-md text-xs font-semibold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm">
            Jelajahi
          </TabsTrigger>
          <TabsTrigger value="saved" className="rounded-md text-xs font-semibold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm">
            Tersimpan {savedJobIds.size > 0 && `(${savedJobIds.size})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="explore" className="mt-5">
          {/* Mobile Filter Toggle */}
          <div className="flex items-center justify-between mb-4 lg:hidden">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {isLoading ? 'Mencari...' : `${sortedJobs.length} lowongan`}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setFilterOpen(!filterOpen)}
            >
              <Filter className="h-3.5 w-3.5" />
              Filter
              {hasActiveFilters && <span className="bg-teal-500 text-white rounded-full h-4 w-4 text-[10px] flex items-center justify-center">!</span>}
              <ChevronDown className={cn('h-3 w-3 transition-transform', filterOpen && 'rotate-180')} />
            </Button>
          </div>

          {/* Mobile filter panel */}
          {filterOpen && (
            <Card className="mb-4 lg:hidden border-slate-200 dark:border-slate-800">
              <div className="p-4">
                <FilterPanel />
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
            {/* Desktop Filter Sidebar */}
            <div className="hidden lg:block">
              <div className="sticky top-20 space-y-0">
                <Card className="border-slate-200 dark:border-slate-800">
                  <div className="p-4">
                    <FilterPanel />
                  </div>
                </Card>
              </div>
            </div>

            {/* Jobs List */}
            <div className="min-w-0 space-y-4">
              <div className="hidden lg:flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {isLoading ? 'Mencari lowongan...' : `${sortedJobs.length} lowongan ditemukan`}
                </p>
              </div>

              {/* Active application info banner */}
              {activeApplicationCount > 0 && (
                <div className={cn(
                  "flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm",
                  activeApplicationCount >= MAX_ACTIVE_APPLICATIONS
                    ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20"
                    : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20",
                )}>
                  <Briefcase className={cn(
                    "h-4 w-4 shrink-0",
                    activeApplicationCount >= MAX_ACTIVE_APPLICATIONS ? "text-red-600" : "text-amber-600",
                  )} />
                  <p className={cn(
                    "flex-1",
                    activeApplicationCount >= MAX_ACTIVE_APPLICATIONS
                      ? "text-red-700 dark:text-red-400"
                      : "text-amber-700 dark:text-amber-400",
                  )}>
                    {activeApplicationCount >= MAX_ACTIVE_APPLICATIONS ? (
                      <>Anda sudah mencapai batas <strong>{MAX_ACTIVE_APPLICATIONS} lamaran aktif</strong>. Selesaikan lamaran yang ada sebelum melamar posisi baru.</>
                    ) : (
                      <>Anda memiliki <strong>{activeApplicationCount} lamaran aktif</strong>. Anda masih dapat melamar {MAX_ACTIVE_APPLICATIONS - activeApplicationCount} posisi lagi.</>
                    )}
                  </p>
                  <Button asChild variant="ghost" size="sm" className="h-7 shrink-0 text-xs">
                    <Link href="/careers/portal/applications">Lihat</Link>
                  </Button>
                </div>
              )}

              {isLoading ? (
                <div className="space-y-3">
                  <JobCardSkeleton />
                  <JobCardSkeleton />
                  <JobCardSkeleton />
                </div>
              ) : sortedJobs.length > 0 ? (
                <div className="space-y-3">
                  {sortedJobs.map(job => (
                    <JobCard
                      key={job.id}
                      job={job}
                      isSaved={savedJobIds.has(job.id!)}
                      onToggleSave={handleToggleSave}
                      applicationStatus={applicationsByJobId.get(job.id!)}
                    />
                  ))}
                </div>
              ) : (
                <Card className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                  <div className="p-12 text-center space-y-3">
                    <Briefcase className="h-10 w-10 text-slate-400 dark:text-slate-600 mx-auto" />
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white text-sm mb-1">
                        Tidak ada lowongan yang sesuai
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Coba ubah filter atau cek kembali nanti.
                      </p>
                    </div>
                    {hasActiveFilters && (
                      <Button variant="outline" size="sm" onClick={handleResetFilters} className="mt-2 text-xs">
                        Reset Filter
                      </Button>
                    )}
                  </div>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="saved" className="mt-5">
          <div className="space-y-4">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {isLoadingSavedDetails ? 'Memuat...' : `${savedJobsDetails.length} lowongan tersimpan`}
            </p>

            {isLoadingSavedDetails ? (
              <div className="space-y-3">
                <JobCardSkeleton />
                <JobCardSkeleton />
              </div>
            ) : savedJobsDetails.length > 0 ? (
              <div className="space-y-3 max-w-2xl">
                {savedJobsDetails.map(job => (
                  <JobCard
                    key={job.id}
                    job={job}
                    isSaved={true}
                    onToggleSave={handleToggleSave}
                    applicationStatus={applicationsByJobId.get(job.id!)}
                  />
                ))}
              </div>
            ) : (
              <Card className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                <div className="p-12 text-center space-y-3">
                  <Bookmark className="h-10 w-10 text-slate-400 dark:text-slate-600 mx-auto" />
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white text-sm mb-1">
                      Belum ada lowongan tersimpan
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Tekan tombol Simpan pada lowongan untuk mengaksesnya di sini.
                    </p>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
