'use client';
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isSameDay, isToday, addMonths, subMonths } from 'date-fns';
import { id } from 'date-fns/locale';
import { FilePlus, Send, Edit, ChevronLeft, ChevronRight, Calendar as CalendarIcon, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

type ReportStatus = 'disetujui' | 'revisi' | 'terkirim' | 'draft';

const mockReports: Record<string, { status: ReportStatus; activity: string; learning: string; obstacle: string; mentorNote?: string }> = {
    '2024-07-15': { status: 'disetujui', activity: 'Rapat tim desain dan finalisasi mockup.', learning: 'Belajar tentang alur kerja tim dan pentingnya design system.', obstacle: 'Tidak ada kendala berarti.' },
    '2024-07-16': { status: 'revisi', activity: 'Membuat wireframe untuk fitur login.', learning: 'Menggunakan komponen-komponen di Figma.', obstacle: 'Performa laptop agak lambat saat file besar.', mentorNote: 'Tolong detailkan lagi bagian wireframe, komponen apa saja yang dibuat?' },
    '2024-07-17': { status: 'terkirim', activity: 'Riset UX kompetitor untuk fitur dashboard.', learning: 'Menganalisis kelebihan dan kekurangan UX dari 3 aplikasi kompetitor.', obstacle: 'Akses terbatas ke beberapa fitur premium kompetitor.' },
};

const statusConfig: Record<ReportStatus, { label: string; color: string; icon: React.ReactNode }> = {
    disetujui: { label: 'Disetujui', color: 'bg-green-500', icon: <CheckCircle className="h-4 w-4" /> },
    revisi: { label: 'Perlu Revisi', color: 'bg-yellow-500', icon: <AlertCircle className="h-4 w-4" /> },
    terkirim: { label: 'Terkirim', color: 'bg-blue-500', icon: <Clock className="h-4 w-4" /> },
    draft: { label: 'Draf', color: 'bg-gray-400', icon: <Edit className="h-4 w-4" /> },
};


export default function LaporanHarianPage() {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

    const firstDayOfMonth = startOfMonth(currentMonth);
    const days = eachDayOfInterval({
        start: startOfWeek(firstDayOfMonth, { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 }),
    });

    const selectedReport = useMemo(() => {
        if (!selectedDate) return null;
        const dateString = format(selectedDate, 'yyyy-MM-dd');
        return mockReports[dateString] ? { date: selectedDate, ...mockReports[dateString] } : null;
    }, [selectedDate]);

    const handleDateClick = (day: Date) => {
        setSelectedDate(day);
        setIsEditing(false); // Always show detail first when a date is clicked
        setIsDialogOpen(true);
    };
    
    const handleCloseDialog = () => {
        setIsDialogOpen(false);
        // Deselect date after a short delay to allow the dialog to fade out
        setTimeout(() => setSelectedDate(null), 300); 
    }

    const statusSummary = useMemo(() => {
        return Object.values(mockReports).reduce((acc, report) => {
            acc[report.status] = (acc[report.status] || 0) + 1;
            return acc;
        }, {} as Record<ReportStatus, number>);
    }, []);

    const renderDialogContent = () => {
        if (isEditing) {
            return (
                <>
                    <DialogHeader>
                        <DialogTitle>Laporan: {selectedDate && format(selectedDate, "eeee, dd MMMM", { locale: id })}</DialogTitle>
                        <DialogDescription>Isi semua field untuk melaporkan aktivitas harian Anda.</DialogDescription>
                    </DialogHeader>
                    <form id="report-form" className="space-y-6 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="activity">Uraian Aktivitas</Label>
                          <Textarea id="activity" defaultValue={selectedReport?.activity || ''} rows={5} placeholder="Jelaskan secara rinci pekerjaan dan tugas yang Anda lakukan hari ini..." />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="learning">Pembelajaran yang Diperoleh</Label>
                          <Textarea id="learning" defaultValue={selectedReport?.learning || ''} rows={3} placeholder="Hal atau pengetahuan baru apa yang Anda dapatkan?" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="obstacle">Kendala yang Dialami</Label>
                          <Textarea id="obstacle" defaultValue={selectedReport?.obstacle || ''} rows={3} placeholder="Apa saja kesulitan yang Anda hadapi dan bagaimana Anda mencoba menyelesaikannya?" />
                        </div>
                    </form>
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => setIsEditing(false)}>Batal</Button>
                        <Button type="submit" form="report-form" onClick={() => { /* save logic */ setIsEditing(false); }}><Send className="mr-2 h-4 w-4"/> Kirim Laporan</Button>
                    </DialogFooter>
                </>
            );
        }

        if (selectedReport) {
            return (
                <>
                    <DialogHeader>
                        <DialogTitle>Laporan: {format(selectedReport.date, "eeee, dd MMMM", { locale: id })}</DialogTitle>
                         <div className="pt-2">
                           <Badge variant="outline" className={cn("mt-2", statusConfig[selectedReport.status].color.replace('bg-', 'text-').replace('-500', '-700 dark:text-white border-current'))}>
                                {statusConfig[selectedReport.status].label}
                           </Badge>
                         </div>
                    </DialogHeader>
                    <div className="space-y-4 py-4 text-sm">
                         <Separator/>
                         <div className="space-y-1"><h4 className="font-semibold">Uraian Aktivitas</h4><p className="text-muted-foreground">{selectedReport.activity}</p></div>
                         <div className="space-y-1"><h4 className="font-semibold">Pembelajaran</h4><p className="text-muted-foreground">{selectedReport.learning}</p></div>
                         <div className="space-y-1"><h4 className="font-semibold">Kendala</h4><p className="text-muted-foreground">{selectedReport.obstacle}</p></div>
                         {selectedReport.mentorNote && (
                            <>
                            <Separator/>
                            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 rounded-r-md">
                                <h4 className="font-semibold text-yellow-800 dark:text-yellow-200">Catatan Revisi dari Mentor</h4>
                                <p className="text-yellow-700 dark:text-yellow-300 italic">"{selectedReport.mentorNote}"</p>
                            </div>
                            </>
                         )}
                    </div>
                     <DialogFooter>
                        <Button type="button" variant="outline" onClick={handleCloseDialog}>Tutup</Button>
                        <Button type="button" onClick={() => setIsEditing(true)}><Edit className="mr-2 h-4 w-4"/> Edit</Button>
                    </DialogFooter>
                </>
            );
        }

        return (
             <>
                <DialogHeader>
                    <DialogTitle>Laporan: {selectedDate && format(selectedDate, "eeee, dd MMMM", { locale: id })}</DialogTitle>
                </DialogHeader>
                <div className="h-48 flex flex-col items-center justify-center text-center p-6 bg-muted/50 rounded-md">
                    <CalendarIcon className="h-12 w-12 text-muted-foreground mb-4"/>
                    <h3 className="font-semibold text-lg">Belum ada laporan</h3>
                    <p className="text-muted-foreground text-sm">Tidak ada laporan yang dibuat pada tanggal ini.</p>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={handleCloseDialog}>Tutup</Button>
                    <Button type="button" onClick={() => setIsEditing(true)}><FilePlus className="mr-2 h-4 w-4" /> Buat Laporan</Button>
                </DialogFooter>
            </>
        );
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <CardTitle className="text-2xl">{format(currentMonth, 'MMMM yyyy', { locale: id })}</CardTitle>
                             <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                                {Object.entries(statusConfig).map(([status, config]) => (
                                    <div key={status} className="flex items-center gap-1.5">
                                        <span className={cn("h-2 w-2 rounded-full", config.color)} />
                                        <span>{statusSummary[status as ReportStatus] || 0} {config.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())}>Hari Ini</Button>
                            <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft className="h-4 w-4" /></Button>
                            <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight className="h-4 w-4" /></Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-7 text-center text-sm font-medium text-muted-foreground border-b">
                        {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map(day => <div key={day} className="py-2">{day}</div>)}
                    </div>
                    <div className="grid grid-cols-7">
                        {days.map(day => {
                            const dateString = format(day, 'yyyy-MM-dd');
                            const report = mockReports[dateString];
                            const isCurrentMonth = isSameMonth(day, currentMonth);
                            const isDateSelected = selectedDate && isSameDay(day, selectedDate);

                            return (
                                <button
                                    key={day.toString()}
                                    type="button"
                                    onClick={() => handleDateClick(day)}
                                    className={cn(
                                        "relative h-20 p-2 text-left align-top transition-colors rounded-lg",
                                        isCurrentMonth ? "hover:bg-accent" : "text-muted-foreground/50",
                                        isDateSelected && "bg-primary/10 ring-2 ring-primary"
                                    )}
                                >
                                    <span className={cn("font-medium", isToday(day) && "bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center")}>
                                        {format(day, 'd')}
                                    </span>
                                    {report && <span className={cn("absolute bottom-2 left-2 h-2 w-2 rounded-full", statusConfig[report.status].color)} />}
                                </button>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

             <Dialog open={isDialogOpen} onOpenChange={handleCloseDialog}>
                <DialogContent className="max-h-[90vh] flex flex-col">
                    <div className="flex-grow overflow-y-auto -mx-6 px-6">
                        {renderDialogContent()}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
