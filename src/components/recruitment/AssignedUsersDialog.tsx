'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, Search, Users, UserCheck, X, Info, Building2, AlertCircle,
} from 'lucide-react';
import type { Job, UserProfile, Brand, EmployeeProfile } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { useAuth as useFirebaseAuth, useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { getInitials, cn } from '@/lib/utils';
import { normalizeEmployeeRow } from '@/lib/employee-row-normalizer';

interface AssignedUsersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  currentUser: UserProfile;
  allUsers: UserProfile[];
  allBrands: Brand[];
  onSuccess: () => void;
}

// ── Role display ──────────────────────────────────────────────────────────────
const ROLE_LABEL: Record<string, string> = {
  'super-admin': 'Super Admin',
  'hrd': 'HRD',
  'manager': 'Manager',
  'karyawan': 'Karyawan',
};
const ROLE_COLOR: Record<string, string> = {
  'super-admin': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'hrd': 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  'manager': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'karyawan': 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

// ── Enriched user type (user + fresh employee_profiles data) ─────────────────
type EnrichedUser = UserProfile & {
  _brandName: string;
  _brandId: string;
  _divisionLabel: string;
  _positionLabel: string;
  _profileFound: boolean;
};

/**
 * Merge a UserProfile with the latest employee_profiles data.
 * Priority: employee_profiles.hrdEmploymentInfo > UserProfile fields.
 * Uses normalizeEmployeeRow (same logic as Data Karyawan page).
 */
function normalizeUserForRecruitmentTeam(
  user: UserProfile,
  employeeProfileMap: Map<string, EmployeeProfile>,
  brands: Brand[],
): EnrichedUser {
  const profile = employeeProfileMap.get(user.uid);
  const normalized = normalizeEmployeeRow(
    {},       // no EmployeeMasterData — use profile + user
    profile ?? null,
    user,
    brands,
  );

  return {
    ...user,
    _brandName: normalized.brandName || '',
    _brandId: normalized.brandId || '',
    _divisionLabel: normalized.divisi || '',
    _positionLabel: normalized.jabatan || '',
    _profileFound: !!profile,
  };
}

// ── User row ──────────────────────────────────────────────────────────────────
function UserRow({
  user, isSelected, onToggle, isCurrentUser,
}: {
  user: EnrichedUser;
  isSelected: boolean;
  onToggle: () => void;
  isCurrentUser: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && onToggle()}
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-all duration-150',
        isSelected
          ? 'border-teal-300 bg-teal-50/60 dark:border-teal-700 dark:bg-teal-950/30'
          : 'border-transparent hover:border-slate-200 hover:bg-accent dark:hover:border-slate-700',
      )}
    >
      <Checkbox
        checked={isSelected}
        className="mt-0.5 pointer-events-none"
        aria-label={`Pilih ${user.fullName}`}
      />
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarFallback className="text-xs bg-slate-200 dark:bg-slate-700">
          {getInitials(user.fullName)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold truncate">{user.fullName}</span>
          {isCurrentUser && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 font-semibold shrink-0">
              Anda
            </span>
          )}
          {isSelected && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-600 text-white font-semibold shrink-0">
              Terpilih
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</p>
        {!user._profileFound && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> Profil karyawan tidak ditemukan
          </p>
        )}
        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          {user._positionLabel && (
            <span className="text-xs text-foreground/70">{user._positionLabel}</span>
          )}
          {user._positionLabel && user._divisionLabel && (
            <span className="text-xs text-muted-foreground">·</span>
          )}
          {user._divisionLabel && (
            <span className="text-xs text-muted-foreground">{user._divisionLabel}</span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className={cn(
          'text-[10px] px-2 py-0.5 rounded-full font-semibold',
          ROLE_COLOR[user.role] || ROLE_COLOR['karyawan'],
        )}>
          {ROLE_LABEL[user.role] || user.role}
        </span>
        {user._brandName && (
          <span className="text-[11px] text-muted-foreground max-w-[120px] truncate text-right">
            {user._brandName}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────
export function AssignedUsersDialog({
  open, onOpenChange, job, currentUser, allUsers, allBrands, onSuccess,
}: AssignedUsersDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [divisionFilter, setDivisionFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [tab, setTab] = useState<'all' | 'selected'>('all');

  const { toast } = useToast();
  const { firebaseUser } = useAuth();
  const auth = useFirebaseAuth();
  const router = useRouter();
  const firestore = useFirestore();

  // ── Fetch employee_profiles (fresh, always re-queried when modal opens) ──
  const employeeProfilesRef = useMemoFirebase(
    () => collection(firestore, 'employee_profiles'),
    [firestore],
  );
  const { data: employeeProfiles, isLoading: profilesLoading } =
    useCollection<EmployeeProfile>(employeeProfilesRef);

  // Build uid → EmployeeProfile map
  // employee_profiles docs may have uid as doc.id OR as a uid field (legacy)
  const employeeProfileMap = useMemo(() => {
    const map = new Map<string, EmployeeProfile>();
    (employeeProfiles || []).forEach((ep) => {
      const uid = ep.uid || (ep as any).id;
      if (uid) map.set(uid, ep);
    });
    return map;
  }, [employeeProfiles]);

  const brandMap = useMemo(
    () => new Map(allBrands.map((b) => [b.id!, b.name])),
    [allBrands],
  );

  // ── Enrich users with fresh employee_profiles data ────────────────────────
  const enrichedUsers = useMemo<EnrichedUser[]>(() => {
    if (profilesLoading) return [];
    return allUsers.map((u) =>
      normalizeUserForRecruitmentTeam(u, employeeProfileMap, allBrands),
    );
  }, [allUsers, employeeProfileMap, allBrands, profilesLoading]);

  // Derive unique brands/divisions from ENRICHED data (fresh from employee_profiles)
  const enrichedBrands = useMemo(() => {
    const seen = new Map<string, string>(); // brandId → brandName
    enrichedUsers.forEach((u) => {
      if (u._brandId && u._brandName) seen.set(u._brandId, u._brandName);
    });
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [enrichedUsers]);

  const divisions = useMemo(() => {
    const set = new Set<string>();
    enrichedUsers.forEach((u) => { if (u._divisionLabel) set.add(u._divisionLabel); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [enrichedUsers]);

  // ── Reset state on open ───────────────────────────────────────────────────
  useEffect(() => {
    if (open && job) {
      setSelectedUserIds(job.assignedUserIds || []);
      setSearch('');
      setBrandFilter('all');
      setDivisionFilter('all');
      setRoleFilter('all');
      setTab('all');
    }
  }, [open, job]);

  // ── Filter list ───────────────────────────────────────────────────────────
  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    return enrichedUsers.filter((u) => {
      if (brandFilter !== 'all' && u._brandId !== brandFilter) return false;
      if (divisionFilter !== 'all' && u._divisionLabel !== divisionFilter) return false;
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (q) {
        return (
          u.fullName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u._positionLabel.toLowerCase().includes(q) ||
          u._divisionLabel.toLowerCase().includes(q) ||
          u._brandName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [enrichedUsers, search, brandFilter, divisionFilter, roleFilter]);

  const selectedUsers = useMemo(
    () => selectedUserIds
      .map((id) => enrichedUsers.find((u) => u.uid === id))
      .filter(Boolean) as EnrichedUser[],
    [selectedUserIds, enrichedUsers],
  );

  const displayList = tab === 'selected' ? selectedUsers : filteredUsers;

  const toggleUser = (uid: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid],
    );
  };

  const removeSelected = (uid: string) => {
    setSelectedUserIds((prev) => prev.filter((id) => id !== uid));
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!job || !firebaseUser) return;
    setIsSaving(true);
    try {
      const idToken = await firebaseUser.getIdToken(true);

      // Build snapshot from FRESH employee_profiles data for audit trail
      const assignedStaffSnapshot = selectedUserIds.map((uid) => {
        const user = enrichedUsers.find((u) => u.uid === uid);
        return user ? {
          uid,
          name: user.fullName,
          email: user.email,
          position: user._positionLabel,
          brandName: user._brandName,
          divisionName: user._divisionLabel,
          syncedAt: new Date().toISOString(),
        } : { uid, syncedAt: new Date().toISOString() };
      });

      const response = await fetch(`/api/admin/jobs/${job.id}/assign-users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          userIds: selectedUserIds,
          assignedStaffSnapshot,
        }),
      });

      if (response.status === 401) {
        toast({ variant: 'destructive', title: 'Sesi Habis', description: 'Sesi Anda telah berakhir. Silakan login kembali.' });
        await auth.signOut();
        router.push('/admin/login');
        return;
      }

      if (!response.ok) {
        let errorMsg = 'Gagal menyimpan data. Silakan coba lagi.';
        try { errorMsg = (await response.json()).error || errorMsg; } catch {}
        throw new Error(errorMsg);
      }

      toast({
        title: 'Tim rekrutmen berhasil diperbarui.',
        description: `${selectedUserIds.length} anggota ditugaskan ke lowongan ${job.position}.`,
      });
      onSuccess();
      onOpenChange(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Gagal Menyimpan', description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  if (!job) return null;

  const hasFilters = search || brandFilter !== 'all' || divisionFilter !== 'all' || roleFilter !== 'all';
  const isLoading = profilesLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-full p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">
        {/* ── Header ── */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 dark:bg-teal-900/40 shrink-0">
              <Users className="h-5 w-5 text-teal-600" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-bold">Kelola Tim Rekrutmen</DialogTitle>
              <DialogDescription className="mt-0.5 text-sm leading-relaxed">
                Pilih user internal yang akan membantu proses review, wawancara, dan penilaian kandidat pada lowongan ini.
              </DialogDescription>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant="outline" className="text-xs gap-1">
                  <Building2 className="h-3 w-3" />
                  {job.brandName || '—'}
                </Badge>
                <Badge variant="secondary" className="text-xs">{job.position}</Badge>
                {isLoading && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Memuat data karyawan terbaru...
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* ── Body ── */}
        <div className="flex flex-1 overflow-hidden">
          {/* ── Left: search + filter + list ── */}
          <div className="flex flex-col flex-1 min-w-0 border-r">
            {/* Filters */}
            <div className="px-4 py-3 space-y-2.5 border-b bg-slate-50/50 dark:bg-slate-950/20 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari nama, email, jabatan, brand..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Select value={brandFilter} onValueChange={setBrandFilter}>
                  <SelectTrigger className="h-8 text-xs w-auto min-w-[130px] flex-1">
                    <SelectValue placeholder="Semua Brand" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Brand</SelectItem>
                    {enrichedBrands.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={divisionFilter} onValueChange={setDivisionFilter}>
                  <SelectTrigger className="h-8 text-xs w-auto min-w-[130px] flex-1">
                    <SelectValue placeholder="Semua Divisi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Divisi</SelectItem>
                    {divisions.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="h-8 text-xs w-auto min-w-[120px] flex-1">
                    <SelectValue placeholder="Semua Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Role</SelectItem>
                    {Object.entries(ROLE_LABEL).map(([val, label]) => (
                      <SelectItem key={val} value={val}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {hasFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs px-2"
                    onClick={() => { setSearch(''); setBrandFilter('all'); setDivisionFilter('all'); setRoleFilter('all'); }}
                  >
                    <X className="h-3.5 w-3.5 mr-1" /> Reset
                  </Button>
                )}
              </div>
              <Tabs value={tab} onValueChange={(v) => setTab(v as 'all' | 'selected')}>
                <TabsList className="h-8 w-full">
                  <TabsTrigger value="all" className="flex-1 text-xs gap-1.5">
                    Semua User
                    <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-muted text-[10px] font-bold">
                      {filteredUsers.length}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="selected" className="flex-1 text-xs gap-1.5">
                    Tim Terpilih
                    {selectedUserIds.length > 0 && (
                      <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-teal-600 text-white text-[10px] font-bold">
                        {selectedUserIds.length}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* User list */}
            <ScrollArea className="flex-1">
              {isLoading ? (
                <div className="flex items-center justify-center p-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-3 text-sm text-muted-foreground">Memuat data karyawan terbaru...</span>
                </div>
              ) : (
                <div className="p-3 space-y-1.5">
                  {displayList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
                      <Users className="h-8 w-8 text-muted-foreground/40" />
                      <p className="text-sm font-medium text-muted-foreground">
                        {tab === 'selected' ? 'Belum ada anggota dipilih' : 'Tidak ada user ditemukan'}
                      </p>
                      {tab === 'all' && hasFilters && (
                        <p className="text-xs text-muted-foreground">Coba ubah filter pencarian</p>
                      )}
                    </div>
                  ) : (
                    displayList.map((user) => (
                      <UserRow
                        key={user.uid}
                        user={user}
                        isSelected={selectedUserIds.includes(user.uid)}
                        onToggle={() => toggleUser(user.uid)}
                        isCurrentUser={user.uid === currentUser.uid}
                      />
                    ))
                  )}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* ── Right: selected team summary ── */}
          <div className="w-72 shrink-0 flex flex-col">
            <div className="px-4 py-3 border-b bg-slate-50/50 dark:bg-slate-950/20 shrink-0">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-teal-600" />
                <span className="text-sm font-semibold">Tim Terpilih</span>
                <span className={cn(
                  'ml-auto inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-xs font-bold',
                  selectedUserIds.length > 0
                    ? 'bg-teal-600 text-white'
                    : 'bg-muted text-muted-foreground',
                )}>
                  {selectedUserIds.length}
                </span>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                {selectedUsers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center gap-1.5">
                    <Users className="h-6 w-6 text-muted-foreground/40" />
                    <p className="text-xs text-muted-foreground">Belum ada anggota tim</p>
                    <p className="text-[11px] text-muted-foreground/70">Pilih user dari daftar di sebelah kiri</p>
                  </div>
                ) : (
                  selectedUsers.map((user) => (
                    <div
                      key={user.uid}
                      className="flex items-start gap-2 rounded-lg bg-teal-50/60 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800 px-2.5 py-2"
                    >
                      <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                        <AvatarFallback className="text-[10px]">{getInitials(user.fullName)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{user.fullName}</p>
                        {user._positionLabel && (
                          <p className="text-[10px] text-muted-foreground truncate">{user._positionLabel}</p>
                        )}
                        {user._brandName && (
                          <p className="text-[10px] text-teal-600 dark:text-teal-400 truncate">{user._brandName}</p>
                        )}
                        {!user._profileFound && (
                          <p className="text-[10px] text-amber-600 truncate">Profil tidak ditemukan</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSelected(user.uid)}
                        className="shrink-0 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-600 transition-colors"
                        aria-label={`Hapus ${user.fullName} dari tim`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            <div className="p-3 border-t shrink-0">
              <div className="flex gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-2.5">
                <Info className="h-3.5 w-3.5 text-slate-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Data brand dan divisi diambil dari Data Karyawan terbaru secara real-time.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <DialogFooter className="px-6 py-4 border-t shrink-0 bg-slate-50/50 dark:bg-slate-950/20">
          <div className="flex items-center justify-between w-full gap-3">
            <p className="text-xs text-muted-foreground">
              {selectedUserIds.length === 0
                ? 'Belum ada anggota tim dipilih'
                : `${selectedUserIds.length} anggota tim akan ditugaskan`}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                Batal
              </Button>
              <Button
                className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5"
                onClick={handleSave}
                disabled={isSaving || isLoading}
              >
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
