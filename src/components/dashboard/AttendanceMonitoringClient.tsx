'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, where, doc, type Timestamp } from 'firebase/firestore';
import type { Brand, UserProfile, AttendanceEvent } from '@/lib/types';
import { ROLES_INTERNAL } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GoogleDatePicker } from '@/components/ui/google-date-picker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '../ui/skeleton';
import { KpiCard } from '@/components/recruitment/KpiCard';
import { format, startOfDay, endOfDay, differenceInMinutes } from 'date-fns';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { getInitials } from '@/lib/utils';
import Link from 'next/link';
import { XCircle } from 'lucide-react';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

interface AttendanceRecord {
  id: string; // userId
  name: string;
  brandName: string;
  brandId?: string | string[];
  tapIn: string;
  tapOut: string;
  tapInId: string | null;
  tapOutId: string | null;
  status: 'Sedang Bekerja' | 'Selesai' | 'Belum Tap In';
  mode: 'onsite' | 'offsite' | '-';
  photoUrl?: string | null;
  address: string;
  location: { lat: number; lng: number } | null;
  lateMinutes: number | null;
  earlyLeaveMinutes: number | null;
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
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [eventsToDelete, setEventsToDelete] = useState<{ tapInId: string | null, tapOutId: string | null, userName: string | null }>({ tapInId: null, tapOutId: null, userName: null });
    const firestore = useFirestore();
    const { toast } = useToast();

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
    const { data: attendanceEvents, isLoading: isLoadingEvents, mutate: mutateEvents } = useCollection<AttendanceEvent>(eventsQuery);

    const isLoading = isLoadingConfig || isLoadingUsers || isLoadingBrands || isLoadingEvents;
    
