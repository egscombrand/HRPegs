"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertCircle, CheckCircle2, Search } from "lucide-react";
import type { EmployeeProfile } from "@/lib/types";
import {
  findEmployeeProfile,
  normalizeEmployeeNumber,
  extractProfileSyncData,
} from "@/lib/attendance-sync";

interface AttendanceSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attendanceRecord: {
    id: string;
    employeeNumber?: string;
    email?: string;
    name?: string;
  } | null;
  employeeProfiles: EmployeeProfile[];
  onSync: (
    attendanceUid: string,
    selectedProfileId: string
  ) => Promise<void>;
}

type SyncStep = "search" | "select" | "success" | "error";

export function AttendanceSyncDialog({
  open,
  onOpenChange,
  attendanceRecord,
  employeeProfiles,
  onSync,
}: AttendanceSyncDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<SyncStep>("search");

  // Auto-fill with attendance record data if available
  const initialSearchInput = attendanceRecord?.employeeNumber || attendanceRecord?.email || "";
  const initialSearchBy = attendanceRecord?.employeeNumber ? "employeeNumber" : "email";

  const [searchInput, setSearchInput] = useState(initialSearchInput);
  const [searchBy, setSearchBy] = useState<"employeeNumber" | "email">(
    initialSearchBy as "employeeNumber" | "email"
  );
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const searchResults = useMemo(() => {
    if (!searchInput.trim()) return [];

    const criteria: any = {};
    if (searchBy === "employeeNumber") {
      criteria.employeeNumber = searchInput;
    } else if (searchBy === "email") {
      criteria.email = searchInput;
    }

    return findEmployeeProfile(employeeProfiles, criteria);
  }, [searchInput, searchBy, employeeProfiles]);

  const handleSearch = (value: string) => {
    setSearchInput(value);
    setErrorMessage("");
    setSelectedProfileId("");
  };

  const handleNext = async () => {
    if (!selectedProfileId) {
      setErrorMessage("Pilih satu profil karyawan");
      return;
    }

    if (!attendanceRecord) return;

    try {
      setLoading(true);
      await onSync(attendanceRecord.id, selectedProfileId);
      setStep("success");
      setTimeout(() => {
        onOpenChange(false);
        setStep("search");
        setSearchInput("");
        setSelectedProfileId("");
      }, 2000);
    } catch (error: any) {
      setErrorMessage(
        error.message || "Gagal sinkronisasi. Silakan coba lagi."
      );
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onOpenChange(false);
      setStep("search");
      setSearchInput("");
      setSelectedProfileId("");
      setErrorMessage("");
    }
  };

  if (!attendanceRecord) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sinkronkan Profil Karyawan</DialogTitle>
          <DialogDescription>
            Cari dan hubungkan data absensi dengan profil karyawan di sistem
          </DialogDescription>
        </DialogHeader>

        {step === "search" && (
          <div className="space-y-4">
            {/* Display current attendance record info */}
            <div className="bg-slate-50 dark:bg-slate-900/30 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
              <p className="text-sm font-medium text-slate-900 dark:text-white mb-2">
                Data Absensi:
              </p>
              <div className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
                <p>ID Pengguna: <span className="font-mono">{attendanceRecord.id.substring(0, 8)}...</span></p>
                {attendanceRecord.employeeNumber && (
                  <p>No. Identitas: {attendanceRecord.employeeNumber}</p>
                )}
                {attendanceRecord.email && (
                  <p>Email: {attendanceRecord.email}</p>
                )}
                {attendanceRecord.name && (
                  <p>Nama: {attendanceRecord.name}</p>
                )}
              </div>
            </div>

            {/* Search input */}
            <div className="space-y-3">
              <Label>Cari Profil Karyawan</Label>
              <div className="flex gap-2">
                <Select value={searchBy} onValueChange={(v: any) => setSearchBy(v)}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employeeNumber">No. Identitas / NIK</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder={
                      searchBy === "employeeNumber"
                        ? "Cari no. ID karyawan..."
                        : "Cari email..."
                    }
                    value={searchInput}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="pl-9"
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            {/* Error message */}
            {errorMessage && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 rounded-lg flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-300">{errorMessage}</p>
              </div>
            )}

            {/* Search results */}
            {searchInput.trim() && (
              <div className="space-y-2">
                {searchResults.length > 0 ? (
                  <div>
                    <Label className="text-xs">Hasil Pencarian ({searchResults.length})</Label>
                    <RadioGroup value={selectedProfileId} onValueChange={setSelectedProfileId}>
                      <div className="space-y-2 mt-2 max-h-[300px] overflow-y-auto">
                        {searchResults.map((profile) => (
                          <div
                            key={profile.id}
                            className="flex items-start gap-3 p-3 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900/30 cursor-pointer"
                            onClick={() => setSelectedProfileId(profile.id || "")}
                          >
                            <RadioGroupItem
                              value={profile.id || ""}
                              id={`profile-${profile.id}`}
                              className="mt-1"
                            />
                            <label
                              htmlFor={`profile-${profile.id}`}
                              className="flex-1 cursor-pointer"
                            >
                              <p className="font-medium text-slate-900 dark:text-white">
                                {profile.fullName ||
                                  profile.dataDiriIdentitas?.fullName ||
                                  "Nama tidak diatur"}
                              </p>
                              <div className="text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
                                <p>ID: {profile.employeeNumber || "(tidak diatur)"}</p>
                                {profile.email && <p>Email: {profile.email}</p>}
                                <p>
                                  Brand: {(profile as any).hrdEmploymentInfo?.brandName || profile.brandName || "-"}
                                </p>
                                <p>
                                  Divisi: {(profile as any).hrdEmploymentInfo?.divisionName || profile.division || "-"}
                                </p>
                              </div>
                            </label>
                          </div>
                        ))}
                      </div>
                    </RadioGroup>
                  </div>
                ) : searchInput.trim() ? (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 rounded-lg">
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      Tidak ada employee profile dengan{" "}
                      {searchBy === "employeeNumber" ? "ID" : "email"} ini.
                      <br />
                      Periksa Data Karyawan di menu Manajemen Karyawan.
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <CheckCircle2 className="h-12 w-12 text-green-600" />
            <div className="text-center">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
                Sinkronisasi Berhasil
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Profil karyawan telah terhubung dengan data absensi
              </p>
            </div>
          </div>
        )}

        {step === "error" && (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <AlertCircle className="h-12 w-12 text-red-600" />
            <div className="text-center">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
                Sinkronisasi Gagal
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {errorMessage || "Terjadi kesalahan. Silakan coba lagi."}
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "search" && (
            <>
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
                onClick={handleNext}
                disabled={!selectedProfileId || loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sinkronkan
              </Button>
            </>
          )}
          {(step === "success" || step === "error") && (
            <Button type="button" onClick={handleClose} className="w-full">
              Tutup
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
