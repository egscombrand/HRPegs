'use client';

import Link from 'next/link';
import { Layers } from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApplicationStatusBadge } from './ApplicationStatusBadge';
import type { JobApplication } from '@/lib/types';

interface MultiApplicationAlertProps {
  currentApplicationId: string;
  currentJobPosition: string;
  otherApplications: JobApplication[];
}

export function MultiApplicationAlert({
  currentApplicationId,
  currentJobPosition,
  otherApplications,
}: MultiApplicationAlertProps) {
  if (otherApplications.length === 0) return null;

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 dark:bg-indigo-950/20 dark:border-indigo-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-100 dark:bg-indigo-900/40">
          <Layers className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-300">
            Kandidat juga melamar lowongan lain
          </p>
          <p className="text-xs text-indigo-600 dark:text-indigo-400">
            Terdapat {otherApplications.length + 1} lamaran dari kandidat ini di sistem rekrutmen.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {/* Current application */}
        <div className="flex items-center justify-between rounded-lg bg-white/70 dark:bg-slate-900/40 border border-indigo-100 dark:border-indigo-900 px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
              {currentJobPosition}
            </p>
          </div>
          <Badge variant="outline" className="text-[10px] border-indigo-300 text-indigo-600 shrink-0 ml-2">
            Lamaran ini
          </Badge>
        </div>

        {/* Other applications */}
        {otherApplications.map(app => (
          <div
            key={app.id}
            className="flex items-center justify-between rounded-lg bg-white/70 dark:bg-slate-900/40 border border-indigo-100 dark:border-indigo-900 px-3 py-2 gap-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                {app.jobPosition}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                {app.brandName}
                {app.submittedAt ? ` · ${format(app.submittedAt.toDate(), 'dd MMM yyyy', { locale: idLocale })}` : ''}
              </p>
            </div>
            <ApplicationStatusBadge status={app.status} className="text-[10px] shrink-0" />
            <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs text-indigo-600 hover:text-indigo-700 shrink-0">
              <Link href={`/admin/recruitment/applications/${app.id}`}>
                Lihat
              </Link>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
