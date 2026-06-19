'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import type { JobApplication } from '@/lib/types';
import { statusDisplayLabels } from './ApplicationStatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials, cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter, type DragStartEvent, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { doc, serverTimestamp } from 'firebase/firestore';
import { useFirestore, updateDocumentNonBlocking } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { getApplicationFilterStage } from '@/lib/recruitment/application-stage';

// Define the order of columns in the Kanban board
const KANBAN_STAGES: JobApplication['status'][] = [
    'submitted',
    'screening',
    'tes_kepribadian',
    'document_submission',
    'verification',
    'interview',
];

type ApplicationGroup = Record<JobApplication['status'], JobApplication[]>;

const CandidateCard = ({ application, isDragging }: { application: JobApplication, isDragging?: boolean }) => (
    <Card className={cn("mb-4", isDragging && "ring-2 ring-primary shadow-lg")}>
        <CardContent className="p-3">
            <div className="flex items-start gap-3">
                <Avatar className="h-9 w-9">
                    <AvatarImage src={application.candidatePhotoUrl ?? `https://i.pravatar.cc/150?u=${application.candidateUid}`} />
                    <AvatarFallback>{getInitials(application.candidateName)}</AvatarFallback>
                </Avatar>
                <div className="flex-grow">
                    <Link href={`/admin/recruitment/applications/${application.id}`} className="font-semibold text-sm hover:underline">
                        {application.candidateName}
                    </Link>
                    <p className="text-xs text-muted-foreground">{application.jobPosition}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                        {application.updatedAt?.toDate ? formatDistanceToNow(application.updatedAt.toDate(), { addSuffix: true, locale: id }) : ''}
                    </p>
                </div>
            </div>
        </CardContent>
    </Card>
);

const SortableCandidateCard = ({ application }: { application: JobApplication }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: application.id! });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <CandidateCard application={application} />
        </div>
    );
};

const KanbanColumn = ({ stage, applications }: { stage: JobApplication['status']; applications: JobApplication[] }) => {
    const { setNodeRef } = useSortable({ id: stage });

    return (
         <div ref={setNodeRef} className="w-72 flex-shrink-0">
            <Card className="bg-muted/50 h-full">
                <CardHeader className="p-3">
                    <CardTitle className="text-base font-medium flex items-center justify-between">
                        <span>{statusDisplayLabels[stage]}</span>
                        <span className="text-sm text-muted-foreground">{applications.length}</span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-3">
                    <ScrollArea className="h-[60vh]">
                        <SortableContext items={applications.map(app => app.id!)} strategy={verticalListSortingStrategy}>
                           <div className="min-h-[1px]">
                                {applications.map(app => (
                                    <SortableCandidateCard key={app.id} application={app} />
                                ))}
                            </div>
                        </SortableContext>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    );
};


