"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Loader2 } from "lucide-react";

interface MarkAttendanceInvalidDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attendanceRecord: {
    id: string;
    name: string;
    tapIn: string;
    employeeNumber: string;
  } | null;
  onConfirm: (
    attendanceUid: string,
    reason: string,
    note: string
  ) => Promise<void>;
}

const INVALID_REASONS = [
  { value: "lokasi-tidak-sesuai", label: "Lokasi tidak sesuai" },
  { value: "foto-tidak-valid", label: "Foto tidak valid" },
  { value: "indikasi-kecurangan", label: "Indikasi kecurangan" },
  { value: "salah-tap", label: "Salah tap absen" },
  { value: "data-ganda", label: "Data ganda" },
  { value: "lainnya", label: "Lainnya" },
];

export function MarkAttendanceInvalidDialog({
  open,
  onOpenChange,
  attendanceRecord,
  onConfirm,
}: MarkAttendanceInvalidDialogProps) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    if (!reason) {
      setError("Pilih alasan penandaan");
      return;
    }

    if (!attendanceRecord) return;

    try {
      setLoading(true);
      setError("");
      await onConfirm(attendanceRecord.id, reason, note);
      toast({
        title: "Berhasil ditandai",
        description: "Absensi telah ditandai tidak valid.",
      });
      onOpenChange(false);
      setReason("");
      setNote("");
    } catch (error: any) {
      const message = error.message || "Gagal menandai absensi tidak valid";
      setError(message);
      toast({
        title: "Gagal",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onOpenChange(false);
      setReason("");
      setNote("");
      setError("");
    }
  };

  if (!attendanceRecord) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            Tandai Absensi Tidak Valid?
          </DialogTitle>
          <DialogDescription>
            Absensi ini akan ditandai tidak valid dan tidak dihitung dalam rekap
            payroll. Data asli tetap disimpan sebagai audit.
          </DialogDescription>
        </DialogHeader>

        {/* Attendance info */}
        <div className="bg-slate-50 dark:bg-slate-900/30 p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
          <p className="text-sm">
            <span className="text-slate-600 dark:text-slate-400">Karyawan:</span>{" "}
            <span className="font-medium">{attendanceRecord.name}</span>
          </p>
          <p className="text-sm">
            <span className="text-slate-600 dark:text-slate-400">ID:</span>{" "}
            <span className="font-medium">{attendanceRecord.employeeNumber}</span>
          </p>
          <p className="text-sm">
            <span className="text-slate-600 dark:text-slate-400">Jam Masuk:</span>{" "}
            <span className="font-medium">{attendanceRecord.tapIn}</span>
          </p>
        </div>

        {/* Form */}
        <div className="space-y-4">
          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason" className="text-sm font-medium">
              Alasan Penandaan *
            </Label>
            <Select value={reason} onValueChange={setReason} disabled={loading}>
              <SelectTrigger id="reason">
                <SelectValue placeholder="Pilih alasan..." />
              </SelectTrigger>
              <SelectContent>
                {INVALID_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="note" className="text-sm font-medium">
              Catatan (Opsional)
            </Label>
            <Textarea
              id="note"
              placeholder="Tambahkan catatan detail tentang penandaan ini..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={loading}
              className="min-h-[80px] resize-none"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Maksimal 500 karakter
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={loading}
          >
            Batal
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={loading || !reason}
            className="gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Tandai Tidak Valid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
