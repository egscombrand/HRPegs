'use client';

import { useMemo } from 'react';
import type { Job, UserProfile } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import Image from 'next/image';
import { Calendar, MapPin, Users, Briefcase, Building2, FileText } from 'lucide-react';
import SafeRichText from '@/components/ui/SafeRichText';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

interface JobDetailPanelProps {
  job: Job & { brandName?: string };
  assignedUsers: UserProfile[];
}

const InfoRow = ({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) => (
  <div className="flex items-start gap-3">
    {icon && <div className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5">{icon}</div>}
    <div className="flex-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase">{label}</p>
      <p className="text-sm text-foreground mt-1">{value}</p>
    </div>
  </div>
);

const SectionTitle = ({ title, icon }: { title: string; icon?: React.ReactNode }) => (
  <div className="flex items-center gap-2">
    {icon && <div className="text-muted-foreground">{icon}</div>}
    <h3 className="font-semibold text-sm uppercase text-muted-foreground">{title}</h3>
  </div>
);

export function JobDetailPanel({ job, assignedUsers }: JobDetailPanelProps) {
  const statusColor = useMemo(() => {
    switch (job.publishStatus) {
      case 'published':
        return 'bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-100';
      case 'draft':
        return 'bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-100';
      case 'closed':
        return 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-100';
      default:
        return 'bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100';
    }
  }, [job.publishStatus]);

  return (
    <div className="space-y-6 p-6">
      {/* Cover Image */}
      {job.coverImageUrl && (
        <div className="relative w-full h-32 rounded-lg overflow-hidden bg-muted">
          <Image
            src={job.coverImageUrl}
            alt={job.position}
            fill
            className="object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Basic Info */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold">{job.position}</h2>
            <p className="text-sm text-muted-foreground mt-1">{job.brandName || 'N/A'}</p>
          </div>
          <Badge className={statusColor}>
            {job.publishStatus === 'published' && 'Published'}
            {job.publishStatus === 'draft' && 'Draft'}
            {job.publishStatus === 'closed' && 'Closed'}
          </Badge>
        </div>
      </div>

      <Separator />

      {/* Position Details */}
      <div className="space-y-4">
        <SectionTitle title="Detail Posisi" icon={<Briefcase className="h-4 w-4" />} />
        <div className="grid gap-3">
          <InfoRow label="Divisi" value={job.division || '-'} />
          <InfoRow label="Tipe" value={job.statusJob ? job.statusJob.charAt(0).toUpperCase() + job.statusJob.slice(1) : '-'} />
          <InfoRow label="Mode Kerja" value={job.workMode ? job.workMode.charAt(0).toUpperCase() + job.workMode.slice(1) : '-'} />
          <InfoRow label="Lokasi" value={job.location || '-'} icon={<MapPin className="h-4 w-4" />} />
        </div>
      </div>

      <Separator />

      {/* Recruitment Info */}
      <div className="space-y-4">
        <SectionTitle title="Informasi Rekrutmen" icon={<Users className="h-4 w-4" />} />
        <div className="grid gap-3">
          <InfoRow
            label="Jumlah Lowongan"
            value={job.numberOfOpenings ? `${job.numberOfOpenings} posisi` : '-'}
          />
          {job.applyDeadline && (
            <InfoRow
              label="Deadline Aplikasi"
              value={format(
                job.applyDeadline.seconds ? new Date(job.applyDeadline.seconds * 1000) : new Date(job.applyDeadline),
                'dd MMMM yyyy',
                { locale: idLocale }
              )}
              icon={<Calendar className="h-4 w-4" />}
            />
          )}
        </div>
      </div>

      <Separator />

      {/* Assigned Team */}
      <div className="space-y-4">
        <SectionTitle title="Tim Rekrutmen" icon={<Users className="h-4 w-4" />} />
        {assignedUsers.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {assignedUsers.map(user => (
              <Badge key={user.uid} variant="secondary">
                {user.fullName}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Belum ada tim yang ditugaskan.</p>
        )}
      </div>

      <Separator />

      {/* General Requirements */}
      {job.generalRequirementsHtml && (
        <>
          <div className="space-y-3">
            <SectionTitle title="Persyaratan Umum" icon={<FileText className="h-4 w-4" />} />
            <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
              <SafeRichText html={job.generalRequirementsHtml} />
            </div>
          </div>
          <Separator />
        </>
      )}

      {/* Special Requirements */}
      {job.specialRequirementsHtml && (
        <>
          <div className="space-y-3">
            <SectionTitle title="Persyaratan Khusus" icon={<FileText className="h-4 w-4" />} />
            <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
              <SafeRichText html={job.specialRequirementsHtml} />
            </div>
          </div>
          <Separator />
        </>
      )}

      {/* Job Description */}
      {job.jobDescription && (
        <div className="space-y-3">
          <SectionTitle title="Deskripsi Pekerjaan" icon={<Briefcase className="h-4 w-4" />} />
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
            <SafeRichText html={job.jobDescription} />
          </div>
        </div>
      )}
    </div>
  );
}
