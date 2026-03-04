'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { AlertTriangle, Clock, LogOut, Coffee } from 'lucide-react';
import type { AttendanceRecord } from './HrdDashboardTypes';

const ActionItem = ({ record, message }: { record: AttendanceRecord, message: string }) => (
    <div className="flex items-center gap-3 py-2 px-3 hover:bg-muted rounded-md">
        <Avatar className="h-8 w-8"><AvatarFallback>{getInitials(record.name)}</AvatarFallback></Avatar>
        <div className="text-sm">
            <p className="font-semibold">{record.name}</p>
            <p className="text-xs text-muted-foreground">{message}</p>
        </div>
    </div>
);

export function NeedsActionPanel({ records }: { records: AttendanceRecord[] }) {
    const belumTapIn = records.filter(r => r.status === 'Belum Tap In' && new Date().getHours() >= 9); // Assuming 9 AM is start
    const terlambat = records.filter(r => r.lateMinutes !== null && r.lateMinutes > 0).sort((a,b) => b.lateMinutes! - a.lateMinutes!).slice(0, 5);
    const belumTapOut = records.filter(r => r.status === 'Belum Tap Out');

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><AlertTriangle className="text-destructive h-5 w-5" />Butuh Tindakan HRD</CardTitle>
                <CardDescription>Ringkasan karyawan yang membutuhkan perhatian Anda hari ini.</CardDescription>
            </CardHeader>
            <CardContent>
                <Accordion type="multiple" className="w-full" defaultValue={['item-1', 'item-2', 'item-3']}>
                    <AccordionItem value="item-1">
                        <AccordionTrigger>Belum Tap In ({belumTapIn.length})</AccordionTrigger>
                        <AccordionContent>
                           {belumTapIn.length > 0 ? (
                             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                               {belumTapIn.map(r => <ActionItem key={r.id} record={r} message={`Belum check-in hingga sekarang.`} />)}
                             </div>
                           ) : <p className="text-sm text-muted-foreground p-4 text-center">Semua karyawan sudah tap in.</p>}
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="item-2">
                        <AccordionTrigger>Top 5 Terlambat ({terlambat.length})</AccordionTrigger>
                        <AccordionContent>
                            {terlambat.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {terlambat.map(r => <ActionItem key={r.id} record={r} message={`Terlambat ${r.lateMinutes} menit.`} />)}
                                </div>
                            ) : <p className="text-sm text-muted-foreground p-4 text-center">Tidak ada karyawan yang terlambat hari ini.</p>}
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="item-3">
                        <AccordionTrigger>Belum Tap Out ({belumTapOut.length})</AccordionTrigger>
                        <AccordionContent>
                             {belumTapOut.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {belumTapOut.map(r => <ActionItem key={r.id} record={r} message={`Melebihi jam kerja.`} />)}
                                </div>
                            ) : <p className="text-sm text-muted-foreground p-4 text-center">Tidak ada karyawan yang melebihi jam kerja.</p>}
                        </AccordionContent>
                    </AccordionItem>
                     <AccordionItem value="item-4">
                        <AccordionTrigger>Antrian Persetujuan (0)</AccordionTrigger>
                        <AccordionContent>
                           <p className="text-sm text-muted-foreground p-4 text-center">Modul Izin/Cuti/Lembur belum aktif.</p>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </CardContent>
        </Card>
    );
}
