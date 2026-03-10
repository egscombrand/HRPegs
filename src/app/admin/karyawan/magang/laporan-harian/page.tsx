'use client';
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isSameDay, isToday, addMonths, subMonths, isFuture, isPast } from 'date-fns';
import { id } from 'date-fns/locale';
import { FilePlus, Send, Edit, ChevronLeft, ChevronRight, Calendar as CalendarIcon, CheckCircle, Clock, AlertCircle, Loader2 } from 'lucide-react';
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
import { useToast } from '@/hooks/use-toast';
import { Form } from '@/components/ui/form';
import { useAuth } from '@/providers/auth-provider';
import { useDoc, useCollection, useFirestore, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { doc, collection, query, where, Timestamp, serverTimestamp } from 'firebase/firestore';
import type { DailyReport, EmployeeProfile, ReportStatus } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';


const statusConfig: Record<ReportStatus, { label: string; color: string; icon: React.ReactNode }> = {
    approved: { label: 'Disetujui', color: 'bg-green-500', icon: <CheckCircle className="h-4 w-4" /> },
    needs_revision: { label: 'Perlu Revisi', color: 'bg-yellow-500', icon: <AlertCircle className="h-4 w-4" /> },
    submitted: { label: 'Terkirim', color: 'bg-blue-500', icon: <Clock className="h-4 w-4" /> },
    draft: { label: 'Draf', color: 'bg-gray-400', icon: <Edit className="h-4 w-4" /> },
};


export default function LaporanHarianPage() {
    const { firebaseUser } = useAuth();
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Fetch employee profile to get supervisor info, which is needed for saving the report
    const employeeProfileRef = useMemoFirebase(() => {
        if (!firebaseUser) return null;
        return doc(firestore, 'employee_profiles', firebaseUser.uid);
    }, [firestore, firebaseUser?.uid]);
    const { data: employeeProfile, isLoading: isLoadingProfile } = useDoc<EmployeeProfile>(employeeProfileRef);

    // Fetch reports for the current month
    const reportsQuery = useMemoFirebase(() => {
        if (!firebaseUser) return null;
        const start = startOfMonth(currentMonth);
        const end = endOfMonth(currentMonth);
        return query(
            collection(firestore, 'daily_reports'),
            where('uid', '==', firebaseUser.uid),
            where('date', '>=', start),
            where('date', '<=', end)
        );
    }, [firestore, firebaseUser, currentMonth]);
    const { data: fetchedReports, isLoading: isLoadingReports } = useCollection<DailyReport>(reportsQuery);

    // Create a map for quick lookups by date
    const reportsMap = useMemo(() => {
        if (!fetchedReports) return new Map<string, DailyReport>();
        return new Map(fetchedReports.map(report => [format(report.date.toDate(), 'yyyy-MM-dd'), report]));
    }, [fetchedReports]);
    
    const firstDayOfMonth = startOfMonth(currentMonth);
    const days = eachDayOfInterval({
        start: startOfWeek(firstDayOfMonth, { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 }),
    });

    const selectedReport = useMemo(() => {
        if (!selectedDate) return null;
        const dateString = format(selectedDate, 'yyyy-MM-dd');
        return reportsMap.get(dateString) || null;
    }, [selectedDate, reportsMap]);

    const handleDateClick = (day: Date) => {
        setSelectedDate(day);
        setIsEditing(false);
        setIsDialogOpen(true);
    };
    
    const handleCloseDialog = () => {
        setIsDialogOpen(false);
        setTimeout(() => setSelectedDate(null), 300); 
    }

    const handleSaveReport = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!selectedDate || !firebaseUser || !employeeProfile) {
            toast({ title: "Gagal Menyimpan", description: "Data pengguna atau profil tidak ditemukan.", variant: "destructive" });
            return;
        }
        setIsSaving(true);

        const formData = new FormData(e.currentTarget);
        const dateString = format(selectedDate, 'yyyy-MM-dd');
        const docId = `${firebaseUser.uid}_${dateString}`;
        const reportRef = doc(firestore, 'daily_reports', docId);

        const isUpdate = reportsMap.has(dateString);

        const newReportData: Partial<DailyReport> = {
            uid: firebaseUser.uid,
            date: Timestamp.fromDate(selectedDate),
            status: 'submitted',
            activity: formData.get('activity') as string,
            learning: formData.get('learning') as string,
            obstacle: formData.get('obstacle') as string,
            updatedAt: serverTimestamp() as Timestamp,
        };
        
        if (!isUpdate) {
            newReportData.createdAt = serverTimestamp() as Timestamp;
            newReportData.supervisorUid = employeeProfile.supervisorUid || null;
            newReportData.brandId = Array.isArray(employeeProfile.brandId) ? employeeProfile.brandId[0] : employeeProfile.brandId || null;
        }

        try {
            await setDocumentNonBlocking(reportRef, newReportData, { merge: true });
            toast({
                title: "Laporan Terkirim",
                description: `Laporan Anda untuk tanggal ${format(selectedDate, "dd MMM yyyy")} telah disimpan.`,
            });
            setIsEditing(false); // Go back to detail view
        } catch (error: any) {
            toast({ title: "Gagal Menyimpan", description: error.message, variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    const statusSummary = useMemo(() => {
        if (!fetchedReports) return {} as Record<ReportStatus, number>;
        return fetchedReports.reduce((acc, report) => {
            acc[report.status] = (acc[report.status] || 0) + 1;
            return acc;
        }, {} as Record<ReportStatus, number>);
    }, [fetchedReports]);

    const renderDialogContent = () => {
        const isDateToday = selectedDate && isToday(selectedDate);
        const isDateInPast = selectedDate && !isToday(selectedDate) && isPast(selectedDate);
        const isDateInFuture = selectedDate && isFuture(selectedDate);

        const handleEditClick = (e: React.MouseEvent<HTMLButtonElement>) => {
            e.preventDefault();
            setIsEditing(true);
        }

        if (isEditing) {
            return (
                <>
                    <DialogHeader>
                        <DialogTitle>Laporan: {selectedDate && format(selectedDate, "eeee, dd MMMM", { locale: id })}</DialogTitle>
                        <DialogDescription>Isi semua field untuk melaporkan aktivitas harian Anda.</DialogDescription>
                    </DialogHeader>
                     <form id="report-form" className="space-y-6 py-4" onSubmit={handleSaveReport}>
                        <div className="space-y-2">
                          <Label htmlFor="activity">Uraian Aktivitas</Label>
                          <Textarea id="activity" name="activity" defaultValue={selectedReport?.activity || ''} rows={5} placeholder="Jelaskan secara rinci pekerjaan dan tugas yang Anda lakukan hari ini..." />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="learning">Pembelajaran yang Diperoleh</Label>
                          <Textarea id="learning" name="learning" defaultValue={selectedReport?.learning || ''} rows={3} placeholder="Hal atau pengetahuan baru apa yang Anda dapatkan?" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="obstacle">Kendala yang Dialami</Label>
                          <Textarea id="obstacle" name="obstacle" defaultValue={selectedReport?.obstacle || ''} rows={3} placeholder="Apa saja kesulitan yang Anda hadapi dan bagaimana Anda mencoba menyelesaikannya?" />
                        </div>
                    </form>
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => setIsEditing(false)}>Batal</Button>
                        <Button type="submit" form="report-form" disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                            <Send className="mr-2 h-4 w-4"/> Kirim Laporan
                        </Button>
                    </DialogFooter>
                </>
            );
        }

        if (selectedReport) {
            return (
                <>
                    <DialogHeader>
                        <DialogTitle>Laporan: {format(selectedReport.date.toDate(), "eeee, dd MMMM", { locale: id })}</DialogTitle>
                         <div className="pt-2">
                           <Badge variant="outline" className={cn("mt-2", statusConfig[selectedReport.status]?.color?.replace('bg-', 'text-').replace('-500', '-700 dark:text-white border-current'))}>
                                {statusConfig[selectedReport.status]?.label}
                           </Badge>
                         </div>
                    </DialogHeader>
                    <div className="space-y-4 py-4 text-sm">
                         <Separator/>
                         <div className="space-y-1"><h4 className="font-semibold">Uraian Aktivitas</h4><p className="text-muted-foreground whitespace-pre-wrap">{selectedReport.activity}</p></div>
                         <div className="space-y-1"><h4 className="font-semibold">Pembelajaran</h4><p className="text-muted-foreground whitespace-pre-wrap">{selectedReport.learning}</p></div>
                         <div className="space-y-1"><h4 className="font-semibold">Kendala</h4><p className="text-muted-foreground whitespace-pre-wrap">{selectedReport.obstacle}</p></div>
                         {selectedReport.reviewerNotes && (
                            <>
                            <Separator/>
                            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 rounded-r-md">
                                <h4 className="font-semibold text-yellow-800 dark:text-yellow-200">Catatan Revisi dari Mentor</h4>
                                <p className="text-yellow-700 dark:text-yellow-300 italic">"{selectedReport.reviewerNotes}"</p>
                            </div>
                            </>
                         )}
                    </div>
                     <DialogFooter className="flex-col sm:flex-row sm:justify-between items-stretch sm:items-center">
                        {isDateInPast && <p className="text-xs text-muted-foreground text-left mr-auto">Laporan untuk tanggal yang lewat tidak dapat diubah.</p>}
                        <div className='flex gap-2 self-end'>
                            <Button type="button" variant="outline" onClick={handleCloseDialog}>Tutup</Button>
                            {isDateToday && (
                                <Button type="button" onClick={handleEditClick}><Edit className="mr-2 h-4 w-4"/> Edit</Button>
                            )}
                        </div>
                    </DialogFooter>
                </>
            );
        }
        
        let emptyStateTitle = "Belum ada laporan";
        let emptyStateDescription = "Tidak ada laporan yang dibuat pada tanggal ini.";
        if (isDateInPast) {
            emptyStateTitle = "Periode Terlewat";
            emptyStateDescription = "Periode input untuk tanggal ini telah lewat.";
        } else if (isDateInFuture) {
            emptyStateTitle = "Tanggal Akan Datang";
            emptyStateDescription = "Laporan hanya dapat dibuat pada hari berjalan.";
        }


        return (
             <>
                <DialogHeader>
                    <DialogTitle>{selectedDate ? format(selectedDate, "eeee, dd MMMM", { locale: id }) : 'Pilih Tanggal'}</DialogTitle>
                </DialogHeader>
                <div className="h-48 flex flex-col items-center justify-center text-center p-6 bg-muted/50 rounded-md">
                    <CalendarIcon className="h-12 w-12 text-muted-foreground mb-4"/>
                    <h3 className="font-semibold text-lg">{emptyStateTitle}</h3>
                    <p className="text-muted-foreground text-sm">{emptyStateDescription}</p>
                </div>
                <DialogFooter className="flex-col sm:flex-row sm:justify-between items-stretch sm:items-center">
                     {(isDateInPast || isDateInFuture) && <p className="text-xs text-muted-foreground text-left mr-auto">Info</p>}
                     <div className="flex gap-2 self-end">
                        <Button type="button" variant="outline" onClick={handleCloseDialog}>Tutup</Button>
                        {isDateToday && (
                            <Button type="button" onClick={(e) => { e.preventDefault(); setIsEditing(true); }}><FilePlus className="mr-2 h-4 w-4" /> Buat Laporan</Button>
                        )}
                    </div>
                </DialogFooter>
            </>
        );
    };

    if (isLoadingReports || isLoadingProfile) {
      return (
        <Card>
          <CardHeader><Skeleton className="h-8 w-48" /></CardHeader>
          <CardContent><Skeleton className="h-80 w-full" /></CardContent>
        </Card>
      );
    }

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <CardTitle className="text-2xl">{format(currentMonth, 'MMMM yyyy', { locale: id })}</CardTitle>
                             <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mt-2">
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
                            const report = reportsMap.get(dateString);
                            const isCurrentMonthDay = isSameMonth(day, currentMonth);
                            const isDateSelected = selectedDate && isSameDay(day, selectedDate);
                            const isFutureDate = isFuture(day) && !isToday(day);
                            const isPastDate = !isToday(day) && isPast(day);

                            return (
                                <button
                                    key={day.toString()}
                                    type="button"
                                    onClick={() => !isFutureDate && handleDateClick(day)}
                                    disabled={isFutureDate}
                                    className={cn(
                                        "relative h-20 p-2 text-left align-top transition-colors rounded-lg",
                                        isCurrentMonthDay ? "hover:bg-accent" : "text-muted-foreground/50 hover:bg-accent/50",
                                        isPastDate && "opacity-75",
                                        !isCurrentMonthDay && isPastDate && "opacity-50",
                                        isDateSelected && "bg-primary/10 ring-2 ring-primary",
                                        isFutureDate && "text-muted-foreground/30 cursor-not-allowed hover:bg-transparent"
                                    )}
                                >
                                    <span className={cn("font-medium", isToday(day) && "bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center ring-2 ring-offset-2 ring-primary")}>
                                        {format(day, 'd')}
                                    </span>
                                    {report && <span className={cn("absolute bottom-2 left-2 h-2 w-2 rounded-full", statusConfig[report.status]?.color)} />}
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
