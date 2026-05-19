"use client";

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import {
  EmailAuthProvider,
  getAuth,
  reauthenticateWithCredential,
  sendEmailVerification,
  updatePassword,
} from "firebase/auth";
import { doc } from "firebase/firestore";
import { useAuth } from "@/providers/auth-provider";
import { useDoc, useFirestore, useMemoFirebase } from "@/firebase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Key, ShieldCheck, Sparkles, User } from "lucide-react";
import type { Brand, Division } from "@/lib/types";

const PREFERRED_LANGUAGE_KEY = "account-settings-language";
const PREFERRED_TABLE_DENSITY_KEY = "account-settings-table-density";
const NOTIF_SETTINGS_KEY = "account-settings-notifications";

const languageOptions = [
  { value: "id-ID", label: "Bahasa Indonesia" },
  { value: "en-US", label: "English" },
];

const tableDensityOptions = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
];

function getOrganizationTitle(
  profile: NonNullable<ReturnType<typeof useAuth>["userProfile"]>,
) {
  return (
    profile.positionTitle ||
    profile.jobTitle ||
    profile.workRole ||
    (profile.structuralLevel === "management"
      ? "Manajemen"
      : profile.structuralLevel === "division_manager"
        ? "Manager Divisi"
        : profile.structuralLevel === "staff"
          ? "Staff"
          : undefined) ||
    (profile.role === "super-admin"
      ? "Administrator"
      : profile.role === "hrd"
        ? "HRD"
        : profile.role === "manager"
          ? "Manager"
          : profile.role === "kandidat"
            ? "Kandidat"
            : "Staff")
  );
}

