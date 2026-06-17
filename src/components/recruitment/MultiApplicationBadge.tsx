'use client';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Layers } from 'lucide-react';
import type { JobApplication } from '@/lib/types';

interface MultiApplicationBadgeProps {
  /** All OTHER applications by this candidate (excluding the current one) */
  otherApplications: Pick<JobApplication, 'id' | 'jobPosition' | 'brandName' | 'status'>[];
}

export function MultiApplicationBadge({ otherApplications }: MultiApplicationBadgeProps) {
  if (otherApplications.length === 0) return null;

  const total = otherApplications.length + 1; // +1 for current
  const label = total === 2 ? '2 Lamaran' : `${total} Lamaran`;
  const positionList = otherApplications.map(a => a.jobPosition).join(', ');

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="gap-1 text-[10px] px-1.5 py-0 border-indigo-300 text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 dark:border-indigo-700 dark:text-indigo-400 cursor-default font-medium"
          >
            <Layers className="h-2.5 w-2.5" />
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <p className="font-semibold mb-1">Kandidat juga melamar:</p>
          <ul className="space-y-0.5">
            {otherApplications.map(a => (
              <li key={a.id}>{a.jobPosition}{a.brandName ? ` — ${a.brandName}` : ''}</li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
