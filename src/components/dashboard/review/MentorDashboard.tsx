'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useCollection, useFirestore, useMemoFirebase, updateDocumentNonBlocking, writeBatch, useDoc } from '@/firebase';
import { collection, query, where, doc, serverTimestamp, Timestamp, getDoc } from 'firebase/firestore';
import type { DailyReport, UserProfile, MonthlyEvaluation } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format, formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';
import { Loader2, Eye, CheckCircle, XCircle, FileClock, ThumbsUp, MessageSquareWarning, FileText, Target, Edit } from 'lucide-react';
import { ReviewReportDialog } from './ReviewReportDialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { BulkRevisionDialog } from './BulkRevisionDialog';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from '@/components/ui/card';
import { SetFocusDialog } from './SetFocusDialog';


type ReportWithDetails = DailyReport & { internName?: string; };

const ReportPreview = ({ report, onReviewClick, onApproveClick, onReviseClick, isApproving }: { report: ReportWithDetails; onReviewClick: () => void; onApproveClick: () => void; onReviseClick: () => void, isApproving: boolean; }) => {
  
  const PreviewSection = ({ title, icon, content, lineClamp }: { title: string; icon: React.ReactNode; content?: string; lineClamp: string }) => (
    <div>
        <h4 className="font-semibold text-xs uppercase text-muted-foreground mb-1 flex items-center gap-2">{icon} {title}</h4>
        <p className={`text-sm ${lineClamp}`}>{content || '-'}</p>
    </div>
  );
  
  return (
    <div className="space-y-4 pt-2 pb-4 px-4 bg-muted/50 ml-12">
        <div className="space-y-3">
            <PreviewSection title="Aktivitas" icon={<FileText className="h-4 w-4" />} content={report.activity} lineClamp="line-clamp-3" />
            <PreviewSection title="Pembelajaran" icon={<ThumbsUp className="h-4 w-4" />} content={report.learning} lineClamp="line-clamp-2" />
            {report.obstacle && (
                <PreviewSection title="Kendala" icon={<MessageSquareWarning className="h-4 w-4" />} content={report.obstacle} lineClamp="line-clamp-2" />
            )}
        </div>
        <Separator />
        <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={onReviewClick}><Eye className="mr-2 h-4 w-4"/> Lihat Detail</Button>
            {report.status === 'submitted' && (
              <>
                <Button size="sm" variant="destructive" onClick={onReviseClick}><XCircle className="mr-2 h-4 w-4"/> Minta Revisi</Button>
                <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={onApproveClick} disabled={isApproving}>
                    {isApproving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCircle className="mr-2 h-4 w-4"/>} 
                    Setujui
                </Button>
              </>
            )}
        </div>
    </div>
  );
};

