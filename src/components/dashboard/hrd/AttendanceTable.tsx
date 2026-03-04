'use client';

import { useState } from 'react';
import type { AttendanceRecord } from './HrdDashboardTypes';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import Link from 'next/link';
import { XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, deleteDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import { DeleteConfirmationDialog } from '../DeleteConfirmationDialog';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface AttendanceTableProps {
  records: AttendanceRecord[];
}

export function AttendanceTable({ records }: AttendanceTableProps) {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [eventsToDelete, setEventsToDelete] = useState<{ tapInId: string | null, tapOutId: string | null, userName: string | null }>({ tapInId: null, tapOutId: null, userName: null });

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
      // The parent component should handle data mutation/refetching.
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
    <>
      <Card>
        <CardHeader>
          <CardTitle>Laporan Kehadiran Hari Ini</CardTitle>
        </CardHeader>
        <CardContent>
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
                    <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.length > 0 ? records.map(row => (
                    <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell>{row.brandName}</TableCell>
                        <TableCell>{row.tapIn}</TableCell>
                        <TableCell>{row.tapOut}</TableCell>
                        <TableCell>
                            <Badge variant={row.status.startsWith('Belum') ? 'secondary' : 'default'}>
                                {row.status}
                            </Badge>
                        </TableCell>
                        <TableCell className="capitalize">{row.mode}</TableCell>
                        <TableCell>
                            <div className="flex flex-wrap gap-1">
                                {row.flags.map(flag => {
                                    if (flag === 'late') return <Badge key="late" variant="destructive">Terlambat ({row.lateMinutes} mnt)</Badge>;
                                    if (flag === 'early') return <Badge key="early" variant="destructive">Pulang Awal</Badge>;
                                    if (flag === 'no_tap_out') return <Badge key="no_tap_out" variant="destructive">Tanpa Tap Out</Badge>;
                                    return null;
                                })}
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
                        <TableCell colSpan={8} className="h-24 text-center">
                            Data absensi untuk filter yang dipilih belum tersedia.
                        </TableCell>
                    </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <DeleteConfirmationDialog 
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        onConfirm={confirmCancelAttendance}
        itemName={`catatan absensi untuk ${eventsToDelete.userName}`}
        itemType=""
      />
    </>
  );
}