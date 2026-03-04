'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, Timestamp } from 'firebase/firestore';
import type { JobApplication, Job, UserProfile, Brand, AttendanceSite, AttendanceEvent } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { startOfDay, endOfDay, subDays } from 'date-fns';

import { GlobalFilterBar } from './GlobalFilterBar';
import { KpiCards } from './KpiCards';
import { NeedsActionPanel } from './NeedsActionPanel';
import { AnalyticsCharts } from './AnalyticsCharts';
import { AttendanceTable } from './AttendanceTable';
import type { FilterState, AttendanceRecord, Kpi, ChartData } from './HrdDashboardTypes';
import { calculateKpisAndRecords, generateChartData } from './hrdDashboardUtils';

function DashboardSkeleton() {
    return (
        <div className="space-y-6">
            <Skeleton className="h-12 w-full" />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                {[...Array(12)].map((_, i) => <Skeleton key={i} className="h-24" />)}
            </div>
            <Skeleton className="h-96 w-full" />
        </div>
    )
}

export function HrdControlTowerClient() {
    const firestore = useFirestore();
    const [view, setView] = useState('overview');
    
    const [filters, setFilters] = useState<FilterState>({
        date: new Date(),
        brandId: undefined,
        siteId: undefined,
        employmentType: undefined,
        searchTerm: '',
        needsActionOnly: false,
    });
    
    // --- Data Fetching ---
    const { data: users, isLoading: isLoadingUsers } = useCollection<UserProfile>(
        useMemoFirebase(() => query(collection(firestore, 'users'), where('isActive', '==', true)), [firestore])
    );
    const { data: sites, isLoading: isLoadingSites } = useCollection<AttendanceSite>(
        useMemoFirebase(() => collection(firestore, 'attendance_sites'), [firestore])
    );
    const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(
        useMemoFirebase(() => collection(firestore, 'brands'), [firestore])
    );
    
    // Fetch attendance events for the current date + last 7 days for trends
    const eventsQuery = useMemoFirebase(() => {
        const endDate = endOfDay(filters.date);
        const startDate = startOfDay(subDays(filters.date, 7));
        return query(
            collection(firestore, 'attendance_events'),
            where('tsServer', '>=', startDate),
            where('tsServer', '<=', endDate)
        );
    }, [firestore, filters.date]);
    const { data: attendanceEvents, isLoading: isLoadingEvents } = useCollection<AttendanceEvent>(eventsQuery);
    
    // Fetch applications for today
    const appsQuery = useMemoFirebase(() => {
        const start = startOfDay(new Date());
        const end = endOfDay(new Date());
        return query(
            collection(firestore, 'applications'),
            where('submittedAt', '>=', start),
            where('submittedAt', '<=', end)
        );
    }, [firestore]);
    const { data: newApplications, isLoading: isLoadingApps } = useCollection<JobApplication>(appsQuery);

    const isLoading = isLoadingUsers || isLoadingSites || isLoadingBrands || isLoadingEvents || isLoadingApps;

    const { kpis, attendanceRecords } = useMemo(() => {
        return calculateKpisAndRecords(users, attendanceEvents, sites, brands, newApplications, filters);
    }, [users, attendanceEvents, sites, brands, newApplications, filters]);

    const chartData = useMemo(() => {
        return generateChartData(attendanceRecords, attendanceEvents, filters.date);
    }, [attendanceRecords, attendanceEvents, filters.date]);

    if (isLoading) {
        return <DashboardSkeleton />;
    }

    const filteredRecords = attendanceRecords.filter(record => {
        if (filters.needsActionOnly) {
            return record.flags.length > 0 || record.status === 'Belum Tap In' || record.status === 'Belum Tap Out';
        }
        return true;
    });

    return (
        <Tabs value={view} onValueChange={setView} className="w-full">
            <div className="sticky top-16 z-20 bg-background/95 backdrop-blur-sm -mx-6 px-6 -mt-6 py-4 border-b">
                <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="analytics">Analytics</TabsTrigger>
                </TabsList>
            </div>
            
            <div className="space-y-6 mt-6">
                <GlobalFilterBar
                    brands={brands || []}
                    sites={sites || []}
                    filters={filters}
                    setFilters={setFilters}
                />
                
                <KpiCards kpis={kpis} />

                <TabsContent value="overview" className="mt-0 space-y-6">
                    <NeedsActionPanel records={attendanceRecords} />
                    <AttendanceTable records={filteredRecords} />
                </TabsContent>

                <TabsContent value="analytics" className="mt-0">
                    <AnalyticsCharts chartData={chartData} />
                </TabsContent>
            </div>
        </Tabs>
    );
}