    // --- Data Processing ---
    const { tableData, summaryData } = useMemo(() => {
        if (!users || !attendanceEvents || !sites || !brands) {
            const defaultSummary = kpiCardsData.map(c => ({ title: c.title, value: 0 }));
            return { tableData: [], summaryData: defaultSummary };
        }
        
        const getTimestamp = (event: any): Timestamp | undefined => event.tsServer || event.timestamp || event.ts || event.createdAt;
        const brandMap = new Map(brands.map(b => [b.id, b.name]));
        const activeSite = sites.find(s => s.isActive);
        
        // 1. Filter users by brand first
        const relevantUsers = brandFilter === 'all'
            ? users
            : users.filter(user => {
                if (!user.brandId) return false;
                if (Array.isArray(user.brandId)) return user.brandId.includes(brandFilter);
                return user.brandId === brandFilter;
            });

        const summary = { hadir: 0, offsite: 0, anomali: 0, terlambat: 0 };
        
        const processedData = relevantUsers.map(user => {
            const userEvents = attendanceEvents.filter(e => (e.uid === user.uid || e.userId === user.uid));
            const tapIn = userEvents.find(e => e.type === 'tap_in' || e.type === 'IN');
            const tapOut = userEvents.find(e => e.type === 'tap_out' || e.type === 'OUT');
            
            const tapInTimestamp = tapIn ? getTimestamp(tapIn) : null;
            const tapOutTimestamp = tapOut ? getTimestamp(tapOut) : null;

            let status: AttendanceRecord['status'] = 'Belum Tap In';
            if (tapIn && !tapOut) status = 'Sedang Bekerja';
            else if (tapIn && tapOut) status = 'Selesai';
            
            let lateMinutes: number | null = null;
            let earlyLeaveMinutes: number | null = null;

            if (tapIn && tapInTimestamp) {
                summary.hadir++;
                const modeString = (tapIn.mode as string)?.toLowerCase();
                if (modeString === 'offsite') {
                    summary.offsite++;
                }

                if (activeSite) {
                    const tapInTime = tapInTimestamp.toDate();
                    const shiftStart = new Date(tapInTime);
                    const [startHour, startMinute] = activeSite.shift.startTime.split(':').map(Number);
                    shiftStart.setHours(startHour, startMinute + activeSite.shift.graceLateMinutes, 0, 0);

                    if (tapInTime > shiftStart) {
                        lateMinutes = differenceInMinutes(tapInTime, shiftStart);
                        summary.terlambat++;
                    }
                }
            }

            if (tapOut && tapOutTimestamp && activeSite) {
                const tapOutTime = tapOutTimestamp.toDate();
                const shiftEnd = new Date(tapOutTime);
                const [endHour, endMinute] = activeSite.shift.endTime.split(':').map(Number);
                shiftEnd.setHours(endHour, endMinute, 0, 0);
                if (tapOutTime < shiftEnd) {
                    earlyLeaveMinutes = differenceInMinutes(shiftEnd, tapOutTime);
                }
            }

            return {
                id: user.uid,
                name: user.fullName,
                brandId: user.brandId,
                brandName: Array.isArray(user.brandId) ? user.brandId.map(id => brandMap.get(id)).join(', ') : brandMap.get(user.brandId as string) || '-',
                tapIn: tapInTimestamp ? format(tapInTimestamp.toDate(), 'HH:mm') : '-',
                tapOut: tapOutTimestamp ? format(tapOutTimestamp.toDate(), 'HH:mm') : '-',
                tapInId: tapIn?.id || null,
                tapOutId: tapOut?.id || null,
                status: status,
                mode: (tapIn?.mode as string)?.toLowerCase() || '-',
                photoUrl: tapIn?.photoUrl,
                address: tapIn?.address || '-',
                location: tapIn?.location || null,
                lateMinutes,
                earlyLeaveMinutes,
            };
        });
        
        summary.belumTapIn = relevantUsers.length - summary.hadir;

        const filteredTableData = processedData.filter(row => {
            const statusMatch = statusFilter === 'all' ||
                (statusFilter === 'present' && (row.status === 'Sedang Bekerja' || row.status === 'Selesai')) ||
                (statusFilter === 'absent' && row.status === 'Belum Tap In') ||
                (statusFilter === 'late' && row.lateMinutes !== null) ||
                (statusFilter === 'offsite' && row.mode === 'offsite');
            return statusMatch;
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
    
    const handleCancelClick = (row: AttendanceRecord) => {
        setEventsToDelete({ tapInId: row.tapInId, tapOutId: row.tapOutId, userName: row.name });
        setIsDeleteConfirmOpen(true);
    };

    const confirmCancelAttendance = async () => {
        const { tapInId, tapOutId } = eventsToDelete;
        if (!tapInId && !tapOutId) return;

        try {
            const promises: Promise<any>[] = [];
            if (tapInId) {
                promises.push(deleteDocumentNonBlocking(doc(firestore, 'attendance_events', tapInId)));
            }
            if (tapOutId) {
                promises.push(deleteDocumentNonBlocking(doc(firestore, 'attendance_events', tapOutId)));
            }

            await Promise.all(promises);

            toast({
                title: 'Absensi Dibatalkan',
                description: `Catatan absensi untuk ${eventsToDelete.userName} telah dihapus.`,
            });
            mutateEvents(); // Re-fetch the events
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Gagal Membatalkan',
                description: error.message || 'Terjadi kesalahan pada server.',
            });
        } finally {
            setIsDeleteConfirmOpen(false);
        }
    };


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
                                    <TableHead>Lokasi</TableHead>
                                    <TableHead>Tap In</TableHead>
                                    <TableHead>Tap Out</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Mode</TableHead>
                                    <TableHead>Flags</TableHead>
                                    <TableHead className="text-right">Aksi</TableHead>
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
                                        <TableCell className="text-xs max-w-xs truncate" title={row.address}>
                                          {row.location ? (
                                                <a href={`https://maps.google.com/?q=${row.location.lat},${row.location.lng}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                                    {row.address}
                                                </a>
                                            ) : row.address}
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
                                                {row.lateMinutes !== null && <Badge variant="destructive">Terlambat ({row.lateMinutes} mnt)</Badge>}
                                                {row.earlyLeaveMinutes !== null && <Badge variant="destructive">Pulang Awal</Badge>}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => handleCancelClick(row)} disabled={!row.tapInId && !row.tapOutId} title="Batalkan Absensi">
                                                <XCircle className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={10} className="h-24 text-center">
                                            Data absensi untuk filter yang dipilih belum tersedia.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </>
            )}
             <DeleteConfirmationDialog 
                open={isDeleteConfirmOpen}
                onOpenChange={setIsDeleteConfirmOpen}
                onConfirm={confirmCancelAttendance}
                itemName={`catatan absensi untuk ${eventsToDelete.userName}`}
                itemType=""
            />
        </div>
    );
}