export function AccountSettingsPage() {
  const { firebaseUser, userProfile, loading } = useAuth();
  const { setTheme, resolvedTheme } = useTheme();
  const firestore = useFirestore();

  const [themePreference, setThemePreference] = useState("system");
  const [language, setLanguage] = useState("id-ID");
  const [tableDensity, setTableDensity] = useState("comfortable");

  const [notifyLeave, setNotifyLeave] = useState(true);
  const [notifyOvertime, setNotifyOvertime] = useState(true);
  const [notifyPermission, setNotifyPermission] = useState(true);
  const [notifyRecruitment, setNotifyRecruitment] = useState(true);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const brandId = useMemo(() => {
    if (!userProfile?.brandId) return undefined;
    return Array.isArray(userProfile.brandId)
      ? userProfile.brandId[0]
      : userProfile.brandId;
  }, [userProfile?.brandId]);

  const divisionId = userProfile?.divisionId;

  const brandDocRef = useMemoFirebase(
    () => (brandId ? doc(firestore, "brands", brandId) : null),
    [firestore, brandId],
  );

  const divisionDocRef = useMemoFirebase(
    () =>
      brandId && divisionId
        ? doc(firestore, "brands", brandId, "divisions", divisionId)
        : null,
    [firestore, brandId, divisionId],
  );

  const { data: brandDoc } = useDoc<Brand>(brandDocRef);
  const { data: divisionDoc } = useDoc<Division>(divisionDocRef);

  useEffect(() => {
    if (resolvedTheme) {
      setThemePreference(resolvedTheme);
    }
  }, [resolvedTheme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedLanguage = window.localStorage.getItem(PREFERRED_LANGUAGE_KEY);
    const storedDensity = window.localStorage.getItem(
      PREFERRED_TABLE_DENSITY_KEY,
    );
    const storedNotif = window.localStorage.getItem(NOTIF_SETTINGS_KEY);

    if (storedLanguage) setLanguage(storedLanguage);
    if (storedDensity) setTableDensity(storedDensity);
    if (storedNotif) {
      try {
        const parsed = JSON.parse(storedNotif);
        setNotifyLeave(Boolean(parsed.leave));
        setNotifyOvertime(Boolean(parsed.overtime));
        setNotifyPermission(Boolean(parsed.permission));
        setNotifyRecruitment(Boolean(parsed.recruitment));
      } catch {
        // ignore invalid storage
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PREFERRED_LANGUAGE_KEY, language);
    window.localStorage.setItem(PREFERRED_TABLE_DENSITY_KEY, tableDensity);
    window.localStorage.setItem(
      NOTIF_SETTINGS_KEY,
      JSON.stringify({
        leave: notifyLeave,
        overtime: notifyOvertime,
        permission: notifyPermission,
        recruitment: notifyRecruitment,
      }),
    );
  }, [
    language,
    tableDensity,
    notifyLeave,
    notifyOvertime,
    notifyPermission,
    notifyRecruitment,
  ]);

  const organizationTitle = userProfile
    ? getOrganizationTitle(userProfile)
    : "Belum diatur";
  const roleLabel = userProfile?.role.replace(/-/g, " ") || "Belum diatur";
  const accountStatus = userProfile?.isActive ? "Aktif" : "Nonaktif";

  const brandName = userProfile?.brandName || brandDoc?.name;
  const divisionName = userProfile?.divisionName || divisionDoc?.name;

  const displayBrandName =
    brandName ||
    (Array.isArray(userProfile?.brandId) ? "Beberapa Brand" : "Belum diatur");
  const displayDivisionName = divisionName || "Belum diatur";

  const lastLogin = firebaseUser?.metadata?.lastSignInTime ?? "Tidak tersedia";
  const createdAt = userProfile?.createdAt
    ? new Date(userProfile.createdAt.seconds * 1000).toLocaleDateString(
        "id-ID",
        {
          day: "2-digit",
          month: "long",
          year: "numeric",
        },
      )
    : "Belum diatur";

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timeZoneLabel =
    timeZone === "Asia/Jakarta" ? "Asia/Jakarta / WIB" : timeZone;

  const isPasswordProvider = Boolean(
    firebaseUser?.providerData?.some(
      (provider) => provider.providerId === "password",
    ),
  );

  const handleSavePassword = async () => {
    setPasswordMessage(null);
    setPasswordError(null);

    if (!firebaseUser?.email) {
      setPasswordError("Email pengguna tidak tersedia untuk verifikasi.");
      return;
    }

    if (!oldPassword.trim()) {
      setPasswordError("Password lama wajib diisi.");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("Password baru harus minimal 8 karakter.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Konfirmasi password baru tidak cocok.");
      return;
    }

    if (!firebaseUser) return;

    setIsSavingPassword(true);

    try {
      const credential = EmailAuthProvider.credential(
        firebaseUser.email,
        oldPassword,
      );
      await reauthenticateWithCredential(firebaseUser, credential);
      await updatePassword(firebaseUser, newPassword);
      setPasswordMessage("Kata sandi berhasil diperbarui.");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setPasswordError(
        "Gagal memperbarui kata sandi. Pastikan password lama benar.",
      );
    } finally {
      setIsSavingPassword(false);
    }
  };

  if (loading) {
    return <div className="min-h-[60vh] p-4">Memuat Pengaturan Akun...</div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="rounded-3xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              <Sparkles className="h-4 w-4" /> Pengaturan Akun
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                Kelola akun Anda
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Keamanan, preferensi, dan notifikasi akun Anda tetap ringkas dan
                profesional.
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="rounded-full px-3 py-1.5">
            Role Sistem: {roleLabel}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.95fr]">
        <div className="grid gap-4">
          <Card className="border border-border bg-background">
            <CardContent className="space-y-5 p-5">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  {userProfile?.photoUrl ? (
                    <AvatarImage
                      src={userProfile.photoUrl}
                      alt={userProfile.fullName}
                    />
                  ) : (
                    <AvatarFallback>
                      {userProfile?.fullName
                        .split(" ")
                        .map((segment) => segment[0])
                        .slice(0, 2)
                        .join("")}
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className="min-w-0">
                  <p className="text-lg font-semibold">
                    {userProfile?.fullName || "Belum diisi"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {userProfile?.email || "Email tidak tersedia"}
                  </p>
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                    <User className="h-3.5 w-3.5" /> {organizationTitle}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border bg-card p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Role Sistem
                  </p>
                  <p className="mt-1 text-sm">{roleLabel}</p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Brand
                  </p>
                  <p className="mt-1 text-sm">{displayBrandName}</p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Divisi
                  </p>
                  <p className="mt-1 text-sm">{displayDivisionName}</p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Status Akun
                  </p>
                  <p className="mt-1 text-sm">{accountStatus}</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border bg-card p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Terakhir Login
                  </p>
                  <p className="mt-1 text-sm">{lastLogin}</p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Akun Dibuat
                  </p>
                  <p className="mt-1 text-sm">{createdAt}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border bg-background">
            <CardHeader>
              <CardTitle>Akses & Role</CardTitle>
              <CardDescription>
                Jabatan organisasi dan ringkasan hak akses Anda.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <Briefcase className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Jabatan Organisasi</p>
                    <p className="text-sm text-muted-foreground">
                      {organizationTitle}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Role Sistem</p>
                    <p className="text-sm text-muted-foreground">{roleLabel}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-sm text-muted-foreground">
                  Role dan jabatan tidak dapat diubah dari halaman ini. Hubungi
                  HRD/Admin untuk perubahan akses.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4">
          <Card className="border border-border bg-background">
            <CardHeader>
              <CardTitle>Keamanan Login</CardTitle>
              <CardDescription>
                Ubah kata sandi akun Anda dengan verifikasi password lama.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <Key className="mt-1 h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Metode Login</p>
                    <p className="text-sm text-muted-foreground">
                      {isPasswordProvider
                        ? "Login menggunakan email dan password."
                        : "Akun menggunakan provider lain; perubahan password tidak tersedia."}
                    </p>
                  </div>
                </div>
              </div>

              {!isPasswordProvider ? (
                <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
                  Perubahan kata sandi tidak tersedia untuk metode login
                  non-password.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4">
                    <div className="space-y-1">
                      <Label>Password Lama</Label>
                      <Input
                        type="password"
                        value={oldPassword}
                        onChange={(event) => {
                          setOldPassword(event.target.value);
                          setPasswordError(null);
                          setPasswordMessage(null);
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Password Baru</Label>
                      <Input
                        type="password"
                        value={newPassword}
                        onChange={(event) => {
                          setNewPassword(event.target.value);
                          setPasswordError(null);
                          setPasswordMessage(null);
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Konfirmasi Password Baru</Label>
                      <Input
                        type="password"
                        value={confirmPassword}
                        onChange={(event) => {
                          setConfirmPassword(event.target.value);
                          setPasswordError(null);
                          setPasswordMessage(null);
                        }}
                      />
                    </div>
                  </div>

                  {passwordError && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                      {passwordError}
                    </div>
                  )}
                  {passwordMessage && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                      {passwordMessage}
                    </div>
                  )}

                  <Button
                    onClick={handleSavePassword}
                    disabled={isSavingPassword}
                    className="w-full"
                  >
                    {isSavingPassword ? "Menyimpan..." : "Simpan Password Baru"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border border-border bg-background">
            <CardHeader>
              <CardTitle>Preferensi</CardTitle>
              <CardDescription>
                Sesuaikan mode dan bahasa antarmuka.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div className="space-y-1">
                  <Label>Mode Gelap / Terang</Label>
                  <Select
                    value={themePreference}
                    onValueChange={(value) => {
                      setThemePreference(value);
                      setTheme(value);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">Sistem</SelectItem>
                      <SelectItem value="light">Terang</SelectItem>
                      <SelectItem value="dark">Gelap</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Bahasa Sistem</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih bahasa" />
                    </SelectTrigger>
                    <SelectContent>
                      {languageOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Tampilan Tabel</Label>
                  <Select value={tableDensity} onValueChange={setTableDensity}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih tampilan" />
                    </SelectTrigger>
                    <SelectContent>
                      {tableDensityOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Zona Waktu</Label>
                  <Input readOnly value={timeZoneLabel} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border bg-background">
            <CardHeader>
              <CardTitle>Notifikasi</CardTitle>
              <CardDescription>
                Aktifkan alert untuk aktivitas penting di akun Anda.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Approval Cuti</p>
                    <p className="text-sm text-muted-foreground">
                      Notifikasi pengajuan dan persetujuan cuti.
                    </p>
                  </div>
                  <Switch
                    checked={notifyLeave}
                    onCheckedChange={setNotifyLeave}
                  />
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Approval Lembur</p>
                    <p className="text-sm text-muted-foreground">
                      Notifikasi pengajuan dan persetujuan lembur.
                    </p>
                  </div>
                  <Switch
                    checked={notifyOvertime}
                    onCheckedChange={setNotifyOvertime}
                  />
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Approval Izin</p>
                    <p className="text-sm text-muted-foreground">
                      Notifikasi pengajuan dan persetujuan izin.
                    </p>
                  </div>
                  <Switch
                    checked={notifyPermission}
                    onCheckedChange={setNotifyPermission}
                  />
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Tugas / Rekrutmen</p>
                    <p className="text-sm text-muted-foreground">
                      Notifikasi untuk tugas dan proses rekrutmen.
                    </p>
                  </div>
                  <Switch
                    checked={notifyRecruitment}
                    onCheckedChange={setNotifyRecruitment}
                  />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Preferensi notifikasi hanya disimpan secara lokal di browser
                Anda.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
