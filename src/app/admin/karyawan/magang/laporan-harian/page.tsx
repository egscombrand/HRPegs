'use client';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isSameDay, isToday, isPast, addMonths, subMonths, isFuture, formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';
import { FilePlus, Send, ChevronLeft, ChevronRight, Calendar as CalendarIcon, CheckCircle, Clock, AlertCircle, Loader2, UserCheck, FileClock } from 'lucide-react';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';


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

    const reportsMap = useMemo(() => {
        if (!allFetchedReports) return new Map<string, DailyReport>();
        return new Map(allFetchedReports.map(report => [format(report.date.toDate(), 'yyyy-MM-dd'), report]));
    }, [allFetchedReports]);
    
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

        if (report && (report.status === 'needs_revision')) {
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
    
        const reportDataPayload = {
            activity: values.activity,
            learning: values.learning,
            obstacle: values.obstacle,
            updatedAt: serverTimestamp() as Timestamp,
            brandId: (Array.isArray(employeeProfile.brandId) ? employeeProfile.brandId[0] : employeeProfile.brandId) || null,
            supervisorUid: employeeProfile.supervisorUid || null,
            supervisorName: employeeProfile.supervisorName || null,
        };

        try {
            if (isUpdate) {
                const updateData: Partial<DailyReport> = {
                    status: 'submitted' as ReportStatus,
                    ...reportDataPayload
                };
                await updateDocumentNonBlocking(reportRef, updateData);
            } else {
                const createData: Omit<DailyReport, 'id'> = {
                    uid: firebaseUser.uid,
                    date: Timestamp.fromDate(selectedDate),
                    status: 'submitted',
                    createdAt: serverTimestamp() as Timestamp,
                    ...reportDataPayload,
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
        if (!allFetchedReports) return {} as Record<ReportStatus, number>;
        return allFetchedReports.reduce((acc, report) => {
            acc[report.status] = (acc[report.status] || 0) + 1;
            return acc;
        }, {} as Record<ReportStatus, number>);
    }, [allFetchedReports]);

    const ContentSection = ({ title, content }: { title: string, content: string }) => (
        <div>
            <h4 className="font-semibold text-muted-foreground">{title}</h4>
            <p className="text-foreground whitespace-pre-wrap mt-1">{content}</p>
        </div>
    );

    const renderDialogContent = () => {
        const isDateToday = selectedDate && isToday(selectedDate);
        const isDateInPastCheck = selectedDate && !isToday(selectedDate) && isPast(selectedDate);
        const isFutureDate = selectedDate && isFuture(selectedDate);
        
        const canEdit = isDateToday && (!selectedReport || selectedReport.status === 'needs_revision');

        const statusInfo: Record<ReportStatus, { icon: React.ReactNode; title: string; description: string; variant: "default" | "destructive" | "warning"; }> = {
            submitted: { icon: <FileClock className="h-4 w-4" />, title: 'Menunggu Review', description: 'Laporan Anda sedang menunggu tinjauan dari mentor.', variant: 'default' },
            needs_revision: { icon: <AlertCircle className="h-4 w-4" />, title: 'Perlu Revisi', description: 'Mentor Anda memberikan catatan. Silakan perbaiki laporan Anda.', variant: 'destructive' },
            approved: { icon: <CheckCircle className="h-4 w-4" />, title: 'Disetujui', description: 'Laporan Anda telah disetujui oleh mentor. Kerja bagus!', variant: 'default' },
            draft: { icon: <FileClock className="h-4 w-4" />, title: 'Draf', description: 'Laporan ini belum dikirim.', variant: 'default' }
        };

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
                        <Button type="submit" form="report-form" disabled={isSaving || !form.formState.isValid}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                            <Send className="mr-2 h-4 w-4"/> Kirim Laporan
                        </Button>
                    </DialogFooter>
                </>
            );
        }

        if (selectedReport) {
            const currentStatusInfo = statusInfo[selectedReport.status];
            const supervisorDisplayName = selectedReport.supervisorName || employeeProfile?.supervisorName || 'Belum ditugaskan';
            return (
                 <>
                    <DialogHeader>
                        <DialogTitle className="text-2xl">{format(selectedReport.date.toDate(), "eeee, dd MMMM yyyy", { locale: id })}</DialogTitle>
                        <DialogDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                            <span>Dikirim: {formatDistanceToNow(selectedReport.submittedAt?.toDate() || selectedReport.createdAt.toDate(), { addSuffix: true, locale: id })}</span>
                            {supervisorDisplayName && <span>Mentor: {supervisorDisplayName}</span>}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6 py-4 text-sm">
                        {currentStatusInfo && (
                            <Alert variant={currentStatusInfo.variant === 'warning' ? 'default' : currentStatusInfo.variant} className={cn(currentStatusInfo.variant === 'warning' && 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800')}>
                                {currentStatusInfo.icon}
                                <AlertTitle className={cn(currentStatusInfo.variant === 'warning' && 'text-yellow-800 dark:text-yellow-200')}>{currentStatusInfo.title}</AlertTitle>
                                <AlertDescription className={cn(currentStatusInfo.variant === 'warning' && 'text-yellow-700 dark:text-yellow-300')}>{currentStatusInfo.description}</AlertDescription>
                            </Alert>
                        )}
                        <div className="space-y-4">
                            <ContentSection title="Uraian Aktivitas" content={selectedReport.activity} />
                            <ContentSection title="Pembelajaran yang Diperoleh" content={selectedReport.learning} />
                            <ContentSection title="Kendala yang Dialami" content={selectedReport.obstacle} />
                        </div>
                        
                        {(selectedReport.status === 'needs_revision' || selectedReport.status === 'approved') && selectedReport.reviewerNotes && (
                            <>
                                <Separator />
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <UserCheck className="h-5 w-5 text-primary" />
                                            Feedback dari Mentor
                                        </CardTitle>
                                        <CardDescription>{selectedReport.reviewedByName} &bull; {selectedReport.reviewedAt ? format(selectedReport.reviewedAt.toDate(), 'dd MMM, HH:mm') : ''}</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <blockquote className="border-l-4 pl-4 italic text-muted-foreground">
                                            {selectedReport.reviewerNotes}
                                        </blockquote>
                                    </CardContent>
                                </Card>
                            </>
                        )}
                    </div>
                     <DialogFooter className="flex-col sm:flex-row sm:justify-end items-stretch sm:items-center">
                        <Button type="button" variant="outline" onClick={handleCloseDialog}>Tutup</Button>
                         {selectedReport.status === 'needs_revision' && (isDateToday || isDateInPastCheck) && (
                            <Button type="button" onClick={(e) => { e.preventDefault(); setIsEditing(true);}}>Perbaiki Laporan</Button>
                        )}
                    </DialogFooter>
                </>
            );
        }
        
        let emptyStateTitle = "Belum ada laporan";
        let emptyStateDescription = "Tidak ada laporan yang dibuat pada tanggal ini.";
        if (isDateInPastCheck) {
            emptyStateTitle = "Periode Terlewat";
            emptyStateDescription = "Periode input untuk tanggal ini telah lewat.";
        } else if (isFutureDate) {
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
                    <div></div>
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
                <DialogContent className="max-h-[90vh] flex flex-col sm:max-w-2xl">
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
