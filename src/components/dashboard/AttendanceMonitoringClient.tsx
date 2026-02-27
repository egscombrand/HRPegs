'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query } from 'firebase/firestore';
import type { Brand, UserProfile } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GoogleDatePicker } from '@/components/ui/google-date-picker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '../ui/skeleton';
import { KpiCard } from '@/components/recruitment/KpiCard';

const kpiCardsData = [
    { title: "Hadir", value: 0 },
    { title: "Belum Tap In", value: 0 },
    { title: "Offsite", value: 0 },
    { title: "Anomali", value: 0 },
    { title: "Terlambat", value: 0 },
];

function MonitoringSkeleton() {
    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-28" />)}
            </div>
            <Skeleton className="h-96" />
        </div>
    );
}

export function AttendanceMonitoringClient() {
    const [date, setDate] = useState<Date | null>(new Date());
    const [brandFilter, setBrandFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const firestore = useFirestore();

    const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(
        useMemoFirebase(() => collection(firestore, 'brands'), [firestore])
    );
    
    // Placeholder - replace with actual data fetching and processing
    const isLoading = false;
    const summaryData = kpiCardsData;
    const tableData: any[] = [];

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
                <GoogleDatePicker value={date} onChange={setDate} />
                <Select value={brandFilter} onValueChange={setBrandFilter} disabled={isLoadingBrands}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                        <SelectValue placeholder="Semua Brand" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Semua Brand</SelectItem>
                        {brands?.map(brand => (
                            <SelectItem key={brand.id!} value={brand.id!}>{brand.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                 <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                        <SelectValue placeholder="Semua Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Semua Status</SelectItem>
                        <SelectItem value="present">Hadir</SelectItem>
                        <SelectItem value="absent">Belum Tap In</SelectItem>
                        <SelectItem value="late">Terlambat</SelectItem>
                        <SelectItem value="offsite">Offsite</SelectItem>
                        <SelectItem value="anomaly">Anomali</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            
            {isLoading ? <MonitoringSkeleton /> : (
                <>
                     <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                        {summaryData.map(card => (
                            <KpiCard key={card.title} title={card.title} value={card.value} />
                        ))}
                    </div>
                     <div className="rounded-lg border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nama</TableHead>
                                    <TableHead>Brand</TableHead>
                                    <TableHead>Tap In</TableHead>
                                    <TableHead>Tap Out</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Mode</TableHead>
                                    <TableHead>Flags</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {tableData.length > 0 ? tableData.map(row => (
                                    <TableRow key={row.id}>
                                        {/* Render table cells here */}
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-24 text-center">
                                            Data absensi untuk tanggal yang dipilih belum tersedia.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </>
            )}
        </div>
    );
}
