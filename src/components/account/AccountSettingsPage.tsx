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
import { useAuth } from "@/providers/auth-provider";
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
import { Key, Clock, CheckCircle2, Settings } from "lucide-react";

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

export function AccountSettingsPage() {
  const { firebaseUser, userProfile, loading } = useAuth();
  const { setTheme, resolvedTheme } = useTheme();

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

  const roleLabel = userProfile?.role.replace(/-/g, " ") || "Belum diatur";
  const accountStatus = userProfile?.isActive ? "Aktif" : "Nonaktif";

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

      // Update Firestore to clear mustChangePassword flag and create audit log
      try {
        const idToken = await firebaseUser.getIdToken();
        const res = await fetch(
          `/api/users/${firebaseUser.uid}/password-changed`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${idToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!res.ok) {
          const errorData = await res.json();
          console.warn(
            'Failed to update password status in Firestore:',
            errorData.error
          );
        }
      } catch (firestoreError) {
        console.warn('Error calling password-changed endpoint:', firestoreError);
      }

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
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Pengaturan Akun</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Kelola keamanan, preferensi, dan notifikasi akun Anda.
        </p>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* Left Column - Account Summary */}
        <div className="space-y-6 lg:col-span-1">
          {/* Profil Akun Card */}
          <Card className="border border-border">
            <CardContent className="pt-6">
              <div className="space-y-4">
                {/* Avatar Section */}
                <div className="flex flex-col items-center">
                  <Avatar className="h-20 w-20 border-2 border-border">
                    {userProfile?.photoUrl ? (
                      <AvatarImage
                        src={userProfile.photoUrl}
                        alt={userProfile.fullName}
                      />
                    ) : (
                      <AvatarFallback className="text-lg font-semibold">
                        {userProfile?.fullName
                          .split(" ")
                          .map((segment) => segment[0])
                          .slice(0, 2)
                          .join("")}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <p className="mt-3 text-center font-semibold">
                    {userProfile?.fullName || "Belum diisi"}
                  </p>
                  <p className="text-center text-sm text-muted-foreground">
                    {userProfile?.email || "Email tidak tersedia"}
                  </p>
                </div>

                {/* Role Badge */}
                <div className="flex justify-center">
                  <Badge variant="secondary" className="rounded-full">
                    {roleLabel}
                  </Badge>
                </div>

                {/* Status */}
                <div className="rounded-lg border border-border bg-card p-3 text-center">
                  <p className="text-xs font-medium text-muted-foreground">
                    Status Akun
                  </p>
                  <p className="mt-1 text-sm font-semibold">{accountStatus}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Aktivitas Akun Card */}
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Aktivitas Akun</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Terakhir Masuk
                </p>
                <p className="mt-1 text-sm">
                  {lastLogin && lastLogin !== "Tidak tersedia"
                    ? new Date(lastLogin).toLocaleString("id-ID")
                    : "Belum login"}
                </p>
              </div>

              <div className="border-t border-border pt-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Akun Dibuat
                </p>
                <p className="mt-1 text-sm">{createdAt}</p>
              </div>

              <div className="border-t border-border pt-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Status Keamanan
                </p>
                <p className="mt-1 text-sm">
                  {isPasswordProvider
                    ? "Email & Password"
                    : "Provider Lain"}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Settings */}
        <div className="space-y-6 lg:col-span-2">

          {/* Keamanan Login Card */}
          <Card className="border border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Key className="h-4 w-4" />
                Keamanan Login
              </CardTitle>
              <CardDescription>
                Ubah kata sandi akun Anda dengan verifikasi password lama.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isPasswordProvider ? (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Perubahan kata sandi tidak tersedia untuk metode login non-password.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="old-password">Password Lama</Label>
                    <Input
                      id="old-password"
                      type="password"
                      value={oldPassword}
                      onChange={(event) => {
                        setOldPassword(event.target.value);
                        setPasswordError(null);
                        setPasswordMessage(null);
                      }}
                      placeholder="Masukkan password lama"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new-password">Password Baru</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(event) => {
                        setNewPassword(event.target.value);
                        setPasswordError(null);
                        setPasswordMessage(null);
                      }}
                      placeholder="Masukkan password baru (min. 8 karakter)"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Konfirmasi Password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => {
                        setConfirmPassword(event.target.value);
                        setPasswordError(null);
                        setPasswordMessage(null);
                      }}
                      placeholder="Konfirmasi password baru"
                    />
                  </div>

                  {passwordError && (
                    <div className="rounded-lg border border-rose-200 dark:border-rose-900/30 bg-rose-50 dark:bg-rose-950/20 p-3 text-sm text-rose-900 dark:text-rose-400">
                      {passwordError}
                    </div>
                  )}
                  {passwordMessage && (
                    <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/30 bg-emerald-50 dark:bg-emerald-950/20 p-3 text-sm text-emerald-900 dark:text-emerald-400">
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

          {/* Preferensi Card */}
          <Card className="border border-border">
            <CardHeader>
              <CardTitle className="text-base">Preferensi</CardTitle>
              <CardDescription>
                Sesuaikan mode, bahasa, dan tampilan antarmuka Anda.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="theme">Mode Tampilan</Label>
                <Select
                  value={themePreference}
                  onValueChange={(value) => {
                    setThemePreference(value);
                    setTheme(value);
                  }}
                >
                  <SelectTrigger id="theme">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">Sistem</SelectItem>
                    <SelectItem value="light">Terang</SelectItem>
                    <SelectItem value="dark">Gelap</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="language">Bahasa Sistem</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger id="language">
                    <SelectValue />
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

              <div className="space-y-2">
                <Label htmlFor="table-density">Tampilan Tabel</Label>
                <Select value={tableDensity} onValueChange={setTableDensity}>
                  <SelectTrigger id="table-density">
                    <SelectValue />
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

              <div className="space-y-2">
                <Label htmlFor="timezone">Zona Waktu</Label>
                <Input
                  id="timezone"
                  readOnly
                  value={timeZoneLabel}
                  className="bg-muted"
                />
              </div>
            </CardContent>
          </Card>

          {/* Notifikasi Card */}
          <Card className="border border-border">
            <CardHeader>
              <CardTitle className="text-base">Notifikasi</CardTitle>
              <CardDescription>
                Kelola notifikasi untuk aktivitas penting.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Approval Cuti</p>
                  <p className="text-xs text-muted-foreground">
                    Pengajuan dan persetujuan cuti
                  </p>
                </div>
                <Switch
                  checked={notifyLeave}
                  onCheckedChange={setNotifyLeave}
                />
              </div>

              <div className="border-t border-border pt-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Approval Lembur</p>
                    <p className="text-xs text-muted-foreground">
                      Pengajuan dan persetujuan lembur
                    </p>
                  </div>
                  <Switch
                    checked={notifyOvertime}
                    onCheckedChange={setNotifyOvertime}
                  />
                </div>
              </div>

              <div className="border-t border-border pt-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Approval Izin</p>
                    <p className="text-xs text-muted-foreground">
                      Pengajuan dan persetujuan izin
                    </p>
                  </div>
                  <Switch
                    checked={notifyPermission}
                    onCheckedChange={setNotifyPermission}
                  />
                </div>
              </div>

              <div className="border-t border-border pt-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Tugas & Rekrutmen</p>
                    <p className="text-xs text-muted-foreground">
                      Tugas dan proses rekrutmen
                    </p>
                  </div>
                  <Switch
                    checked={notifyRecruitment}
                    onCheckedChange={setNotifyRecruitment}
                  />
                </div>
              </div>

              <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                Preferensi notifikasi disimpan secara lokal di browser.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
