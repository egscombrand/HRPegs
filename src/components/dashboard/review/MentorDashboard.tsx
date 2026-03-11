'use client';

import { useState, useMemo, useEffect } from 'react';
import { useCollection, useFirestore, useMemoFirebase, updateDocumentNonBlocking, writeBatch } from '@/firebase';
import { collection, query, where, doc, serverTimestamp, Timestamp, getDoc } from 'firebase/firestore';
import type { DailyReport, UserProfile } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format, formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';
import { Loader2, Eye, CheckCircle, XCircle, FileClock, ThumbsUp, MessageSquareWarning, FileText } from 'lucide-react';
import { ReviewReportDialog } from './ReviewReportDialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { BulkRevisionDialog } from './BulkRevisionDialog';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';

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


export function MentorDashboard({ userProfile }: { userProfile: UserProfile}) {
    const firestore = useFirestore();
    const { toast } = useToast();

    const reportsQuery = useMemoFirebase(() => {
        if (!userProfile) return null;
        return query(collection(firestore, 'daily_reports'), where('supervisorUid', '==', userProfile.uid));
    }, [firestore, userProfile.uid]);

    const { data: reports, isLoading: isLoadingReports, mutate: mutateReports } = useCollection<DailyReport>(reportsQuery);

    const internUids = useMemo(() => {
        if (!reports) return [];
        return Array.from(new Set(reports.map(r => r.uid)));
    }, [reports]);

    const [interns, setInterns] = useState<UserProfile[] | null>(null);
    const [isLoadingInterns, setIsLoadingInterns] = useState(true);

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
                setInterns([]); // Set to empty array on error to avoid breaking downstream logic
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


    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkRevisionOpen, setIsBulkRevisionOpen] = useState(false);
    const [isBulkApproving, setIsBulkApproving] = useState(false);
    const [approvingId, setApprovingId] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [activeTab, setActiveTab] = useState('submitted');
    const [selectedReport, setSelectedReport] = useState<ReportWithDetails | null>(null);

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

    const reportsForCurrentTabAndIntern = (internId: string) => {
        const internGroup = groupedByIntern[internId];
        if (!internGroup) return [];

        const filtered = internGroup.reports.filter(r => r.status === activeTab);
        return filtered.sort((a,b) => {
            const timeA = a.submittedAt?.toMillis() || a.createdAt.toMillis();
            const timeB = b.submittedAt?.toMillis() || b.createdAt.toMillis();
            return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
        });
    }
    
    const handleSelectAllForIntern = (internId: string, checked: boolean) => {
        const reportIds = (groupedByIntern[internId]?.reports || [])
            .filter(r => r.status === 'submitted')
            .map(r => r.id!);
            
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (checked) {
                reportIds.forEach(id => newSet.add(id));
            } else {
                reportIds.forEach(id => newSet.delete(id));
            }
            return newSet;
        });
    }

    const handleSelectOne = (reportId: string, checked: boolean) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (checked) {
                newSet.add(reportId);
            } else {
                newSet.delete(reportId);
            }
            return newSet;
        });
    }

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
            mutateReports();
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
            reviewerNotes: null // Clear notes on approval
        });
        toast({ title: 'Laporan Disetujui' });
        mutateReports();
      } catch (e: any) {
        toast({ variant: 'destructive', title: 'Gagal', description: e.message });
      } finally {
        setApprovingId(null);
      }
    };

    const handleReviewSuccess = () => {
        mutateReports();
        setSelectedReport(null);
    };

    if (isLoadingReports || isLoadingInterns) {
        return <div className="h-64 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    return (
      <div className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
                <TabsTrigger value="submitted">Menunggu Review</TabsTrigger>
                <TabsTrigger value="needs_revision">Perlu Revisi</TabsTrigger>
                <TabsTrigger value="approved">Disetujui</TabsTrigger>
            </TabsList>
        </Tabs>

        {internIds.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">Tidak ada laporan yang perlu direview saat ini.</p>
        ) : (
            <Accordion type="multiple" className="w-full space-y-2" defaultValue={internIds}>
                {internIds.map(internId => {
                    const internGroup = groupedByIntern[internId];
                    const reportsForTab = reportsForCurrentTabAndIntern(internId);
                    const allSelectedForIntern = activeTab === 'submitted' && reportsForTab.length > 0 && reportsForTab.every(r => selectedIds.has(r.id!));

                    if (reportsForTab.length === 0) return null;

                    return (
                        <AccordionItem value={internId} key={internId} className="border rounded-lg bg-card">
                            <AccordionTrigger className="px-4 py-3 hover:no-underline text-lg">
                                <div className="flex items-center gap-3">
                                    <Avatar className="h-9 w-9"><AvatarFallback>{getInitials(internGroup.internName)}</AvatarFallback></Avatar>
                                    {internGroup.internName}
                                    <Badge variant="secondary">{reportsForTab.length} Laporan</Badge>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-1 border-t">
                                <div className="p-2">
                                     {activeTab === 'submitted' && (
                                        <div className="flex items-center gap-3 p-2 border-b">
                                            <Checkbox
                                                id={`select-all-${internId}`}
                                                checked={allSelectedForIntern}
                                                onCheckedChange={(checked) => handleSelectAllForIntern(internId, !!checked)}
                                            />
                                            <label htmlFor={`select-all-${internId}`} className="text-sm font-medium">Pilih semua untuk {internGroup.internName}</label>
                                        </div>
                                     )}
                                </div>
                                <Accordion type="single" collapsible className="w-full space-y-1 px-2 pb-2">
                                    {reportsForTab.map(report => (
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
                                                <AccordionTrigger className="flex-1 hover:no-underline">
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
                                {reportsForTab.length === 0 && <p className="text-center text-sm text-muted-foreground py-4">Tidak ada laporan di tab ini.</p>}
                            </AccordionContent>
                        </AccordionItem>
                    )
                })}
            </Accordion>
        )}
        
        {selectedIds.size > 0 && (
            <div className="sticky bottom-4 z-50 flex items-center justify-center">
                <div className="flex items-center gap-4 rounded-lg border bg-card p-3 shadow-2xl">
                    <p className="text-sm font-medium">{selectedIds.size} laporan terpilih</p>
                    <Separator orientation="vertical" className="h-6" />
                    <Button size="sm" variant="destructive" onClick={() => setIsBulkRevisionOpen(true)}>Minta Revisi</Button>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={handleBulkApprove} disabled={isBulkApproving}>
                        {isBulkApproving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                        Setujui Terpilih
                    </Button>
                </div>
            </div>
        )}
        <BulkRevisionDialog 
            open={isBulkRevisionOpen}
            onOpenChange={setIsBulkRevisionOpen}
            reportIds={Array.from(selectedIds)}
            onSuccess={() => { setSelectedIds(new Set()); mutateReports(); }}
        />
        {selectedReport && (<ReviewReportDialog open={!!selectedReport} onOpenChange={(isOpen) => !isOpen && setSelectedReport(null)} report={selectedReport} onSuccess={handleReviewSuccess}/>)}
      </div>
    )
}
