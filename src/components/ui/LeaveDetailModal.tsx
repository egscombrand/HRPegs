"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { type LeaveRequest } from "@/lib/types";

interface LeaveDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: LeaveRequest | null;
  currentUserUid: string;
  isPendingForCurrentApprover: (req: LeaveRequest, userUid: string) => boolean;
  onAction: (type: "approve" | "reject" | "revise", req: LeaveRequest) => void;
  formatSubmissionDate: (req: LeaveRequest) => string;
  formatPeriodDate: (req: LeaveRequest) => string;
  formatDuration: (req: LeaveRequest) => string;
  getRequesterLevel: (req: LeaveRequest) => string;
  getLevelBadgeClass: (level: string) => string;
  getLevelLabel: (level: string) => string;
  getStatusBadgeClass: (status: string) => string;
  getStatusLabel: (status: string) => string;
  getTimelineStepState: (
    req: LeaveRequest,
    step: "approval" | "hrd" | "realization",
  ) => string;
  getTimelineStepDetail: (
    req: LeaveRequest,
    step: "approval" | "hrd" | "realization",
  ) => string;
}

export function LeaveDetailModal({
  isOpen,
  onClose,
  request,
  currentUserUid,
  isPendingForCurrentApprover,
  onAction,
  formatSubmissionDate,
  formatPeriodDate,
  formatDuration,
  getRequesterLevel,
  getLevelBadgeClass,
  getLevelLabel,
  getStatusBadgeClass,
  getStatusLabel,
  getTimelineStepState,
  getTimelineStepDetail,
}: LeaveDetailModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen || !request || !mounted) return null;

  const isPending = isPendingForCurrentApprover(request, currentUserUid);
  const isManagerApplicant = getRequesterLevel(request) !== "division_manager";
  const approvalStepLabel = isManagerApplicant
    ? `Persetujuan Manager Divisi (${request.managerName || "Atasan Langsung"})`
    : `Persetujuan Direktur/Manajemen`;

  const timelineDotClass = (state: string) => {
    switch (state) {
      case "completed":
        return "bg-emerald-500";
      case "current":
        return "bg-amber-500 animate-pulse";
      case "rejected":
        return "bg-red-500";
      case "revision":
        return "bg-orange-500";
      default:
        return "bg-slate-700";
    }
  };

  const getTimelineStepLabel = (step: "approval" | "hrd" | "realization") => {
    if (step === "approval") return approvalStepLabel;
    if (step === "hrd") return "Verifikasi & Approval HRD";
    return "Realisasi Cuti";
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4">
      {/* Box Modal */}
      <div className="w-full max-w-4xl max-h-[85vh] bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col text-slate-900 dark:text-slate-100 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 p-5 flex items-start justify-between gap-4 z-20">
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-black text-slate-900 dark:text-slate-50 tracking-tight">
                {getRequesterLevel(request) === "division_manager"
                  ? "Detail Pengajuan Cuti Manager Divisi"
                  : "Detail Pengajuan Cuti"}
              </h2>
              <Badge
                variant="outline"
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-wider ${getStatusBadgeClass(request.status)}`}
              >
                {getStatusLabel(request.status)}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400 font-semibold">
              <span className="text-slate-900 dark:text-slate-100 font-black text-sm">
                {request.employeeName}
              </span>
              <span className="text-slate-400 dark:text-slate-700">|</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                {formatDuration(request)}
              </span>
              <span className="text-slate-400 dark:text-slate-700">|</span>
              <Badge
                className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${getLevelBadgeClass(
                  getRequesterLevel(request),
                )}`}
              >
                {getLevelLabel(getRequesterLevel(request))}
              </Badge>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto max-h-[calc(85vh-150px)] p-5 space-y-6 flex-1">
          {/* Grid info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800/80 space-y-1">
              <p className="text-[10px] font-black text-slate-600 dark:text-slate-500 uppercase tracking-wider">
                Jenis Cuti
              </p>
              <p className="text-sm font-black text-indigo-400 capitalize">
                Cuti{" "}
                {request.leaveType === "tahunan"
                  ? "Tahunan"
                  : request.leaveType === "besar"
                    ? "Besar"
                    : request.leaveType === "menikah"
                      ? "Menikah"
                      : request.leaveType === "melahirkan"
                        ? "Melahirkan"
                        : "Tahunan"}
              </p>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800/80 space-y-1">
              <p className="text-[10px] font-black text-slate-600 dark:text-slate-500 uppercase tracking-wider">
                Divisi & Brand
              </p>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-200">
                {request.divisionName || "-"} / {request.brandName || "-"}
              </p>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800/80 space-y-1">
              <p className="text-[10px] font-black text-slate-600 dark:text-slate-500 uppercase tracking-wider">
                Waktu Pengajuan
              </p>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {formatSubmissionDate(request)}
              </p>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800/80 space-y-1">
              <p className="text-[10px] font-black text-slate-600 dark:text-slate-500 uppercase tracking-wider">
                Periode Cuti
              </p>
              <p className="text-xs font-bold text-indigo-400">
                {formatPeriodDate(request)}
              </p>
            </div>
          </div>

          {/* Alasan & Alamat */}
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-600 dark:text-slate-500 uppercase tracking-wider">
                Alasan Cuti
              </p>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                {request.reason || "-"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-600 dark:text-slate-500 uppercase tracking-wider">
                Alamat Selama Cuti
              </p>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                {request.leaveAddress || "-"}
              </p>
            </div>
          </div>

          {/* Delegasi & Kontak Darurat */}
          <div className="p-4 bg-indigo-50 dark:bg-indigo-950/10 rounded-2xl border border-indigo-200 dark:border-indigo-900/20 space-y-4">
            <p className="text-xs font-black text-indigo-700 dark:text-indigo-400 uppercase tracking-widest">
              Pendelegasian Tugas & Kontak Darurat
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-black text-slate-600 dark:text-slate-500 uppercase">
                  Pengganti Sementara (Handover)
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-200 mt-1">
                  {request.handoverEmployeeName || "-"}
                </p>
                {request.handoverEmployeePosition && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-semibold mt-0.5">
                    {request.handoverEmployeePosition}
                  </p>
                )}
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-600 dark:text-slate-500 uppercase">
                  Kontak Darurat
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-200 mt-1">
                  {request.emergencyContactName || "-"}
                </p>
                {request.emergencyContactPhone && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-semibold mt-0.5">
                    {request.emergencyContactPhone}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-1 pt-2 border-t border-indigo-200 dark:border-indigo-900/10">
              <p className="text-[10px] font-black text-slate-600 dark:text-slate-500 uppercase tracking-wider">
                Catatan Serah Terima Tugas
              </p>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-300 bg-indigo-100/30 dark:bg-slate-950/50 p-3 rounded-lg border border-indigo-200 dark:border-slate-800/80">
                {request.handoverNotes || "-"}
              </p>
            </div>
          </div>

          {/* Timeline Persetujuan */}
          <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800/80 space-y-4">
            <p className="text-xs font-black text-slate-600 dark:text-slate-500 uppercase tracking-widest">
              Timeline Alur Persetujuan
            </p>
            <div className="relative pl-6 space-y-5 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-300 dark:before:bg-slate-800">
              {/* Milestone 1: Staff Submission */}
              <div className="relative">
                <div className="absolute -left-[20px] top-1 h-[12px] w-[12px] rounded-full bg-emerald-500 ring-4 ring-slate-950" />
                <div className="text-xs font-bold text-slate-900 dark:text-slate-200">
                  Diajukan oleh Staff
                </div>
                <div className="text-[10px] text-slate-600 dark:text-slate-500 font-medium mt-0.5">
                  {formatSubmissionDate(request)}
                </div>
              </div>

              {/* Milestone 2: Atasan/Supervisor Persetujuan */}
              {(["approval", "hrd", "realization"] as const).map((step) => {
                const state = getTimelineStepState(request, step);
                const detail = getTimelineStepDetail(request, step);
                const label = getTimelineStepLabel(step);

                return (
                  <div key={step} className="relative">
                    <div
                      className={`absolute -left-[20px] top-1 h-[12px] w-[12px] rounded-full ring-4 ring-slate-950 ${timelineDotClass(
                        state,
                      )}`}
                    />
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-200">
                      {label}
                    </div>
                    <div className="text-[10px] text-slate-600 dark:text-slate-400 font-medium mt-0.5">
                      {detail}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {request.attachmentUrl && (
            <div className="pt-2">
              <Button
                variant="outline"
                asChild
                className="w-full rounded-xl border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
              >
                <a
                  href={request.attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FileUp className="mr-2 h-4 w-4" /> Lihat Dokumen Lampiran
                </a>
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 p-4 flex justify-end z-20">
          <Button
            onClick={onClose}
            className="bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold rounded-xl px-5 border border-slate-300 dark:border-slate-700"
          >
            Tutup
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
