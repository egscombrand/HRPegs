'use client';
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { FilePlus, Send, Edit } from 'lucide-react';

// Mock data
const mockReports = {
    '2024-07-15': { status: 'disetujui', activity: 'Rapat tim desain.', learning: 'Belajar tentang design system.', obstacle: 'Tidak ada.', plan: 'Finalisasi mockup.' },
    '2024-07-16': { status: 'revisi', activity: 'Membuat wireframe.', learning: 'Menggunakan Figma.', obstacle: 'Laptop lambat.', plan: 'Install ulang OS.', mentorNote: 'Tolong detailkan lagi bagian wireframe, komponen apa saja yang dibuat?' },
    '2024-07-17': { status: 'terkirim', activity: 'Riset kompetitor.', learning: 'Analisis UX kompetitor.', obstacle: 'Akses terbatas.', plan: 'Minta akses.' },
};

export default function LaporanHarianPage() {
    const [date, setDate] = useState<Date | undefined>(new Date());
    const [selectedReport, setSelectedReport] = useState<any>(null);
    const [isEditing, setIsEditing] = useState(false);

    const handleDateSelect = (selectedDate: Date | undefined) => {
        setDate(selectedDate);
        if (selectedDate) {
            const dateString = format(selectedDate, 'yyyy-MM-dd');
            // @ts-ignore
            const report = mockReports[dateString];
            setSelectedReport(report ? { date: selectedDate, ...report } : { date: selectedDate });
            setIsEditing(!report);
        } else {
            setSelectedReport(null);
            setIsEditing(false);
        }
    };
    
    return (
        <div className="grid md:grid-cols-3 gap-6 items-start">
            <div className="md:col-span-1 space-y-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Pilih Tanggal Laporan</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                         <Calendar
                            mode="single"
                            selected={date}
                            onSelect={handleDateSelect}
                            className="rounded-md"
                            locale={id}
                            modifiers={{
                                // @ts-ignore
                                submitted: Object.keys(mockReports).filter(d => mockReports[d].status === 'terkirim').map(d => new Date(d)),
                                // @ts-ignore
                                approved: Object.keys(mockReports).filter(d => mockReports[d].status === 'disetujui').map(d => new Date(d)),
                                // @ts-ignore
                                revision: Object.keys(mockReports).filter(d => mockReports[d].status === 'revisi').map(d => new Date(d)),
                            }}
                            modifiersClassNames={{
                                submitted: 'bg-blue-100 dark:bg-blue-900',
                                approved: 'bg-green-100 dark:bg-green-900',
                                revision: 'bg-yellow-100 dark:bg-yellow-900',
                            }}
                        />
                    </CardContent>
                </Card>
                <div className="text-xs text-muted-foreground p-2 space-y-1">
                    <p className="flex items-center"><span className="inline-block w-3 h-3 rounded-full bg-blue-100 dark:bg-blue-900 mr-2"></span>Terkirim</p>
                    <p className="flex items-center"><span className="inline-block w-3 h-3 rounded-full bg-green-100 dark:bg-green-900 mr-2"></span>Disetujui</p>
                    <p className="flex items-center"><span className="inline-block w-3 h-3 rounded-full bg-yellow-100 dark:bg-yellow-900 mr-2"></span>Revisi</p>
                </div>
            </div>
            <div className="md:col-span-2">
                {!selectedReport ? (
                    <Card className="h-96 flex flex-col items-center justify-center text-center p-6">
                        <FilePlus className="h-12 w-12 text-muted-foreground mb-4"/>
                        <h3 className="font-semibold text-lg">Laporan Harian</h3>
                        <p className="text-muted-foreground text-sm">Pilih tanggal pada kalender untuk melihat atau membuat laporan baru.</p>
                    </Card>
                ) : isEditing ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>Laporan Harian: {format(selectedReport.date, "eeee, dd MMMM yyyy", { locale: id })}</CardTitle>
                             <CardDescription>Isi semua field untuk melaporkan aktivitas harianmu.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                             <div className="space-y-2">
                                <Label>Uraian Aktivitas</Label>
                                <Textarea defaultValue={selectedReport.activity || ''} rows={5} />
                             </div>
                             <div className="space-y-2">
                                <Label>Pembelajaran yang Diperoleh</Label>
                                <Textarea defaultValue={selectedReport.learning || ''} rows={3} />
                             </div>
                             <div className="space-y-2">
                                <Label>Kendala yang Dialami</Label>
                                <Textarea defaultValue={selectedReport.obstacle || ''} rows={3} />
                             </div>
                              <div className="space-y-2">
                                <Label>Rencana Tindak Lanjut</Label>
                                <Textarea defaultValue={selectedReport.plan || ''} rows={3} />
                             </div>
                             <div className="flex justify-between pt-4">
                                <Button variant="ghost" onClick={() => handleDateSelect(selectedReport.date)}>Batal</Button>
                                <Button><Send className="mr-2 h-4 w-4"/> Kirim Laporan</Button>
                             </div>
                        </CardContent>
                    </Card>
                ) : (
                    <Card>
                         <CardHeader>
                            <div className="flex justify-between items-start">
                                <div>
                                    <CardTitle>Detail Laporan: {format(selectedReport.date, "eeee, dd MMMM yyyy", { locale: id })}</CardTitle>
                                    <CardDescription className="capitalize">Status: {selectedReport.status}</CardDescription>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}><Edit className="mr-2 h-4 w-4"/> Edit</Button>
                                </div>
                            </div>
                        </CardHeader>
                         <CardContent className="space-y-4 text-sm">
                             <div className="space-y-1">
                                <h4 className="font-semibold">Uraian Aktivitas</h4>
                                <p className="text-muted-foreground">{selectedReport.activity}</p>
                             </div>
                              <div className="space-y-1">
                                <h4 className="font-semibold">Pembelajaran yang Diperoleh</h4>
                                <p className="text-muted-foreground">{selectedReport.learning}</p>
                             </div>
                              <div className="space-y-1">
                                <h4 className="font-semibold">Kendala yang Dialami</h4>
                                <p className="text-muted-foreground">{selectedReport.obstacle}</p>
                             </div>
                             <div className="space-y-1">
                                <h4 className="font-semibold">Rencana Tindak Lanjut</h4>
                                <p className="text-muted-foreground">{selectedReport.plan}</p>
                             </div>
                             {selectedReport.mentorNote && (
                                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400">
                                    <h4 className="font-semibold text-yellow-800 dark:text-yellow-200">Catatan Mentor</h4>
                                    <p className="text-yellow-700 dark:text-yellow-300 italic">"{selectedReport.mentorNote}"</p>
                                </div>
                             )}
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
