

'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, where, doc, type Timestamp, startOfDay, endOfDay } from 'firebase/firestore';
import type { Brand, UserProfile, AttendanceEvent } from '@/lib/types';
import { ROLES_INTERNAL } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GoogleDatePicker } from '@/components/ui/google-date-picker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '../ui/skeleton';
import { KpiCard } from '@/components/recruitment/KpiCard';
import { format } from 'date-fns';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { getInitials } from '@/lib/utils';
import Link from 'next/link';

interface AttendanceRecord {
  id: string;
  name: string;
  brandName: string;
  tapIn: string;
  tapOut: string;
  status: 'Sedang Bekerja' | 'Selesai' | 'Belum Tap In';
  mode: 'onsite' | 'offsite' | '-';
  flags: string[];
  photoUrl?: string | null;
}

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

    // --- Data Fetching ---
    const { data: sites, isLoading: isLoadingConfig } = useCollection<any>(
        useMemoFirebase(() => collection(firestore, 'attendance_sites'), [firestore])
    );
    const { data: users, isLoading: isLoadingUsers } = useCollection<UserProfile>(
        useMemoFirebase(() => query(collection(firestore, 'users'), where('role', 'in', ROLES_INTERNAL)), [firestore])
    );
    const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(
        useMemoFirebase(() => collection(firestore, 'brands'), [firestore])
    );

    const eventsQuery = useMemoFirebase(() => {
        if (!date) return null;
        const start = startOfDay(date);
        const end = endOfDay(date);
        return query(
            collection(firestore, 'attendance_events'),
            where('tsServer', '>=', start),
            where('tsServer', '<=', end)
        );
    }, [firestore, date]);
    const { data: attendanceEvents, isLoading: isLoadingEvents } = useCollection<AttendanceEvent>(eventsQuery);

    const isLoading = isLoadingConfig || isLoadingUsers || isLoadingBrands || isLoadingEvents;
    
    // --- Data Processing ---
    const { tableData, summaryData } = useMemo(() => {
        const summary = { hadir: 0, belumTapIn: 0, offsite: 0, anomali: 0, terlambat: 0 };
        if (!users || !attendanceEvents || !sites) {
            const defaultSummary = kpiCardsData.map(c => ({ title: c.title, value: 0 }));
            return { tableData: [], summaryData: defaultSummary };
        }
        
        const getTimestamp = (event: any): Timestamp | undefined => event.tsServer || event.timestamp || event.ts || event.createdAt;
        const brandMap = new Map(brands?.map(b => [b.id, b.name]));
        const activeSite = sites.find(s => s.isActive);

        const processedData = users.map(user => {
            const userEvents = attendanceEvents.filter(e => e.uid === user.uid || e.userId === user.uid);
            
            // FIX: Handle both 'tap_in'/'IN' and 'tap_out'/'OUT'
            const tapIn = userEvents.find(e => e.type === 'tap_in' || e.type === 'IN');
            const tapOut = userEvents.find(e => e.type === 'tap_out' || e.type === 'OUT');
            
            const tapInTimestamp = tapIn ? getTimestamp(tapIn) : null;
            const tapOutTimestamp = tapOut ? getTimestamp(tapOut) : null;

            let status: AttendanceRecord['status'] = 'Belum Tap In';
            if (tapIn && !tapOut) status = 'Sedang Bekerja';
            else if (tapIn && tapOut) status = 'Selesai';

            const flags: string[] = [];
            if (tapIn && tapInTimestamp) {
                summary.hadir++;
                if (tapIn.mode && (tapIn.mode as string).toLowerCase() === 'offsite') {
                    flags.push('Offsite');
                    summary.offsite++;
                }

                if (activeSite) {
                    const tapInTime = tapInTimestamp.toDate();
                    const shiftStart = new Date(tapInTime);
                    const [startHour, startMinute] = activeSite.shift.startTime.split(':').map(Number);
                    shiftStart.setHours(startHour, startMinute + activeSite.shift.graceLateMinutes, 0, 0);

                    if (tapInTime > shiftStart) {
                        flags.push('Terlambat');
                        summary.terlambat++;
                    }
                }
            }

            if (tapOut && tapOutTimestamp && activeSite) {
                const tapOutTime = tapOutTimestamp.toDate();
                const shiftEnd = new Date(tapOutTime);
                const [endHour, endMinute] = activeSite.shift.endTime.split(':').map(Number);
                shiftEnd.setHours(endHour, endMinute, 0, 0);
                if (tapOutTime < shiftEnd) flags.push('Pulang Cepat');
            }

            return {
                id: user.uid,
                name: user.fullName,
                brandId: user.brandId,
                brandName: Array.isArray(user.brandId) ? user.brandId.map(id => brandMap.get(id)).join(', ') : brandMap.get(user.brandId as string) || '-',
                tapIn: tapInTimestamp ? format(tapInTimestamp.toDate(), 'HH:mm') : '-',
                tapOut: tapOutTimestamp ? format(tapOutTimestamp.toDate(), 'HH:mm') : '-',
                status: status,
                mode: (tapIn?.mode as string)?.toLowerCase() || '-',
                flags: flags,
                photoUrl: tapIn?.photoUrl,
            };
        });

        summary.belumTapIn = users.length - summary.hadir;

        const filteredTableData = processedData.filter(row => {
            const brandMatch = brandFilter === 'all' || (Array.isArray(row.brandId) ? row.brandId.includes(brandFilter) : row.brandId === brandFilter);
            const statusMatch = statusFilter === 'all' ||
                (statusFilter === 'present' && (row.status === 'Sedang Bekerja' || row.status === 'Selesai')) ||
                (statusFilter === 'absent' && row.status === 'Belum Tap In') ||
                (statusFilter === 'late' && row.flags.includes('Terlambat')) ||
                (statusFilter === 'offsite' && row.flags.includes('Offsite'));
            return brandMatch && statusMatch;
        });

        return {
            tableData: filteredTableData,
            summaryData: [
                { title: "Hadir", value: summary.hadir },
                { title: "Belum Tap In", value: summary.belumTapIn },
                { title: "Offsite", value: summary.offsite },
                { title: "Anomali", value: summary.anomali },
                { title: "Terlambat", value: summary.terlambat },
            ]
        };
    }, [users, attendanceEvents, sites, brands, brandFilter, statusFilter, date]);

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
                                    <TableHead>Foto</TableHead>
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
                                        <TableCell className="font-medium">{row.name}</TableCell>
                                        <TableCell>{row.brandName}</TableCell>
                                        <TableCell>
                                            {row.photoUrl ? (
                                                <Link href={row.photoUrl} target="_blank">
                                                    <Avatar>
                                                        <AvatarImage src={row.photoUrl} alt={`Foto ${row.name}`} />
                                                        <AvatarFallback>{getInitials(row.name)}</AvatarFallback>
                                                    </Avatar>
                                                </Link>
                                            ) : (
                                                <Avatar>
                                                    <AvatarFallback>{getInitials(row.name)}</AvatarFallback>
                                                </Avatar>
                                            )}
                                        </TableCell>
                                        <TableCell>{row.tapIn}</TableCell>
                                        <TableCell>{row.tapOut}</TableCell>
                                        <TableCell>
                                            <Badge variant={row.status === 'Belum Tap In' ? 'secondary' : 'default'}>
                                                {row.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="capitalize">{row.mode}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                {row.flags.map((flag: string) => <Badge key={flag} variant={flag === 'Terlambat' ? 'destructive' : 'outline'}>{flag}</Badge>)}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={8} className="h-24 text-center">
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

