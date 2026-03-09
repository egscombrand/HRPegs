'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuGroup } from '@/components/ui/dropdown-menu';
import { Check, MoreVertical } from 'lucide-react';
import { type JobApplication, ORDERED_RECRUITMENT_STAGES } from '@/lib/types';
import { statusDisplayLabels } from '@/components/recruitment/ApplicationStatusBadge';
import { StageChangeDialog } from './StageChangeDialog';

interface ApplicationActionBarProps {
  application: JobApplication;
  onStageChange: (newStage: JobApplication['status'], reason: string) => Promise<boolean>;
  onSendOfferClick: () => void;
}

const getStageActions = (currentStatus: JobApplication['status']) => {
    const currentIndex = ORDERED_RECRUITMENT_STAGES.indexOf(currentStatus);
    
    if (currentStatus === 'hired' || currentStatus === 'rejected' || currentIndex === -1) {
        return { primaryAction: null, otherActions: [] };
    }

    const nextLogicalStage = ORDERED_RECRUITMENT_STAGES[currentIndex + 1];
    const primaryAction: JobApplication['status'] | null = nextLogicalStage;
    const otherActions: JobApplication['status'][] = ORDERED_RECRUITMENT_STAGES
        .filter(stage => stage !== currentStatus && stage !== nextLogicalStage);
        
    return { primaryAction, otherActions };
}

export function ApplicationActionBar({ application, onStageChange, onSendOfferClick }: ApplicationActionBarProps) {
  const [stageChangeDialogOpen, setStageChangeDialogOpen] = useState(false);
  const [targetStage, setTargetStage] = useState<JobApplication['status'] | null>(null);

  const handleActionClick = (stage: JobApplication['status']) => {
    if (stage === 'hired') {
      onSendOfferClick();
    } else {
      setTargetStage(stage);
      setStageChangeDialogOpen(true);
    }
  };

  const handleConfirmStageChange = async (reason: string) => {
    if (!targetStage) return;
    const success = await onStageChange(targetStage, reason);
    if (success) {
        setStageChangeDialogOpen(false);
        setTargetStage(null);
    }
  };

  const { primaryAction, otherActions } = getStageActions(application.status);
  
  const finalStageActions = ['hired', 'rejected'];
  const backAndSkipActions = otherActions.filter(stage => !finalStageActions.includes(stage));

  return (
    <>
      <div className="flex items-center gap-2">
        {primaryAction && (
          <Button onClick={() => handleActionClick(primaryAction)}>
            <Check className="mr-2 h-4 w-4" />
            {`Lolos ke ${statusDisplayLabels[primaryAction]}`}
          </Button>
        )}

        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-10 w-10">
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">Tindakan Lain</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {backAndSkipActions.length > 0 && (
                    <DropdownMenuGroup>
                        <DropdownMenuLabel>Pindahkan ke Tahap Lain</DropdownMenuLabel>
                        {backAndSkipActions.map(stage => (
                            <DropdownMenuItem key={stage} onSelect={() => handleActionClick(stage)} className="cursor-pointer">
                                {statusDisplayLabels[stage]}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuGroup>
                )}
                
                <DropdownMenuSeparator />
                
                <DropdownMenuGroup>
                    <DropdownMenuLabel>Keputusan Final</DropdownMenuLabel>
                    <DropdownMenuItem onSelect={() => handleActionClick('hired')} className="cursor-pointer">
                        Diterima Kerja
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onSelect={() => handleActionClick('rejected')}
                        className="cursor-pointer text-destructive focus:text-destructive"
                    >
                        Tolak Kandidat
                    </DropdownMenuItem>
                </DropdownMenuGroup>
            </DropdownMenuContent>
        </DropdownMenu>
      </div>
      
      <StageChangeDialog 
        open={stageChangeDialogOpen}
        onOpenChange={setStageChangeDialogOpen}
        targetStage={targetStage}
        onConfirm={handleConfirmStageChange}
      />
    </>
  );
}