export function CandidatesKanban({ applications: initialApplications }: { applications: JobApplication[] }) {
    const [applications, setApplications] = useState<ApplicationGroup>(() => {
        const grouped: ApplicationGroup = {} as ApplicationGroup;
        KANBAN_STAGES.forEach(stage => { grouped[stage] = [] });
        initialApplications.forEach(app => {
            const stage = getApplicationFilterStage(app);
            if (grouped[stage] && KANBAN_STAGES.includes(stage)) {
                grouped[stage].push(app);
            }
        });
        return grouped;
    });
    
    useEffect(() => {
        const grouped: ApplicationGroup = {} as ApplicationGroup;
        KANBAN_STAGES.forEach(stage => { grouped[stage] = [] });
        initialApplications.forEach(app => {
            const stage = getApplicationFilterStage(app);
            if (grouped[stage] && KANBAN_STAGES.includes(stage)) {
                grouped[stage].push(app);
            }
        });
        setApplications(grouped);
    }, [initialApplications]);

    const [activeApplication, setActiveApplication] = useState<JobApplication | null>(null);
    const firestore = useFirestore();
    const { toast } = useToast();

    const sensors = useSensors(
        useSensor(PointerSensor, {
          activationConstraint: {
            distance: 8, // User must drag for 8px before a drag starts
          },
        })
    );
    
    const findContainer = (id: string, currentApplications: ApplicationGroup): JobApplication['status'] | undefined => {
        if (KANBAN_STAGES.includes(id as any)) {
            return id as JobApplication['status'];
        }
        const stage = Object.keys(currentApplications).find(key =>
            (currentApplications[key as JobApplication['status']] || []).some(app => app && app.id === id)
        );
        return stage as JobApplication['status'] | undefined;
    };

    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        const container = findContainer(active.id as string, applications);
        if (container) {
            setActiveApplication(applications[container as JobApplication['status']].find(app => app.id === active.id) || null);
        }
    };
    
    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        
        setActiveApplication(null);

        if (!over) return;
        
        const activeId = active.id as string;
        const overId = over.id as string;

        const oldStage = findContainer(activeId, applications);
        let newStage = findContainer(overId, applications);
        
        if (overId === 'kanban-board-end-zone') {
            newStage = 'hired'; // Example, could be a specific dropzone
        }


        if (!oldStage || !newStage) return;

        // Perform UI update optimistically
        setApplications(prev => {
            const oldItems = prev[oldStage];
            
            if (oldStage === newStage) {
                 if (!oldItems) return prev;
                // Reorder within the same column
                const oldIndex = oldItems.findIndex(item => item && item.id === activeId);
                const newIndex = oldItems.findIndex(item => item && item.id === overId);
                if (oldIndex !== -1 && newIndex !== -1) {
                    return { ...prev, [oldStage]: arrayMove(oldItems, oldIndex, newIndex) };
                }
            } else {
                if (!oldItems) return prev;
                // Move to a different column
                const newItemsForOldStage = oldItems.filter(item => item && item.id !== activeId);
                const itemToMove = oldItems.find(item => item && item.id === activeId);

                if (!itemToMove) return prev;

                const newItemsForNewStage = [...(prev[newStage] || [])];
                const overIndex = newItemsForNewStage.findIndex(item => item && item.id === overId);
                
                if (overIndex !== -1) {
                    const isBelow = over.rect.top + over.rect.height / 2 > (active.rect.current.translated?.top ?? 0) + (active.rect.current.translated?.height ?? 0) / 2;
                    newItemsForNewStage.splice(overIndex + (isBelow ? 1 : 0), 0, itemToMove);
                } else {
                    newItemsForNewStage.push(itemToMove);
                }

                return {
                    ...prev,
                    [oldStage]: newItemsForOldStage,
                    [newStage]: newItemsForNewStage,
                };
            }
            return prev;
        });

        // Update Firestore if stage changed
        if (oldStage !== newStage) {
             try {
                const appRef = doc(firestore, 'applications', activeId);
                await updateDocumentNonBlocking(appRef, {
                    status: newStage,
                    updatedAt: serverTimestamp()
                });
                toast({
                    title: 'Status Diperbarui',
                    description: `Kandidat dipindahkan ke tahap "${statusDisplayLabels[newStage]}".`
                });
            } catch (error: any) {
                 toast({
                    variant: 'destructive',
                    title: 'Gagal Memperbarui',
                    description: `Tidak dapat memindahkan kandidat: ${error.message}`
                });
                // Revert UI change
                setApplications(() => {
                    const grouped: ApplicationGroup = {} as ApplicationGroup;
                    KANBAN_STAGES.forEach(stage => { grouped[stage] = [] });
                    initialApplications.forEach(app => {
                        const stage = getApplicationFilterStage(app);
                        if (grouped[stage] && KANBAN_STAGES.includes(stage)) {
                            grouped[stage].push(app);
                        }
                    });
                    return grouped;
                });
            }
        }
    };

    const containerIds = useMemo(() => KANBAN_STAGES, []);

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <ScrollArea className="w-full whitespace-nowrap">
                <div className="flex gap-4 pb-4">
                    <SortableContext items={containerIds}>
                     {KANBAN_STAGES.map(stage => (
                         <KanbanColumn
                            key={stage}
                            stage={stage}
                            applications={applications[stage] || []}
                        />
                     ))}
                     </SortableContext>
                </div>
                <ScrollBar orientation="horizontal" />
            </ScrollArea>
             <DragOverlay>
                {activeApplication ? <CandidateCard application={activeApplication} isDragging /> : null}
            </DragOverlay>
        </DndContext>
    );
}
