'use client';

// This is a new file for the client component of the review page
import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase, updateDocumentNonBlocking } from '@/firebase';
import { collection, doc, query, where, Timestamp } from 'firebase/firestore';
import type { DailyReport, UserProfile, EmployeeProfile } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { Loader2, Eye } from 'lucide-react';
import { ReviewReportDialog } from './ReviewReportDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function LaporanMagangClient() {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const [activeTab, setActiveTab] = useState('submitted');
  const [selectedReport, setSelectedReport] = useState<DailyReport & { internName?: string; supervisorName?: string; } | null>(null);

  const { data: reports, isLoading: isLoadingReports, mutate: mutateReports } = useCollection<DailyReport>(
    useMemoFirebase(() => collection(firestore, 'daily_reports'), [firestore])
  );

  const { data: interns, isLoading: isLoadingInterns } = useCollection<EmployeeProfile>(
    useMemoFirebase(() => query(collection(firestore, 'employee_profiles'), where('employmentType', '==', 'magang')), [firestore])
  );

  const internMap = useMemo(() => new Map(interns?.map(i => [i.uid, i])), [interns]);
  
  const reportsToReview = useMemo(() => {
    if (!reports || !userProfile) return [];
    
    let filtered = reports;

    if (userProfile.role === 'manager') {
      filtered = reports.filter(r => r.supervisorUid === userProfile.uid);
    }
    
    return filtered.map(report => ({
        ...report,
        internName: internMap.get(report.uid)?.fullName || 'Unknown Intern',
        supervisorName: internMap.get(report.uid)?.supervisorName || 'Unassigned',
    })).sort((a, b) => b.date.toMillis() - a.date.toMillis());

  }, [reports, userProfile, internMap]);

  const filteredByTab = useMemo(() => {
    return reportsToReview.filter(r => r.status === activeTab);
  }, [reportsToReview, activeTab]);

  const handleReviewSuccess = () => {
    mutateReports();
    setSelectedReport(null);
  }

  if (isLoadingReports || isLoadingInterns) {
    return <div className="h-64 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
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
              <TableHead>Tanggal</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Supervisor</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredByTab.length > 0 ? filteredByTab.map(report => (
              <TableRow key={report.id}>
                <TableCell className="font-medium">{report.internName}</TableCell>
                <TableCell>{format(report.date.toDate(), 'eeee, dd MMM yyyy', { locale: id })}</TableCell>
                <TableCell><Badge variant={report.status === 'submitted' ? 'default' : 'secondary'} className="capitalize">{report.status.replace('_', ' ')}</Badge></TableCell>
                <TableCell>{report.supervisorName}</TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => setSelectedReport(report)}>
                    <Eye className="mr-2 h-4 w-4" /> Review
                  </Button>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={5} className="h-24 text-center">Tidak ada laporan dengan status ini.</TableCell></TableRow>
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
