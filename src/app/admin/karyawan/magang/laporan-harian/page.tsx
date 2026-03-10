'use client';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isSameDay, isToday, addMonths, subMonths, isFuture, isPast } from 'date-fns';
import { id } from 'date-fns/locale';
import { FilePlus, Send, ChevronLeft, ChevronRight, Calendar as CalendarIcon, CheckCircle, Clock, AlertCircle, Loader2 } from 'lucide-react';
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
import { useAuth } from '@/providers/auth-provider';
import { useDoc, useCollection, useFirestore, useMemoFirebase, setDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { doc, collection, query, where, Timestamp, serverTimestamp } from 'firebase/firestore';
import type { DailyReport, EmployeeProfile, ReportStatus } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';


const statusConfig: Record<ReportStatus, { label: string; color: string; icon: React.ReactNode }> = {
    approved: { label: 'Disetujui', color: 'bg-green-500', icon: <CheckCircle className="h-4 w-4" /> },
    needs_revision: { label: 'Perlu Revisi', color: 'bg-yellow-500', icon: <AlertCircle className="h-4 w-4" /> },
    submitted: { label: 'Menunggu Review', color: 'bg-blue-500', icon: <Clock className="h-4 w-4" /> },
    draft: { label: 'Draf', color: 'bg-gray-400', icon: <FilePlus className="h-4 w-4" /> },
};

const reportSchema = z.object({
  activity: z.string().min(10, { message: 'Uraian aktivitas harus diisi, minimal 10 karakter.' }),
  learning: z.string().min(10, { message: 'Pembelajaran harus diisi, minimal 10 karakter.' }),
  obstacle: z.string().min(10, { message: 'Kendala harus diisi, minimal 10 karakter.' }),
  declaration: z.literal(true, {
    errorMap: () => ({ message: "Anda harus menyetujui pernyataan ini." }),
  }),
});

type ReportFormValues = z.infer<typeof reportSchema>;


export default function LaporanHarianPage() {
    const { firebaseUser } = useAuth();
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    
    const form = useForm<ReportFormValues>({
        resolver: zodResolver(reportSchema),
        defaultValues: {
            activity: '',
            learning: '',
            obstacle: '',
            declaration: false,
        }
    });

    const employeeProfileRef = useMemoFirebase(() => {
        if (!firebaseUser) return null;
        return doc(firestore, 'employee_profiles', firebaseUser.uid);
    }, [firestore, firebaseUser?.uid]);
    const { data: employeeProfile, isLoading: isLoadingProfile } = useDoc<EmployeeProfile>(employeeProfileRef);

    const reportsQuery = useMemoFirebase(() => {
        if (!firebaseUser) return null;
        return query(collection(firestore, 'daily_reports'), where('uid', '==', firebaseUser.uid));
    }, [firestore, firebaseUser?.uid]);
    const { data: allFetchedReports, isLoading: isLoadingReports, mutate: mutateReports } = useCollection<DailyReport>(reportsQuery);

    const fetchedReports = useMemo(() => {
        if (!allFetchedReports) return null;
        const start = startOfMonth(currentMonth);
        const end = endOfMonth(currentMonth);
        return allFetchedReports.filter(report => {
            const reportDate = report.date.toDate();
            return reportDate >= start && reportDate <= end;
        });
    }, [allFetchedReports, currentMonth]);

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
        const report = reportsMap.get(format(day, 'yyyy-MM-dd'));
        
        form.reset({
            activity: report?.activity || '',
            learning: report?.learning || '',
            obstacle: report?.obstacle || '',
            declaration: false,
        });

        if (report && (report.status === 'needs_revision') && isToday(day)) {
            setIsEditing(true);
        } else {
            setIsEditing(false);
        }
        setIsDialogOpen(true);
    };
    
    const handleCloseDialog = () => {
        setIsDialogOpen(false);
        // Delay resetting selected date to allow for fade-out animation
        setTimeout(() => {
            setSelectedDate(null);
            form.reset();
        }, 300);
    }

    const prepareSubmit = (values: ReportFormValues) => {
        setIsConfirmOpen(true);
    };

    const handleConfirmSave = async () => {
        if (!selectedDate || !firebaseUser || !employeeProfile) {
            toast({ title: "Gagal Menyimpan", description: "Data tidak lengkap untuk menyimpan laporan.", variant: "destructive" });
            setIsConfirmOpen(false);
            return;
        }
        setIsSaving(true);
    
        const values = form.getValues();
        const dateString = format(selectedDate, 'yyyy-MM-dd');
        const docId = `${firebaseUser.uid}_${dateString}`;
        const reportRef = doc(firestore, 'daily_reports', docId);
    
        const isUpdate = reportsMap.has(dateString);
    
        try {
            if (isUpdate) {
                const updateData: Partial<DailyReport> = {
                    status: 'submitted' as ReportStatus,
                    activity: values.activity,
                    learning: values.learning,
                    obstacle: values.obstacle,
                    updatedAt: serverTimestamp() as Timestamp,
                    brandId: (Array.isArray(employeeProfile.brandId) ? employeeProfile.brandId[0] : employeeProfile.brandId) || null,
                    supervisorUid: employeeProfile.supervisorUid || null,
                };
                await updateDocumentNonBlocking(reportRef, updateData);
            } else {
                const createData: Omit<DailyReport, 'id'> = {
                    uid: firebaseUser.uid,
                    date: Timestamp.fromDate(selectedDate),
                    status: 'submitted',
                    activity: values.activity,
                    learning: values.learning,
                    obstacle: values.obstacle,
                    createdAt: serverTimestamp() as Timestamp,
                    updatedAt: serverTimestamp() as Timestamp,
                    brandId: (Array.isArray(employeeProfile.brandId) ? employeeProfile.brandId[0] : employeeProfile.brandId) || null,
                    supervisorUid: employeeProfile.supervisorUid || null,
                };
                await setDocumentNonBlocking(reportRef, createData, {});
            }

            toast({
                title: "Laporan Terkirim",
                description: `Laporan Anda untuk tanggal ${format(selectedDate, "dd MMM yyyy")} telah berhasil dikirim.`,
            });
            mutateReports();
            handleCloseDialog();
        } catch (error: any) {
            toast({ title: "Gagal Menyimpan", description: error.message, variant: "destructive" });
        } finally {
            setIsSaving(false);
            setIsConfirmOpen(false);
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
        const isDateInPastCheck = selectedDate && !isToday(selectedDate) && isPast(selectedDate);
        const isDateInFuture = selectedDate && isFuture(selectedDate);
        
        const canEdit = isDateToday && (!selectedReport || selectedReport.status === 'needs_revision' || selectedReport.status === 'draft');

        if (isEditing) {
            return (
                <>
                    <DialogHeader>
                        <DialogTitle>Laporan: {selectedDate && format(selectedDate, "eeee, dd MMMM", { locale: id })}</DialogTitle>
                        <DialogDescription>Isi semua field untuk melaporkan aktivitas harian Anda.</DialogDescription>
                    </DialogHeader>
                     <Form {...form}>
                        <form id="report-form" className="space-y-6 py-4" onSubmit={form.handleSubmit(prepareSubmit)}>
                            <FormField control={form.control} name="activity" render={({ field }) => (<FormItem><FormLabel>Uraian Aktivitas <span className="text-destructive">*</span></FormLabel><FormControl><Textarea {...field} rows={5} placeholder="Jelaskan secara rinci pekerjaan dan tugas yang Anda lakukan hari ini..." /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="learning" render={({ field }) => (<FormItem><FormLabel>Pembelajaran yang Diperoleh <span className="text-destructive">*</span></FormLabel><FormControl><Textarea {...field} rows={3} placeholder="Hal atau pengetahuan baru apa yang Anda dapatkan?" /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="obstacle" render={({ field }) => (<FormItem><FormLabel>Kendala yang Dialami <span className="text-destructive">*</span></FormLabel><FormControl><Textarea {...field} rows={3} placeholder="Apa saja kesulitan yang Anda hadapi dan bagaimana Anda mencoba menyelesaikannya?" /></FormControl><FormMessage /></FormItem>)} />
                            <FormField control={form.control} name="declaration" render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm">
                                <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange}/></FormControl>
                                <div className="space-y-1 leading-none"><FormLabel>Saya menyatakan bahwa laporan yang saya isi adalah benar dan sesuai dengan aktivitas yang saya lakukan.</FormLabel><FormMessage /></div>
                              </FormItem>
                            )}/>
                        </form>
                     </Form>
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
                            {selectedReport.status === 'submitted' && (
                                <p className="text-xs text-muted-foreground mt-2">Laporan Anda sedang menunggu tinjauan dari mentor.</p>
                            )}
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
                        {isDateInPastCheck && <p className="text-xs text-muted-foreground text-left">Laporan untuk tanggal yang lewat tidak dapat diubah.</p>}
                        <div className='flex gap-2 self-end ml-auto'>
                            <Button type="button" variant="outline" onClick={handleCloseDialog}>Tutup</Button>
                             {canEdit && (
                                <Button type="button" onClick={(e) => { e.preventDefault(); setIsEditing(true);}}><FilePlus className="mr-2 h-4 w-4" /> Edit Laporan</Button>
                            )}
                        </div>
                    </DialogFooter>
                </>
            );
        }
        
        let emptyStateTitle = "Belum ada laporan";
        let emptyStateDescription = "Tidak ada laporan yang dibuat pada tanggal ini.";
        if (isDateInPastCheck) {
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
                    {(isDateInPastCheck || isDateInFuture) ? <p className="text-xs text-muted-foreground text-left mr-auto">Info</p> : <div></div>}
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
                            
                            return (
                                <button
                                    key={day.toString()}
                                    type="button"
                                    onClick={() => !isFutureDate && handleDateClick(day)}
                                    disabled={isFutureDate}
                                    className={cn(
                                        "relative h-20 p-2 text-left align-top transition-colors rounded-lg",
                                        isCurrentMonthDay ? "hover:bg-accent" : "text-muted-foreground/50 hover:bg-accent/50",
                                        isPast(day) && !isToday(day) && "opacity-75",
                                        isDateSelected && "bg-primary/10 ring-2 ring-primary",
                                        isFutureDate && "opacity-50 cursor-not-allowed hover:bg-transparent"
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
            <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Konfirmasi Pengiriman Laporan</DialogTitle>
                  <DialogDescription>
                    Apakah Anda yakin ingin mengirim laporan ini? Setelah dikirim, laporan tidak dapat diubah sampai direview oleh mentor.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setIsConfirmOpen(false)} disabled={isSaving}>Batal</Button>
                  <Button onClick={handleConfirmSave} disabled={isSaving}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Ya, Kirim Laporan
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
        </>
    );
}
