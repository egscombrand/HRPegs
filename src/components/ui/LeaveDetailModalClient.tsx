"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, FileUp, Calendar, User, MapPin, AlertCircle, CheckCircle2, Clock, ShieldAlert, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { type LeaveRequest } from "@/lib/types";

interface LeaveDetailModalClientProps {
  isOpen: boolean;
  onClose: () => void;
  request: LeaveRequest | null;
}

export function LeaveDetailModalClient({
  isOpen,
  onClose,
  request,
}: LeaveDetailModalClientProps) {
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

  // Helper date formatting
  const formatDateSafe = (dateVal: any, formatStr: string) => {
    if (!dateVal) return "-";
    try {
      const date = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
      return format(date, formatStr, { locale: idLocale });
    } catch (e) {
      return "-";
    }
  };

  // Helper to determine status color/classes
  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "approved":
      case "approved_by_hrd":
        return "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
      case "active_leave":
        return "bg-blue-500/10 border-blue-500/20 text-blue-400";
      case "completed":
        return "bg-slate-500/10 border-slate-500/20 text-slate-400";
      case "cancelled":
        return "bg-gray-500/10 border-gray-500/20 text-gray-400";
      case "rejected_by_manager":
      case "rejected_by_hrd":
      case "rejected_by_director":
        return "bg-red-500/10 border-red-500/20 text-red-400";
      case "revision_requested":
      case "revision_requested_by_manager":
      case "revision_requested_by_director":
      case "revision_requested_by_hrd":
        return "bg-amber-500/10 border-amber-500/20 text-amber-400";
      default:
        return "bg-indigo-500/10 border-indigo-500/20 text-indigo-400";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending_manager":
      case "pending_manager_review":
        return "Menunggu Persetujuan Atasan";
      case "revision_requested":
      case "revision_requested_by_manager":
        return "Perlu Revisi Atasan";
      case "rejected_by_manager":
        return "Ditolak Atasan";
      case "pending_hrd":
      case "pending_hrd_review":
        return "Menunggu Verifikasi HRD";
      case "revision_requested_by_hrd":
        return "Perlu Revisi HRD";
      case "rejected_by_hrd":
        return "Ditolak HRD";
      case "approved":
      case "approved_by_hrd":
        return "Disetujui HRD";
      case "active_leave":
        return "Cuti Aktif";
      case "completed":
        return "Cuti Selesai";
      case "cancelled":
        return "Dibatalkan";
      default:
        return status;
    }
  };

  // Build the strict structured timeline
  const getTimelineSteps = (): {
    title: string;
    approver: string;
    status: "selesai" | "menunggu" | "ditolak" | "revisi" | "belum aktif";
    dateTime?: string;
    notes?: string;
  }[] => {
    const isManager = request.requesterStructuralPosition?.toLowerCase() === "division_manager";
    const steps: any[] = [];

    // Step 1: Diajukan oleh Karyawan / Manager Divisi
    steps.push({
      title: isManager ? "Diajukan oleh Manager Divisi" : "Diajukan oleh Karyawan",
      approver: request.employeeName || "Karyawan",
      status: "selesai",
      dateTime: request.submittedAtStr || formatDateSafe(request.createdAt, "EEEE, dd MMMM yyyy 'pukul' HH:mm"),
      notes: request.reason || undefined,
    });

    // Step 2: Persetujuan Atasan
    let step2Status: "selesai" | "menunggu" | "ditolak" | "revisi" | "belum aktif" = "belum aktif";
    let step2Notes = request.managerNotes || request.directorNotes || undefined;
    let step2DateTime = undefined;

    if (
      ["pending_manager", "pending_manager_review", "pending_director", "pending_director_review"].includes(
        request.status
      )
    ) {
      step2Status = "menunggu";
    } else if (["rejected_by_manager", "rejected_by_director"].includes(request.status)) {
      step2Status = "ditolak";
      step2DateTime = formatDateSafe(request.updatedAt, "dd MMM yyyy HH:mm");
    } else if (
      [
        "revision_requested",
        "revision_requested_by_manager",
        "revision_requested_by_director",
      ].includes(request.status)
    ) {
      step2Status = "revisi";
      step2DateTime = formatDateSafe(request.updatedAt, "dd MMM yyyy HH:mm");
    } else if (request.status === "cancelled") {
      step2Status = "belum aktif";
    } else {
      step2Status = "selesai";
      step2DateTime = formatDateSafe(request.updatedAt, "dd MMM yyyy HH:mm");
    }

    steps.push({
      title: isManager ? "Persetujuan Direktur/Manajemen" : "Persetujuan Manager Divisi",
      approver: request.managerName || "Atasan Langsung",
      status: step2Status,
      dateTime: step2DateTime,
      notes: step2Notes,
    });

    // Step 3: Verifikasi & Approval HRD
    let step3Status: "selesai" | "menunggu" | "ditolak" | "revisi" | "belum aktif" = "belum aktif";
    let step3Notes = request.hrdNotes || undefined;
    let step3DateTime = undefined;

    if (step2Status === "selesai") {
      if (["pending_hrd", "pending_hrd_review"].includes(request.status)) {
        step3Status = "menunggu";
      } else if (request.status === "rejected_by_hrd") {
        step3Status = "ditolak";
        step3DateTime = formatDateSafe(request.updatedAt, "dd MMM yyyy HH:mm");
      } else if (request.status === "revision_requested_by_hrd") {
        step3Status = "revisi";
        step3DateTime = formatDateSafe(request.updatedAt, "dd MMM yyyy HH:mm");
      } else if (["approved", "approved_by_hrd", "active_leave", "completed"].includes(request.status)) {
        step3Status = "selesai";
        step3DateTime = formatDateSafe(request.updatedAt, "dd MMM yyyy HH:mm");
      }
    }

    steps.push({
      title: "Verifikasi & Approval HRD",
      approver: request.hrdName || "HRD Admin",
      status: step3Status,
      dateTime: step3DateTime,
      notes: step3Notes,
    });

    // Step 4: Status Realisasi Cuti
    let step4Status: "selesai" | "menunggu" | "ditolak" | "revisi" | "belum aktif" = "belum aktif";
    let step4Notes = undefined;
    let step4DateTime = `${formatDateSafe(request.startDate, "dd MMM yyyy")} s/d ${formatDateSafe(request.endDate, "dd MMM yyyy")}`;

    if (step3Status === "selesai") {
      if (request.status === "active_leave") {
        step4Status = "selesai";
        step4Notes = "Cuti Sedang Berlangsung";
      } else if (request.status === "completed") {
        step4Status = "selesai";
        step4Notes = "Cuti Telah Selesai Terlaksana";
      } else if (["approved", "approved_by_hrd"].includes(request.status)) {
        step4Status = "menunggu";
        step4Notes = "Menunggu Tanggal Mulai Cuti";
      }
    }

    steps.push({
      title: "Status Realisasi Cuti",
      approver: "Sistem HRP",
      status: step4Status,
      dateTime: step4DateTime,
      notes: step4Notes,
    });

    return steps;
  };

  const timelineSteps = getTimelineSteps();

  const getStepStatusIcon = (status: string) => {
    switch (status) {
      case "selesai":
        return <CheckCircle2 className="h-5 w-5 text-emerald-500 bg-white dark:bg-slate-950 rounded-full" />;
      case "menunggu":
        return <Clock className="h-5 w-5 text-amber-500 bg-white dark:bg-slate-950 rounded-full animate-pulse" />;
      case "ditolak":
        return <AlertCircle className="h-5 w-5 text-red-500 bg-white dark:bg-slate-950 rounded-full" />;
      case "revisi":
        return <ShieldAlert className="h-5 w-5 text-amber-400 bg-white dark:bg-slate-950 rounded-full" />;
      case "belum aktif":
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950" />;
    }
  };

  const getStepStatusBadge = (status: string) => {
    switch (status) {
      case "selesai":
        return <Badge className="bg-emerald-500/10 border-emerald-500/20 text-emerald-400 text-[10px]">Selesai</Badge>;
      case "menunggu":
        return <Badge className="bg-amber-500/10 border-amber-500/20 text-amber-400 text-[10px] animate-pulse">Menunggu</Badge>;
      case "ditolak":
        return <Badge className="bg-red-500/10 border-red-500/20 text-red-400 text-[10px]">Ditolak</Badge>;
      case "revisi":
        return <Badge className="bg-amber-400/10 border-amber-400/20 text-amber-300 text-[10px]">Revisi</Badge>;
      case "belum aktif":
      default:
        return <Badge variant="outline" className="text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700 text-[10px]">Belum Aktif</Badge>;
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4">
      {/* Box Modal */}
      <div className="w-full max-w-4xl max-h-[85vh] bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col text-slate-900 dark:text-slate-100">

        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 p-5 flex justify-between items-start z-20">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-black text-slate-900 dark:text-slate-50 tracking-tight">
                Detail Pengajuan Cuti
              </h2>
              <Badge
                variant="outline"
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-wider ${getStatusBadgeClass(
                  request.status
                )}`}
              >
                {getStatusLabel(request.status)}
              </Badge>
            </div>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              Pengaju: <span className="text-slate-900 dark:text-slate-200 font-bold">{request.employeeName}</span> | Unit: {request.divisionName || "-"} / {request.brandName || "-"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto max-h-[calc(85vh-140px)] p-5 space-y-5 flex-1">
          
          {/* Main Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1">
              <span className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-wider block">Jenis Cuti</span>
              <p className="text-sm font-black text-indigo-600 dark:text-indigo-400 capitalize">
                Cuti {request.leaveType === "tahunan" ? "Tahunan" : request.leaveType || "Tahunan"}
              </p>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1">
              <span className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-wider block">Periode Cuti</span>
              <p className="text-xs font-black text-slate-900 dark:text-slate-200">
                {formatDateSafe(request.startDate, "dd MMMM yyyy")} s/d {formatDateSafe(request.endDate, "dd MMMM yyyy")}
              </p>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1">
              <span className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-wider block">Total Durasi</span>
              <p className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                {request.durationDays} Hari Kerja
              </p>
            </div>
          </div>

          {/* Details Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-500 uppercase tracking-wider block">Alasan Cuti</span>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800/80 p-3 rounded-lg min-h-[60px]">
                {request.reason || "-"}
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-500 uppercase tracking-wider block">Alamat Selama Cuti</span>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800/80 p-3 rounded-lg min-h-[60px]">
                {request.leaveAddress || "-"}
              </div>
            </div>
          </div>

          {/* Handover & Delegations */}
          <div className="p-4 bg-indigo-50 dark:bg-indigo-950/10 border border-indigo-200 dark:border-indigo-900/30 rounded-xl space-y-4">
            <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 border-b border-indigo-200 dark:border-indigo-900/20 pb-2">
              <User className="h-4 w-4" />
              <span className="text-xs font-black uppercase tracking-wider">Delegasi Tugas & Kontak Darurat</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase block">Pengganti Sementara</span>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-200 mt-1">
                  {request.handoverEmployeeName || "-"}
                </p>
                {request.handoverEmployeePosition && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    {request.handoverEmployeePosition}
                  </p>
                )}
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase block">Kontak Darurat</span>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-200 mt-1">
                  {request.emergencyContactName || "-"}
                </p>
                {request.emergencyContactPhone && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    {request.emergencyContactPhone}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-1 pt-3 border-t border-indigo-200 dark:border-indigo-900/20">
              <span className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase block">Catatan Serah Terima Tugas</span>
              <p className="text-xs text-slate-900 dark:text-slate-300 font-medium bg-indigo-100/30 dark:bg-slate-950/60 p-2.5 rounded-lg border border-indigo-200 dark:border-slate-900">
                {request.handoverNotes || "-"}
              </p>
            </div>
          </div>

          {/* Structured Approval Timeline */}
          <div className="p-4 bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
            <span className="text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest block">
              Timeline Alur Persetujuan
            </span>
            <div className="relative pl-6 space-y-6 before:absolute before:left-[9px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-300 dark:before:bg-slate-800">
              {timelineSteps.map((step, idx) => (
                <div key={idx} className="relative flex flex-col gap-1">
                  {/* Step Dot Icon */}
                  <div className="absolute -left-[22px] top-0.5 z-10">
                    {getStepStatusIcon(step.status)}
                  </div>
                  
                  {/* Step Header */}
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{step.title}</span>
                    {getStepStatusBadge(step.status)}
                  </div>

                  {/* Step Details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 text-[10px] text-slate-600 dark:text-slate-400 mt-0.5">
                    <div>
                      <span className="font-semibold">Personel: </span>
                      <span className="font-bold text-slate-900 dark:text-slate-300">{step.approver}</span>
                    </div>
                    {step.dateTime && (
                      <div className="sm:text-right">
                        <span className="font-semibold">Waktu: </span>
                        <span className="font-bold text-slate-900 dark:text-slate-300">{step.dateTime}</span>
                      </div>
                    )}
                  </div>

                  {/* Step Notes */}
                  {step.notes && (
                    <div className="text-[11px] font-medium text-slate-900 dark:text-slate-300 bg-slate-100 dark:bg-slate-950 p-2 rounded-lg border border-slate-200 dark:border-slate-900 mt-1 max-w-full break-words">
                      <span className="font-black text-slate-600 dark:text-slate-500">Catatan:</span> {step.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Attachment Document */}
          {request.attachmentUrl && (
            <div className="pt-1">
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
                  <FileUp className="mr-2 h-4 w-4" /> Lihat Dokumen Pendukung
                </a>
              </Button>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 p-4 flex justify-end z-20">
          <Button
            onClick={onClose}
            className="bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold rounded-xl px-6 border border-slate-300 dark:border-slate-700"
          >
            Tutup
          </Button>
        </div>

      </div>
    </div>,
    document.body
  );
}
