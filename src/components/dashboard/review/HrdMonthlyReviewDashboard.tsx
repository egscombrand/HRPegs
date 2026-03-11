'use client';

import * as React from 'react';
import { useMemo, useState } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, Timestamp } from 'firebase/firestore';
import type { UserProfile, Brand, DailyReport, MonthlyEvaluation, EmployeeProfile } from '@/lib/types';
import { KpiCard } from '@/components/recruitment/KpiCard';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { id } from 'date-fns/locale';
import { MonthlyEvaluationDialog } from './MonthlyEvaluationDialog';

type MonthlyInternData = {
    internId: string;
    internName: string;
    brandId?: string | string[];
    brandName?: string;
    division?: string;
    supervisorName?: string;
    month: string; // YYYY-MM
    evaluationStatus: 'pending' | 'evaluated';
    reportCount: number;
}

export function HrdMonthlyReviewDashboard({ userProfile }: { userProfile: UserProfile }) {
    const firestore = useFirestore();
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [brandFilter, setBrandFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedInternData, setSelectedInternData] = useState<MonthlyInternData | null>(null);

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
            return query(collection(firestore, 'monthly_evaluations'), where('evaluationMonth', '==', Timestamp.fromDate(monthStart)))
        }, [firestore, selectedMonth])
    );

    const internMap = useMemo(() => new Map(interns?.map(i => [i.uid, i])), [interns]);
    const brandMap = useMemo(() => new Map(brands?.map(b => [b.id!, b.name])), [brands]);
    const evaluationMap = useMemo(() => new Map(evaluations?.map(e => [e.internUid, e])), [evaluations]);
    
    const monthlyData = useMemo((): MonthlyInternData[] => {
        if (!interns) return [];

        return interns.map(intern => {
            const evaluation = evaluationMap.get(intern.uid);
            const brandDisplay = Array.isArray(intern.brandId) ? intern.brandId.map(id => brandMap.get(id)).join(', ') : (intern.brandId ? brandMap.get(intern.brandId) : 'N/A');

            return {
                internId: intern.uid,
                internName: intern.fullName,
                brandId: intern.brandId,
                brandName: brandDisplay,
                division: intern.division || 'N/A',
                supervisorName: intern.supervisorName || 'N/A',
                month: selectedMonth,
                evaluationStatus: evaluation ? 'evaluated' : 'pending',
                reportCount: 0 // This needs daily_reports to be calculated, which is too heavy to fetch all
            };
        });
    }, [interns, evaluationMap, brandMap, selectedMonth]);
    
    const filteredData = useMemo(() => {
        let data = monthlyData;
        if (brandFilter !== 'all') {
            data = data.filter(d => Array.isArray(d.brandId) ? d.brandId.includes(brandFilter) : d.brandId === brandFilter);
        }
        if (searchTerm) {
            const lowercasedTerm = searchTerm.toLowerCase();
            data = data.filter(d => d.internName.toLowerCase().includes(lowercasedTerm));
        }
        return data;
    }, [monthlyData, brandFilter, searchTerm]);

    const kpis = useMemo(() => {
        const total = filteredData.length;
        const evaluated = filteredData.filter(d => d.evaluationStatus === 'evaluated').length;
        return {
            totalInterns: total,
            evaluated,
            pending: total - evaluated
        }
    }, [filteredData]);

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
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{monthOptions.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
                 <Select value={brandFilter} onValueChange={setBrandFilter}>
                    <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="All Brands" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All Brands</SelectItem>{brands?.map(b => <SelectItem key={b.id!} value={b.id!}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
                <div className="relative flex-grow min-w-[200px]"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Cari nama intern..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8" /></div>
            </div>
            
            <div className="grid gap-4 md:grid-cols-3">
                <KpiCard title="Total Intern Bulan Ini" value={kpis.totalInterns} />
                <KpiCard title="Sudah Dievaluasi" value={kpis.evaluated} />
                <KpiCard title="Belum Dievaluasi" value={kpis.pending} deltaType="inverse" />
            </div>

            <div className="rounded-lg border">
                <Table>
                    <TableHeader><TableRow><TableHead>Nama Intern</TableHead><TableHead>Brand</TableHead><TableHead>Divisi</TableHead><TableHead>Mentor</TableHead><TableHead>Status Evaluasi</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {filteredData.length > 0 ? filteredData.map(intern => (
                            <TableRow key={intern.internId}>
                                <TableCell className="font-medium">{intern.internName}</TableCell>
                                <TableCell>{intern.brandName}</TableCell>
                                <TableCell>{intern.division}</TableCell>
                                <TableCell>{intern.supervisorName}</TableCell>
                                <TableCell><Badge variant={intern.evaluationStatus === 'evaluated' ? 'default' : 'secondary'}>{intern.evaluationStatus === 'evaluated' ? 'Sudah Dievaluasi' : 'Belum Dievaluasi'}</Badge></TableCell>
                                <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => setSelectedInternData(intern)}>Review & Evaluasi</Button></TableCell>
                            </TableRow>
                        )) : (<TableRow><TableCell colSpan={6} className="h-24 text-center">Tidak ada data intern untuk filter ini.</TableCell></TableRow>)}
                    </TableBody>
                </Table>
            </div>
            {selectedInternData && (
                <MonthlyEvaluationDialog
                    open={!!selectedInternData}
                    onOpenChange={() => setSelectedInternData(null)}
                    internData={selectedInternData}
                    internProfile={internMap.get(selectedInternData.internId)!}
                    evaluation={evaluationMap.get(selectedInternData.internId)}
                    onSuccess={handleEvaluationSuccess}
                />
            )}
        </div>
    );
}
