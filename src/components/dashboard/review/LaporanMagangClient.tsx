
'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { DailyReport, UserProfile, EmployeeProfile, Brand } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format, formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';
import { Loader2, Eye, Search, RotateCcw } from 'lucide-react';
import { ReviewReportDialog } from './ReviewReportDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { KpiCard } from '@/components/recruitment/KpiCard';

export function LaporanMagangClient() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();

  const [activeTab, setActiveTab] = useState('submitted');
  const [selectedReport, setSelectedReport] = useState<DailyReport & { internName?: string; supervisorName?: string; } | null>(null);
  
  const [brandFilter, setBrandFilter] = useState('all');
  const [supervisorFilter, setSupervisorFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const reportsQuery = useMemoFirebase(() => {
    if (!userProfile) return null;

    if (['manager', 'karyawan'].includes(userProfile.role)) {
        // Mentors can only see reports assigned to them. This query is secure and efficient.
        return query(collection(firestore, 'daily_reports'), where('supervisorUid', '==', userProfile.uid));
    }
    
    // HRD and Super Admin can see all reports.
    // This is allowed by the security rules, and client-side filters will apply to this broad set.
    return collection(firestore, 'daily_reports');

  }, [firestore, userProfile]);

  const { data: reports, isLoading: isLoadingReports, mutate: mutateReports } = useCollection<DailyReport>(reportsQuery);

  const { data: interns, isLoading: isLoadingInterns } = useCollection<EmployeeProfile>(
    useMemoFirebase(() => query(collection(firestore, 'employee_profiles'), where('employmentType', '==', 'magang')), [firestore])
  );

  const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(
    useMemoFirebase(() => collection(firestore, 'brands'), [firestore])
  );

  const internMap = useMemo(() => new Map(interns?.map(i => [i.uid, i])), [interns]);
  
  const reportsWithDetails = useMemo(() => {
    if (!reports) return [];
    
    return reports.map(report => {
        const internProfile = internMap.get(report.uid);
        return {
            ...report,
            internName: internProfile?.fullName || 'Unknown Intern',
            supervisorUid: internProfile?.supervisorUid || report.supervisorUid || null,
            supervisorName: internProfile?.supervisorName || report.supervisorName || 'Unassigned',
            division: internProfile?.division || 'N/A',
            brandName: internProfile?.brandName || 'N/A',
            brandId: internProfile?.brandId || 'N/A',
        };
    }).sort((a, b) => b.date.toMillis() - a.date.toMillis());
  }, [reports, internMap]);
  
  const uniqueSupervisors = useMemo(() => {
    if (!interns) return [];
    const supervisorSet = new Set<string>();
    interns.forEach(intern => {
      if (intern.supervisorName && intern.supervisorName !== 'Unassigned') {
        supervisorSet.add(intern.supervisorName);
      }
    });
    return Array.from(supervisorSet).sort();
  }, [interns]);

  const filteredReports = useMemo(() => {
    let filtered = reportsWithDetails;
    
    // HRD/Admin filtering is now client-side after the broad fetch
    if (userProfile && ['hrd', 'super-admin'].includes(userProfile.role)) {
        if (brandFilter !== 'all') {
            filtered = filtered.filter(r => r.brandId === brandFilter);
        }
        if (supervisorFilter !== 'all') {
            filtered = filtered.filter(r => r.supervisorName === supervisorFilter);
        }
        if (searchTerm.trim() !== '') {
            const lowercasedSearch = searchTerm.toLowerCase();
            filtered = filtered.filter(r => r.internName.toLowerCase().includes(lowercasedSearch));
        }
    }
    
    return filtered;
  }, [reportsWithDetails, userProfile, brandFilter, supervisorFilter, searchTerm]);

  const kpiData = useMemo(() => {
    const submitted = filteredReports.filter(r => r.status === 'submitted').length;
    const needs_revision = filteredReports.filter(r => r.status === 'needs_revision').length;
    const approved = filteredReports.filter(r => r.status === 'approved').length;
    const totalReports = filteredReports.length;
    return { submitted, needs_revision, approved, totalReports };
  }, [filteredReports]);
  
  const reportsForCurrentTab = useMemo(() => {
    return filteredReports.filter(r => r.status === activeTab);
  }, [filteredReports, activeTab]);

  const handleReviewSuccess = () => {
    mutateReports();
    setSelectedReport(null);
  };
  
  const handleResetFilters = () => {
    setBrandFilter('all');
    setSupervisorFilter('all');
    setSearchTerm('');
  };

  const isLoading = isLoadingReports || isLoadingInterns || isLoadingBrands;

  if (isLoading) {
    return <div className="h-64 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      {userProfile && ['hrd', 'super-admin'].includes(userProfile.role) && (
        <>
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-grow min-w-[200px]">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Cari nama intern..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8" />
                </div>
                <Select value={brandFilter} onValueChange={setBrandFilter} disabled={isLoadingBrands}>
                    <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Semua Brand" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Semua Brand</SelectItem>{brands?.map(b => <SelectItem key={b.id!} value={b.id!}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={supervisorFilter} onValueChange={setSupervisorFilter}>
                    <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Semua Mentor" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Semua Mentor</SelectItem>
                        {uniqueSupervisors.length > 0 ? (
                            uniqueSupervisors.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)
                        ) : (
                            <SelectItem value="no-mentors" disabled>Tidak ada mentor yang ditugaskan</SelectItem>
                        )}
                    </SelectContent>
                </Select>
                <Button onClick={handleResetFilters} variant="ghost" size="sm" className="text-muted-foreground"><RotateCcw className="mr-2 h-4 w-4" />Reset</Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <KpiCard title="Total Laporan" value={kpiData.totalReports} />
                <KpiCard title="Menunggu Review" value={kpiData.submitted} />
                <KpiCard title="Perlu Revisi" value={kpiData.needs_revision} deltaType="inverse" />
                <KpiCard title="Disetujui" value={kpiData.approved} />
            </div>
        </>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
            <TabsTrigger value="submitted">Terkirim</TabsTrigger>
            <TabsTrigger value="needs_revision">Perlu Revisi</TabsTrigger>
            <TabsTrigger value="approved">Disetujui</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama Intern</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Divisi</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead>Mentor / PIC</TableHead>
              <TableHead>Update Terakhir</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reportsForCurrentTab.length > 0 ? reportsForCurrentTab.map(report => (
              <TableRow key={report.id}>
                <TableCell className="font-medium">{report.internName}</TableCell>
                <TableCell>{report.brandName}</TableCell>
                <TableCell>{report.division}</TableCell>
                <TableCell>{format(report.date.toDate(), 'eeee, dd MMM', { locale: id })}</TableCell>
                <TableCell>{report.supervisorName}</TableCell>
                <TableCell>{formatDistanceToNow(report.updatedAt.toDate(), { addSuffix: true, locale: id })}</TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => setSelectedReport(report)}>
                    <Eye className="mr-2 h-4 w-4" /> Review
                  </Button>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={7} className="h-24 text-center">Tidak ada laporan dengan status ini untuk filter yang dipilih.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {selectedReport && (
        <ReviewReportDialog
            open={!!selectedReport}
            onOpenChange={(isOpen) => !isOpen && setSelectedReport(null)}
            report={selectedReport}
            onSuccess={handleReviewSuccess}
        />
      )}
    </div>
  );
}
