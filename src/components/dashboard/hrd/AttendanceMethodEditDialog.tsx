"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, Monitor } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { AttendanceSettings } from "@/lib/attendance-methods";
import type { EmployeeProfile, AttendanceSite } from "@/lib/types";

const METHODS = [
  {
    value: "id_card",
    label: "ID Card",
    description: "Karyawan absen menggunakan ID Card / kartu identitas karyawan.",
    icon: CreditCard,
    color: "teal",
  },
  {
    value: "web_absen",
    label: "Web Absen",
    description: "Karyawan absen melalui web absen dengan foto selfie.",
    icon: Monitor,
    color: "blue",
  },
] as const;

interface AttendanceMethodEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: EmployeeProfile | null;
  sites: AttendanceSite[];
  onSave: (settings: AttendanceSettings) => Promise<void>;
}

export function AttendanceMethodEditDialog({
  open,
  onOpenChange,
  employee,
  onSave,
}: AttendanceMethodEditDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<"id_card" | "web_absen">(() => {
    const method = employee?.attendanceMethod as string;
    // Backward compatibility: treat "fingerprint" as "id_card"
    if (method === "fingerprint") return "id_card";
    if (method === "id_card") return "id_card";
    if (method === "web_absen") return "web_absen";
    return "id_card";
  });

  // Sync selected with current employee setting when dialog opens
  useEffect(() => {
    if (open) {
      const method = employee?.attendanceMethod as string;
      // Backward compatibility: treat "fingerprint" as "id_card"
      if (method === "fingerprint") {
        setSelected("id_card");
      } else if (method === "web_absen") {
        setSelected("web_absen");
      } else {
        setSelected("id_card");
      }
    }
  }, [open, employee?.attendanceMethod]);

  // Cleanup pointer-events and overflow when dialog closes — fixes freeze bug
  useEffect(() => {
    if (!open) {
      // Small delay to let Radix finish its own cleanup, then force-reset
      const t = setTimeout(() => {
        document.body.style.pointerEvents = "";
        document.body.style.overflow = "";
      }, 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleClose = () => {
    if (!loading) onOpenChange(false);
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      await onSave({
        method: selected,
        required: true,
        locationMode: "office_site",
        siteIds: [],
        policyNote: employee?.attendancePolicyNote || "",
      });
      toast({
        title: "Berhasil disimpan",
        description: `Metode absensi ${employee?.dataDiriIdentitas?.fullName || "karyawan"} diperbarui ke ${selected === "id_card" ? "ID Card" : "Web Absen"}.`,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving attendance settings:", error);
      toast({
        title: "Gagal menyimpan",
        description: "Terjadi kesalahan. Silakan coba lagi.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        <DialogHeader>
          <DialogTitle className="text-slate-900 dark:text-white text-base font-bold">
            Atur Metode Absensi
            {employee?.dataDiriIdentitas?.fullName && (
              <span className="ml-1 font-normal text-slate-500 dark:text-slate-400 text-sm">
                — {employee.dataDiriIdentitas.fullName}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="py-2 space-y-3">
          {METHODS.map(({ value, label, description, icon: Icon, color }) => {
            const isSelected = selected === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setSelected(value)}
                className={[
                  "w-full flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all",
                  isSelected
                    ? color === "teal"
                      ? "border-teal-500 bg-teal-50 dark:bg-teal-900/20"
                      : "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600",
                ].join(" ")}
              >
                <div
                  className={[
                    "flex-shrink-0 h-10 w-10 rounded-lg flex items-center justify-center",
                    isSelected
                      ? color === "teal"
                        ? "bg-teal-100 dark:bg-teal-800 text-teal-600 dark:text-teal-300"
                        : "bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300"
                      : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400",
                  ].join(" ")}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={[
                      "font-semibold text-sm",
                      isSelected
                        ? color === "teal"
                          ? "text-teal-700 dark:text-teal-300"
                          : "text-blue-700 dark:text-blue-300"
                        : "text-slate-900 dark:text-white",
                    ].join(" ")}
                  >
                    {label}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {description}
                  </p>
                </div>
                {isSelected && (
                  <div
                    className={[
                      "flex-shrink-0 h-5 w-5 rounded-full flex items-center justify-center",
                      color === "teal"
                        ? "bg-teal-500"
                        : "bg-blue-500",
                    ].join(" ")}
                  >
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={loading}
            className="border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
          >
            Batal
          </Button>
          <Button
            type="button"
            disabled={loading}
            className="bg-teal-600 hover:bg-teal-700 text-white"
            onClick={handleSubmit}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