function InternAccordionContent({ internId, internName, reports }: { internId: string; internName: string; reports: ReportWithDetails[] }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const { userProfile } = useAuth();
    
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkRevisionOpen, setIsBulkRevisionOpen] = useState(false);
    const [isBulkApproving, setIsBulkApproving] = useState(false);
    const [approvingId, setApprovingId] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [activeTab, setActiveTab] = useState('submitted');
    const [selectedReport, setSelectedReport] = useState<ReportWithDetails | null>(null);
    const [focusToEdit, setFocusToEdit] = useState(false);

    const monthId = useMemo(() => format(new Date(), 'yyyy-MM'), []);
    const evalRef = useMemoFirebase(() => {
        const evalId = `${internId}_${monthId}`;
        return doc(firestore, 'monthly_evaluations', evalId);
    }, [firestore, internId, monthId]);
    const { data: monthlyEval, mutate: mutateEval } = useDoc<MonthlyEvaluation>(evalRef);

    const reportsForCurrentTab = useMemo(() => {
        const filtered = reports.filter(r => r.status === activeTab);
        return filtered.sort((a,b) => {
            const timeA = a.submittedAt?.toMillis() || a.createdAt.toMillis();
            const timeB = b.submittedAt?.toMillis() || b.createdAt.toMillis();
            return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
        });
    }, [reports, activeTab, sortOrder]);
    
    const allSelectedForIntern = activeTab === 'submitted' && reportsForCurrentTab.length > 0 && reportsForCurrentTab.every(r => selectedIds.has(r.id!));

    const handleSelectAllForIntern = (checked: boolean) => {
        const reportIds = reportsForCurrentTab.map(r => r.id!);
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (checked) {
                reportIds.forEach(id => newSet.add(id));
            } else {
                reportIds.forEach(id => newSet.delete(id));
            }
            return newSet;
        });
    };

    const handleSelectOne = (reportId: string, checked: boolean) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (checked) newSet.add(reportId);
            else newSet.delete(reportId);
            return newSet;
        });
    };

    const handleBulkApprove = async () => {
        if (selectedIds.size === 0 || !userProfile) return;
        setIsBulkApproving(true);
        
        const batch = writeBatch(firestore);
        selectedIds.forEach(id => {
            const ref = doc(firestore, 'daily_reports', id);
            batch.update(ref, { 
                status: 'approved',
                reviewedAt: serverTimestamp(),
                reviewedByUid: userProfile.uid,
                reviewedByName: userProfile.fullName,
                reviewerNotes: null,
             });
        });

        try {
            await batch.commit();
            toast({ title: 'Sukses', description: `${selectedIds.size} laporan telah disetujui.` });
            setSelectedIds(new Set());
            // Parent's mutate will be called eventually
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Gagal', description: e.message });
        } finally {
            setIsBulkApproving(false);
        }
    };
    
    const handleSingleApprove = async (reportId: string) => {
      if (!userProfile) return;
      setApprovingId(reportId);
      try {
        const ref = doc(firestore, 'daily_reports', reportId);
        await updateDocumentNonBlocking(ref, { 
            status: 'approved',
            reviewedAt: serverTimestamp(),
            reviewedByUid: userProfile.uid,
            reviewedByName: userProfile.fullName,
            reviewerNotes: null
        });
        toast({ title: 'Laporan Disetujui' });
      } catch (e: any) {
        toast({ variant: 'destructive', title: 'Gagal', description: e.message });
      } finally {
        setApprovingId(null);
      }
    };

    return (
        <>
            <Card className="mx-4 my-2">
                <CardHeader>
                    <CardTitle className="text-base flex items-center justify-between">
                        <span className="flex items-center gap-2"><Target className="h-4 w-4" /> Fokus Bulan Ini</span>
                        <Button variant="ghost" size="sm" onClick={() => setFocusToEdit(true)}>
                            <Edit className="h-4 w-4 mr-2" /> Atur Fokus
                        </Button>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">
                        {monthlyEval?.monthlyFocus || "Belum ada fokus yang ditetapkan untuk bulan ini."}
                    </p>
                </CardContent>
            </Card>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="px-4 mt-2">
                <TabsList>
                    <TabsTrigger value="submitted">Menunggu Review</TabsTrigger>
                    <TabsTrigger value="needs_revision">Perlu Revisi</TabsTrigger>
                    <TabsTrigger value="approved">Disetujui</TabsTrigger>
                </TabsList>
            </Tabs>
            
            <div className="p-2">
                {activeTab === 'submitted' && (
                    <div className="flex items-center justify-between gap-3 p-2 border-b">
                        <div className="flex items-center gap-3">
                            <Checkbox
                                id={`select-all-${internId}`}
                                checked={allSelectedForIntern}
                                onCheckedChange={(checked) => handleSelectAllForIntern(!!checked)}
                            />
                            <label htmlFor={`select-all-${internId}`} className="text-sm font-medium">Pilih semua</label>
                        </div>
                        {selectedIds.size > 0 && (
                            <div className="flex items-center gap-2">
                                <Button size="sm" variant="destructive" onClick={() => setIsBulkRevisionOpen(true)}>Minta Revisi ({selectedIds.size})</Button>
                                <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={handleBulkApprove} disabled={isBulkApproving}>
                                    {isBulkApproving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                    Setujui ({selectedIds.size})
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <Accordion type="single" collapsible className="w-full space-y-1 px-2 pb-2">
                {reportsForCurrentTab.map(report => (
                    <AccordionItem value={report.id!} key={report.id!} className="border rounded-md bg-background">
                        <div className="flex items-center gap-2 pr-4">
                            {activeTab === 'submitted' && (
                                <div className="p-4">
                                    <Checkbox
                                        checked={selectedIds.has(report.id!)}
                                        onCheckedChange={(checked) => handleSelectOne(report.id!, !!checked)}
                                        onClick={e => e.stopPropagation()}
                                    />
                                </div>
                            )}
                            <AccordionTrigger className="flex-1 hover:no-underline pl-4 data-[state=closed]:py-4">
                                <div className="flex justify-between items-center w-full">
                                    <div className="text-left">
                                        <p className="font-semibold">{format(report.date.toDate(), 'eeee, dd MMM', { locale: id })}</p>
                                        <p className="text-xs text-muted-foreground">Diajukan: {formatDistanceToNow(report.submittedAt?.toDate() || report.createdAt.toDate(), { addSuffix: true, locale: id })}</p>
                                    </div>
                                </div>
                            </AccordionTrigger>
                        </div>
                        <AccordionContent>
                            <ReportPreview
                                report={report}
                                onReviewClick={() => setSelectedReport(report)}
                                onApproveClick={() => handleSingleApprove(report.id!)}
                                onReviseClick={() => setSelectedReport(report)}
                                isApproving={approvingId === report.id}
                            />
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
            {reportsForCurrentTab.length === 0 && <p className="text-center text-sm text-muted-foreground py-4">Tidak ada laporan di tab ini.</p>}
            
            <BulkRevisionDialog 
                open={isBulkRevisionOpen}
                onOpenChange={setIsBulkRevisionOpen}
                reportIds={Array.from(selectedIds)}
                onSuccess={() => { setSelectedIds(new Set()); /* Let parent mutate */ }}
            />
            {selectedReport && (
                <ReviewReportDialog 
                    open={!!selectedReport} 
                    onOpenChange={(isOpen) => !isOpen && setSelectedReport(null)} 
                    report={selectedReport} 
                    onSuccess={() => setSelectedReport(null)}
                />
            )}
            <SetFocusDialog 
                open={focusToEdit}
                onOpenChange={setFocusToEdit}
                internId={internId}
                internName={internName}
                currentFocus={monthlyEval?.monthlyFocus}
                onSuccess={mutateEval}
            />
        </>
    );
}

export function MentorDashboard({ userProfile }: { userProfile: UserProfile}) {
    const firestore = useFirestore();

    const reportsQuery = useMemoFirebase(() => {
        if (!userProfile) return null;
        return query(collection(firestore, 'daily_reports'), where('supervisorUid', '==', userProfile.uid));
    }, [firestore, userProfile.uid]);

    const { data: reports, isLoading: isLoadingReports } = useCollection<DailyReport>(reportsQuery);
    
    const [interns, setInterns] = useState<UserProfile[] | null>(null);
    const [isLoadingInterns, setIsLoadingInterns] = useState(true);
    
    const internUids = useMemo(() => {
        if (!reports) return [];
        return Array.from(new Set(reports.map(r => r.uid)));
    }, [reports]);

    useEffect(() => {
        if (internUids.length === 0) {
            setInterns([]);
            setIsLoadingInterns(false);
            return;
        }

        setIsLoadingInterns(true);
        const fetchInterns = async () => {
            try {
                const internPromises = internUids.map(uid => getDoc(doc(firestore, 'users', uid)));
                const internDocs = await Promise.all(internPromises);
                const internProfiles = internDocs
                    .filter(docSnap => docSnap.exists())
                    .map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as UserProfile));
                setInterns(internProfiles);
            } catch (err) {
                console.error("Failed to fetch intern profiles:", err);
                setInterns([]);
            } finally {
                setIsLoadingInterns(false);
            }
        };

        fetchInterns();
    }, [internUids, firestore]);
    
    const internNameMap = useMemo(() => new Map(interns?.map(i => [i.uid, i.fullName])), [interns]);

    const reportsWithDetails: ReportWithDetails[] = useMemo(() => {
        if (!reports) return [];
        return reports.map(report => ({
            ...report,
            internName: internNameMap.get(report.uid) || 'Unknown Intern',
        }));
    }, [reports, internNameMap]);

    const groupedByIntern = useMemo(() => {
        return reportsWithDetails.reduce((acc, report) => {
            if (!acc[report.uid]) {
                acc[report.uid] = {
                    internName: report.internName || 'Unknown',
                    reports: []
                };
            }
            acc[report.uid].reports.push(report);
            return acc;
        }, {} as Record<string, { internName: string; reports: ReportWithDetails[] }>);
    }, [reportsWithDetails]);

    const internIds = Object.keys(groupedByIntern);

    if (isLoadingReports || isLoadingInterns) {
        return <div className="h-64 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    return (
      <div className="space-y-4">
        {internIds.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">Tidak ada laporan yang perlu direview saat ini.</p>
        ) : (
            <Accordion type="multiple" className="w-full space-y-2" defaultValue={internIds}>
                {internIds.map(internId => {
                    const internGroup = groupedByIntern[internId];
                    return (
                        <AccordionItem value={internId} key={internId} className="border rounded-lg bg-card">
                            <AccordionTrigger className="px-4 py-3 hover:no-underline text-lg">
                                <div className="flex items-center gap-3">
                                    <Avatar className="h-9 w-9"><AvatarFallback>{getInitials(internGroup.internName)}</AvatarFallback></Avatar>
                                    {internGroup.internName}
                                    <Badge variant="secondary">{internGroup.reports.length} Laporan</Badge>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-1 border-t">
                               <InternAccordionContent internId={internId} internName={internGroup.internName} reports={internGroup.reports} />
                            </AccordionContent>
                        </AccordionItem>
                    )
                })}
            </Accordion>
        )}
      </div>
    )
}
