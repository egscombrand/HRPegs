'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { Copy, X, AlertCircle, RotateCw } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { getAttendanceImageUrl } from '@/lib/google-drive-image';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

interface AttendanceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: {
    id: string;
    name: string;
    employeeNumber: string;
    brandName: string;
    divisionName: string;
    attendanceMethod: string;
    tapIn: string;
    tapOut: string;
    status: string;
    address: string;
    photoUrl?: string | null;
    lateMinutes?: number | null;
    earlyLeaveMinutes?: number | null;
    rawEvent?: any; // For accessing original event data with driveFileId, etc
  } | null;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Sedang Bekerja':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'Selesai':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'Belum Tap In':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    case 'Terlambat':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    case 'Cuti Tahunan':
      return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300';
    default:
      return 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300';
  }
};

export function AttendanceDetailModal({ isOpen, onClose, record }: AttendanceDetailModalProps) {
  const { toast } = useToast();
  const [imageError, setImageError] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);

  if (!record) return null;

  // Get attendance image URL dari API lokal proxy
  // API akan handle komunikasi dengan Google Drive via Apps Script
  const imageUrl = record.rawEvent ? getAttendanceImageUrl(record.rawEvent) : null;
  const hasPhoto = imageUrl && imageUrl !== '-';

  const handleCopyAddress = () => {
    if (record.address && record.address !== '-') {
      navigator.clipboard.writeText(record.address);
      toast({
        title: 'Alamat disalin',
        description: 'Alamat sudah disalin ke clipboard',
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Accessibility Title (Hidden) */}
        <DialogTitle>
          <VisuallyHidden>Detail Absensi {record.name}</VisuallyHidden>
        </DialogTitle>

        {/* Header */}
        <DialogHeader className="pb-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarFallback className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold text-sm">
                  {getInitials(record.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-slate-800 dark:text-white truncate">{record.name}</h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">{record.employeeNumber}</p>
              </div>
            </div>
            <Badge className={`${getStatusColor(record.status)} text-xs px-2 py-0.5 whitespace-nowrap shrink-0`}>
              {record.status}
            </Badge>
          </div>
          <DialogClose className="absolute right-4 top-4" asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </DialogClose>
        </DialogHeader>

        {/* Main Content */}
        <div className="space-y-5 py-4">
          {/* A. Foto Bukti Absensi - Priority Position */}
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-3">Bukti Selfie Absensi</h3>
            {hasPhoto ? (
              <div className="space-y-3">
                {/* Photo Container */}
                <div className="relative bg-slate-50 dark:bg-slate-800 rounded-lg overflow-hidden flex items-center justify-center max-h-[360px] border border-slate-200 dark:border-slate-700 p-2">
                  {!imageError ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={`photo-${reloadCount}`}
                      src={imageUrl}
                      alt="Bukti selfie absensi"
                      className="w-full max-h-[360px] object-contain rounded"
                      onError={() => setImageError(true)}
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-4 p-6 text-center">
                      <AlertCircle className="h-12 w-12 text-slate-400" />
                      <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Foto tidak bisa dimuat</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Terjadi masalah saat membaca dari server HRP</p>
                      </div>
                      {/* Reload Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setImageError(false);
                          setReloadCount(prev => prev + 1);
                        }}
                        className="gap-2"
                      >
                        <RotateCw className="h-4 w-4" />
                        Muat Ulang Foto
                      </Button>
                    </div>
                  )}
                </div>

              </div>
            ) : (
              <div className="bg-slate-50 dark:bg-slate-900/20 rounded-lg p-6 text-center">
                <Badge variant="outline" className="mb-2">
                  Tidak ada foto
                </Badge>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Bukti selfie absensi tidak tersedia
                </p>
              </div>
            )}
          </div>

          {/* B. Ringkasan Absensi */}
          <Card className="border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/20">
            <CardContent className="pt-4">
              <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-3">Ringkasan Kehadiran</h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mb-1">Masuk</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-white">
                    {record.tapIn || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mb-1">Pulang</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-white">
                    {record.tapOut || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mb-1">Status</p>
                  <div className="flex flex-wrap gap-1">
                    {record.lateMinutes && record.lateMinutes > 0 && (
                      <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 text-xs py-0">
                        Terlambat {record.lateMinutes}m
                      </Badge>
                    )}
                    {record.earlyLeaveMinutes && record.earlyLeaveMinutes > 0 && (
                      <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 text-xs py-0">
                        Pulang Awal {record.earlyLeaveMinutes}m
                      </Badge>
                    )}
                    {(!record.lateMinutes || record.lateMinutes <= 0) &&
                     (!record.earlyLeaveMinutes || record.earlyLeaveMinutes <= 0) && (
                      <span className="text-xs text-slate-600 dark:text-slate-400">Normal</span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* C. Lokasi */}
          <Card className="border-slate-200 dark:border-slate-700">
            <CardContent className="pt-4">
              <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-2">Lokasi Absensi</h3>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800 dark:text-slate-100 leading-relaxed break-words">
                    {record.address || '—'}
                  </p>
                </div>
                {record.address && record.address !== '-' && record.address !== '—' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 shrink-0"
                    onClick={handleCopyAddress}
                    title="Salin alamat"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* D. Identitas */}
          <Card className="border-slate-200 dark:border-slate-700">
            <CardContent className="pt-4">
              <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-3">Data Identitas</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mb-0.5">Brand</p>
                  <p className="text-sm text-slate-800 dark:text-slate-100 font-medium">
                    {record.brandName}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mb-0.5">Divisi</p>
                  <p className="text-sm text-slate-800 dark:text-slate-100 font-medium">
                    {record.divisionName}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mb-0.5">Metode</p>
                  <Badge variant="outline" className="text-xs">
                    {record.attendanceMethod === 'web_absen' ? 'Web Absen' : 'ID Card'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
