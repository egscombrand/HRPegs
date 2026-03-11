'use client';

import * as React from 'react';
import { useMemo, useState } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, Timestamp } from 'firebase/firestore';
import type { UserProfile, Brand, DailyReport, MonthlyEvaluation, EmployeeProfile, InternWithReviewStatus } from '@/lib/types';
import { KpiCard } from '@/components/recruitment/KpiCard';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Search, AlertTriangle, CalendarCheck, Clock, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { id } from 'date-fns/locale';
import { MonthlyEvaluationDialog } from './MonthlyEvaluationDialog';
import { Badge } from '@/components/ui/badge';
import { getReviewStatus, getCurrentReviewCycle } from '@/lib/recruitment/review-cycles';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type ReportSummary = {
    total: number;
    submitted: number;
    needs_revision: number;
    approved: number;
}

type ProcessedIntern = InternWithReviewStatus & {
    brandName?: string;
    reportSummary: ReportSummary;
    evaluation?: MonthlyEvaluation;
};

export function HrdMonthlyReviewDashboard({ userProfile }: { userProfile: UserProfile }) {
    const firestore = useFirestore();
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [brandFilter, setBrandFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedInternData, setSelectedInternData] = useState<ProcessedIntern | null>(null);

    const { data: interns, isLoading: isLoadingInterns } = useCollection<EmployeeProfile>(
        useMemoFirebase(() => query(collection(firestore, 'employee_profiles'), where('employmentType', '==', 'magang')), [firestore])
    );
    const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(
        useMemoFirebase(() => collection(firestore, 'brands'), [firestore])
    );
    const { data: evaluations, isLoading: isLoadingEvaluations, mutate: mutateEvaluations } = useCollection<MonthlyEvaluation>(
        useMemoFirebase(() => {
            const [year, month] = selectedMonth.split('-');
            const monthStart = new Date(parseInt(year), parseInt(month) - 1, 1);
            return query(collection(firestore, 'monthly_evaluations'), where('evaluationMonth', '>=', startOfMonth(monthStart)), where('evaluationMonth', '<=', endOfMonth(monthStart)));
        }, [firestore, selectedMonth])
    );
    const { data: allDailyReports, isLoading: isLoadingReports } = useCollection<DailyReport>(
        useMemoFirebase(() => collection(firestore, 'daily_reports'), [firestore])
    );

    const brandMap = useMemo(() => new Map(brands?.map(b => [b.id!, b.name])), [brands]);
    const evaluationMap = useMemo(() => new Map(evaluations?.map(e => [`${e.internUid}_${format(e.evaluationMonth.toDate(), 'yyyy-MM')}`, e])), [evaluations]);
    
    const processedInterns = useMemo((): ProcessedIntern[] => {
        if (!interns || !allDailyReports) return [];
        const now = new Date();
        const reportsByUid = allDailyReports.reduce((acc, report) => {
            if (!acc[report.uid]) acc[report.uid] = [];
            acc[report.uid].push(report);
            return acc;
        }, {} as Record<string, DailyReport[]>);

        return interns.map(intern => {
            const reviewCycle = getCurrentReviewCycle(intern.internshipStartDate?.toDate(), now);
            const evaluation = reviewCycle ? evaluationMap.get(`${intern.uid}_${reviewCycle.monthId}`) : undefined;
            const reviewStatus = getReviewStatus(reviewCycle, evaluation, now);
            
            const internReports = reportsByUid[intern.uid] || [];
            const summary: ReportSummary = { total: 0, submitted: 0, needs_revision: 0, approved: 0 };
            
            if (reviewCycle) {
                internReports.forEach(report => {
                    const reportDate = report.date.toDate();
                    if (reportDate >= reviewCycle.periodStart && reportDate <= reviewCycle.periodEnd) {
                        summary.total++;
                        if ((summary as any)[report.status] !== undefined) {
                            (summary as any)[report.status]++;
                        }
                    }
                });
            }

            const brandDisplay = Array.isArray(intern.brandId) ? intern.brandId.map(id => brandMap.get(id)).join(', ') : (intern.brandId ? brandMap.get(intern.brandId) : 'N/A');

            return {
                ...intern,
                reviewCycle,
                reviewStatus,
                evaluation,
                reportSummary: summary,
                brandName: brandDisplay,
                supervisorName: intern.supervisorName || 'N/A',
            };
        });
    }, [interns, evaluationMap, allDailyReports, brandMap]);
    
    const filteredData = useMemo(() => {
        let data = processedInterns;
        if (brandFilter !== 'all') {
            data = data.filter(d => Array.isArray(d.brandId) ? d.brandId.includes(brandFilter) : d.brandId === brandFilter);
        }
        if (searchTerm) {
            const lowercasedTerm = searchTerm.toLowerCase();
            data = data.filter(d => d.fullName.toLowerCase().includes(lowercasedTerm));
        }
        return data;
    }, [processedInterns, brandFilter, searchTerm]);

    const kpis = useMemo(() => {
        const counts = {
            siapDireview: 0,
            akanJatuhTempo: 0,
            terlambat: 0,
        };
        filteredData.forEach(intern => {
            if (intern.reviewStatus === 'Siap Direview') counts.siapDireview++;
            if (intern.reviewStatus === 'Akan Jatuh Tempo') counts.akanJatuhTempo++;
            if (intern.reviewStatus === 'Terlambat') counts.terlambat++;
        });
        return counts;
    }, [filteredData]);
    
    const internsByStatus = useMemo(() => {
        const statusGroups: {
            siapDireview: ProcessedIntern[],
            akanJatuhTempo: ProcessedIntern[],
            terlambat: ProcessedIntern[],
            sudahDievaluasi: ProcessedIntern[],
            semua: ProcessedIntern[]
        } = {
            siapDireview: [],
            akanJatuhTempo: [],
            terlambat: [],
            sudahDievaluasi: [],
            semua: filteredData,
        };

        filteredData.forEach(intern => {
            switch (intern.reviewStatus) {
                case 'Siap Direview':
                    statusGroups.siapDireview.push(intern);
                    break;
                case 'Akan Jatuh Tempo':
                    statusGroups.akanJatuhTempo.push(intern);
                    break;
                case 'Terlambat':
                    statusGroups.terlambat.push(intern);
                    break;
                case 'Sudah Dievaluasi':
                    statusGroups.sudahDievaluasi.push(intern);
                    break;
                default:
                    break;
            }
        });
        return statusGroups;
    }, [filteredData]);

    const [activeTab, setActiveTab] = useState('siapDireview');
    const internsForTab = useMemo(() => {
        switch(activeTab) {
            case 'siapDireview': return internsByStatus.siapDireview;
            case 'akanJatuhTempo': return internsByStatus.akanJatuhTempo;
            case 'terlambat': return internsByStatus.terlambat;
            case 'sudahDievaluasi': return internsByStatus.sudahDievaluasi;
            default: return internsByStatus.semua;
        }
    }, [activeTab, internsByStatus]);
    
    const handleEvaluationSuccess = () => {
      mutateEvaluations();
      setSelectedInternData(null);
    }
    
    const monthOptions = Array.from({ length: 6 }, (_, i) => {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        return {
            value: format(date, 'yyyy-MM'),
            label: format(date, 'MMMM yyyy', { locale: id }),
        };
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
                <Select value={selectedMonth} onValueChange={setSelectedMonth} disabled>
                    <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{monthOptions.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
                 <Select value={brandFilter} onValueChange={setBrandFilter}>
                    <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="All Brands" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All Brands</SelectItem>{brands?.map(b => <SelectItem key={b.id!} value={b.id!}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
                <div className="relative flex-grow min-w-[200px]"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Cari nama intern..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8" /></div>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <KpiCard title="Siap Direview" value={kpis.siapDireview} />
                <KpiCard title="Akan Jatuh Tempo" value={kpis.akanJatuhTempo} />
                <KpiCard title="Terlambat Review" value={kpis.terlambat} deltaType="inverse" />
            </div>
            
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                    <TabsTrigger value="siapDireview">Siap Direview ({internsByStatus.siapDireview.length})</TabsTrigger>
                    <TabsTrigger value="akanJatuhTempo">Akan Jatuh Tempo ({internsByStatus.akanJatuhTempo.length})</TabsTrigger>
                    <TabsTrigger value="terlambat">Terlambat ({internsByStatus.terlambat.length})</TabsTrigger>
                    <TabsTrigger value="sudahDievaluasi">Sudah Dievaluasi ({internsByStatus.sudahDievaluasi.length})</TabsTrigger>
                    <TabsTrigger value="semua">Semua Intern ({internsByStatus.semua.length})</TabsTrigger>
                </TabsList>
                <TabsContent value={activeTab} className="mt-4">
                     <div className="rounded-lg border">
                        <Table>
                            <TableHeader><TableRow><TableHead>Nama Intern</TableHead><TableHead>Periode Review</TableHead><TableHead>Jatuh Tempo</TableHead><TableHead>Laporan Bulan Ini</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {internsForTab.length > 0 ? internsForTab.map(intern => (
                                    <TableRow key={intern.uid}>
                                        <TableCell className="font-medium">{intern.fullName}</TableCell>
                                        <TableCell>{intern.reviewCycle ? `${format(intern.reviewCycle.periodStart, 'dd MMM')} - ${format(intern.reviewCycle.periodEnd, 'dd MMM')}` : '-'}</TableCell>
                                        <TableCell>{intern.reviewCycle ? format(intern.reviewCycle.reviewDueDate, 'dd MMM yyyy') : '-'}</TableCell>
                                        <TableCell>
                                            <div>
                                                <p className="text-sm">Total: {intern.reportSummary.total}</p>
                                                <p className="text-xs text-green-600">Disetujui: {intern.reportSummary.approved}</p>
                                            </div>
                                        </TableCell>
                                        <TableCell><Badge variant={intern.reviewStatus === 'Terlambat' ? 'destructive' : 'secondary'}>{intern.reviewStatus}</Badge></TableCell>
                                        <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => setSelectedInternData(intern)}>Review & Evaluasi</Button></TableCell>
                                    </TableRow>
                                )) : (<TableRow><TableCell colSpan={6} className="h-24 text-center">Tidak ada data intern untuk tab ini.</TableCell></TableRow>)}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>
            </Tabs>
           
            {selectedInternData && (
                <MonthlyEvaluationDialog
                    open={!!selectedInternData}
                    onOpenChange={() => setSelectedInternData(null)}
                    internData={selectedInternData}
                    onSuccess={handleEvaluationSuccess}
                />
            )}
        </div>
    );
}