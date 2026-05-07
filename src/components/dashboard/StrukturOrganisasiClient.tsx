'use client';

import { useMemo, useState, useEffect } from 'react';
import { collection, query, where, doc, updateDoc, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { UserProfile, Brand, Division, StructuralLevel, ManagementScope } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/providers/auth-provider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
    Users, 
    Network, 
    ShieldCheck, 
    Plus, 
    Pencil, 
    ChevronRight, 
    Building2, 
    UserCheck,
    AlertCircle,
    Info,
    Search,
    Loader2,
    Trash2
} from 'lucide-react';
import { 
    Dialog, 
    DialogContent, 
    DialogDescription, 
    DialogFooter, 
    DialogHeader, 
    DialogTitle,
    DialogTrigger
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

export function StrukturOrganisasiClient() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const { userProfile } = useAuth();
    const [activeTab, setActiveTab] = useState('management');

    // Data fetching
    const usersRef = useMemoFirebase(() => collection(firestore, 'users'), [firestore]);
    const { data: users, isLoading: isLoadingUsers } = useCollection<UserProfile>(usersRef);

    const brandsRef = useMemoFirebase(() => collection(firestore, 'brands'), [firestore]);
    const { data: brands, isLoading: isLoadingBrands } = useCollection<Brand>(brandsRef);

    const isLoading = isLoadingUsers || isLoadingBrands;

    // Derived data
    const managementUsers = useMemo(() => 
        users?.filter(u => u.structuralLevel === 'management' || u.role === 'manager' && !u.structuralLevel) || [], 
    [users]);

    const divisionManagers = useMemo(() => 
        users?.filter(u => u.structuralLevel === 'division_manager') || [], 
    [users]);

    const staffUsers = useMemo(() => 
        users?.filter(u => u.structuralLevel === 'staff' || (!u.structuralLevel && u.role === 'karyawan')) || [], 
    [users]);

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-10 w-[400px]" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Skeleton className="h-[200px]" />
                    <Skeleton className="h-[200px]" />
                    <Skeleton className="h-[200px]" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <p className="text-muted-foreground">
                    Kelola hubungan kerja antar direktur/manajemen, manager divisi, staff, brand, divisi, dan atasan langsung.
                </p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3 lg:w-[600px]">
                    <TabsTrigger value="management" className="flex gap-2">
                        <ShieldCheck className="h-4 w-4" />
                        Direktur / Manajemen
                    </TabsTrigger>
                    <TabsTrigger value="division_manager" className="flex gap-2">
                        <UserCheck className="h-4 w-4" />
                        Manager Divisi
                    </TabsTrigger>
                    <TabsTrigger value="hierarchy" className="flex gap-2">
                        <Network className="h-4 w-4" />
                        Struktur Tim
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="management" className="space-y-4 pt-4">
                    <div className="flex justify-end">
                        <SyncRelationshipsButton users={users || []} brands={brands || []} />
                    </div>
                    <ManagementTab 
                        users={users || []} 
                        brands={brands || []} 
                        isSuperAdmin={userProfile?.role === 'super-admin'}
                    />
                </TabsContent>

                <TabsContent value="division_manager" className="space-y-4 pt-4">
                    <div className="flex justify-end">
                        <SyncRelationshipsButton users={users || []} brands={brands || []} />
                    </div>
                    <DivisionManagerTab 
                        users={users || []} 
                        brands={brands || []} 
                        managementUsers={managementUsers}
                    />
                </TabsContent>

                <TabsContent value="hierarchy" className="space-y-4 pt-4">
                    <div className="flex justify-end">
                        <SyncRelationshipsButton users={users || []} brands={brands || []} />
                    </div>
                    <HierarchyTab 
                        users={users || []} 
                        brands={brands || []} 
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
}

// --- UTILITY: SYNC BUTTON ---
function SyncRelationshipsButton({ users, brands }: { users: UserProfile[], brands: Brand[] }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isSyncing, setIsSyncing] = useState(false);

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const divisionManagers = users.filter(u => u.structuralLevel === 'division_manager');
            const staffUsers = users.filter(u => u.role === 'karyawan' && u.structuralLevel !== 'management' && u.structuralLevel !== 'division_manager');

            let updatedCount = 0;

            for (const staff of staffUsers) {
                // Ensure we handle brandId as a string for matching
                const staffBrandId = Array.isArray(staff.brandId) ? staff.brandId[0] : staff.brandId;
                const staffDivisionId = staff.divisionId;

                if (!staffBrandId || !staffDivisionId) continue;

                const manager = divisionManagers.find(dm => {
                    const dmBrandId = Array.isArray(dm.brandId) ? dm.brandId[0] : dm.brandId;
                    return dmBrandId === staffBrandId && dm.divisionId === staffDivisionId;
                });
                
                if (manager) {
                    const updateData = {
                        structuralLevel: 'staff' as StructuralLevel,
                        directSupervisorUid: manager.uid,
                        directSupervisorName: manager.fullName,
                        updatedAt: serverTimestamp()
                    };

                    await updateDoc(doc(firestore, 'users', staff.uid), updateData);
                    await setDoc(doc(firestore, 'employee_profiles', staff.uid), updateData, { merge: true });
                    updatedCount++;
                }
            }

            toast({ title: "Selesai", description: `${updatedCount} staff telah disinkronkan dengan atasan mereka.` });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Gagal", description: error.message });
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <Button variant="outline" size="sm" onClick={handleSync} disabled={isSyncing}>
            {isSyncing ? "Menyinkronkan..." : "Sinkronisasi Atasan Staff"}
        </Button>
    );
}

// --- HELPER: HIERARCHY PREVIEW ---
function HierarchyPreview({ 
    selectedUser, 
    selectedWorkRole, 
    currentScopes, 
    users 
}: { 
    selectedUser: UserProfile | null, 
    selectedWorkRole: string, 
    currentScopes: ManagementScope[],
    users: UserProfile[]
}) {
    if (!selectedUser && currentScopes.length === 0) return null;

    return (
        <div className="mt-8 space-y-4 p-6 rounded-2xl bg-slate-900 border-2 border-emerald-500/20 shadow-xl shadow-emerald-500/5">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                <Network className="h-5 w-5 text-emerald-500" />
                <h4 className="font-black text-white uppercase tracking-wider text-sm">Preview Hirarki Baru</h4>
            </div>

            <div className="space-y-6">
                {/* Director Node */}
                <div className="flex items-center gap-4 bg-emerald-500/10 p-4 rounded-xl border border-emerald-500/30">
                    <div className="h-10 w-10 rounded-lg bg-emerald-500 flex items-center justify-center text-white font-bold">
                        {selectedUser?.fullName?.charAt(0) || '?'}
                    </div>
                    <div>
                        <p className="text-xs text-emerald-400 font-bold uppercase tracking-widest">{selectedWorkRole || 'Jabatan Belum Dipilih'}</p>
                        <h5 className="font-black text-white text-base">{selectedUser?.fullName || 'User Belum Dipilih'}</h5>
                    </div>
                </div>

                {/* Scopes Mapping */}
                <div className="space-y-4 pl-4 border-l-2 border-slate-800 ml-5">
                    {currentScopes.map((scope, sIdx) => {
                        const managersInScope = users.filter(u => 
                            u.structuralLevel === 'division_manager' && 
                            u.brandId === scope.brandId && 
                            (scope.divisionIds.includes('all') || scope.divisionIds.includes(u.divisionId!))
                        );

                        return (
                            <div key={sIdx} className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <Building2 className="h-4 w-4 text-slate-500" />
                                    <span className="font-bold text-slate-300 text-sm">{scope.brandName}</span>
                                    <Badge variant="outline" className="text-[9px] py-0 h-4 border-slate-700 text-slate-500">
                                        {scope.divisionIds.includes('all') ? 'Seluruh Divisi' : scope.divisionNames.join(', ')}
                                    </Badge>
                                </div>

                                <div className="space-y-3 pl-4">
                                    {managersInScope.length > 0 ? managersInScope.map(dm => {
                                        const staffUnderDm = users.filter(u => 
                                            u.structuralLevel === 'staff' && 
                                            u.directSupervisorUid === dm.uid
                                        );

                                        return (
                                            <div key={dm.uid} className="space-y-2">
                                                <div className="flex items-center gap-3 bg-blue-500/5 p-3 rounded-lg border border-blue-500/20">
                                                    <UserCheck className="h-4 w-4 text-blue-400" />
                                                    <div>
                                                        <p className="text-[10px] text-blue-400 font-bold uppercase">{dm.divisionName || 'Manager Divisi'}</p>
                                                        <p className="text-sm font-bold text-white">{dm.fullName}</p>
                                                    </div>
                                                </div>

                                                {/* Staff Under Manager */}
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
                                                    {staffUnderDm.length > 0 ? staffUnderDm.map(s => (
                                                        <div key={s.uid} className="flex items-center gap-2 p-2 bg-slate-950/50 rounded-md border border-slate-800">
                                                            <div className="h-5 w-5 rounded bg-slate-800 flex items-center justify-center text-[10px] text-slate-500 font-bold">
                                                                {s.fullName.charAt(0)}
                                                            </div>
                                                            <span className="text-xs text-slate-400">{s.fullName}</span>
                                                        </div>
                                                    )) : (
                                                        <p className="text-[10px] text-slate-600 italic">Belum ada staff di bawah manager ini</p>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    }) : (
                                        <p className="text-[10px] text-slate-600 italic p-2 bg-slate-900/50 rounded border border-slate-800/50">
                                            Tidak ditemukan Manager Divisi aktif dalam scope {scope.brandName} ini.
                                        </p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {currentScopes.length === 0 && (
                        <p className="text-xs text-slate-500 italic">Belum ada scope brand/divisi yang ditambahkan.</p>
                    )}
                </div>
            </div>
        </div>
    );
}

// --- TAB 1: MANAGEMENT ---
function ManagementTab({ users, brands, isSuperAdmin }: { 
    users: UserProfile[], 
    brands: Brand[], 
    isSuperAdmin: boolean 
}) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
    const [selectedWorkRole, setSelectedWorkRole] = useState<string>("");
    const [selectedBrand, setSelectedBrand] = useState<string>("");
    const [selectedDivisions, setSelectedDivisions] = useState<string[]>([]);
    const [currentScopes, setCurrentScopes] = useState<ManagementScope[]>([]);

    // Dynamic divisions for current brand selection
    const [divisions, setDivisions] = useState<Division[]>([]);
    const [isLoadingDivisions, setIsLoadingDivisions] = useState(false);

    useEffect(() => {
        const fetchDivisions = async () => {
            if (!selectedBrand || selectedBrand === 'all') {
                setDivisions([]);
                return;
            }
            setIsLoadingDivisions(true);
            try {
                const divRef = collection(firestore, 'brands', selectedBrand, 'divisions');
                const q = query(divRef, where('isActive', '==', true));
                const snap = await getDocs(q);
                const fetchedDivs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Division));
                setDivisions(fetchedDivs);
            } catch (err) {
                console.error("Error fetching divisions:", err);
            } finally {
                setIsLoadingDivisions(false);
            }
        };
        fetchDivisions();
    }, [selectedBrand, firestore]);

    const managementUsers = users.filter(u => u.structuralLevel === 'management');
    
    // Filter for users who can be managers (role === 'manager' and active)
    const potentialManagers = users.filter(u => 
        u.role === 'manager' && 
        u.isActive !== false &&
        u.structuralLevel !== 'management'
    );

    const WORK_ROLES = [
        "Direktur Pengembangan Bisnis",
        "Direktur General Affairs",
        "Direktur Operasional",
        "General Manager",
        "Direktur Lainnya"
    ];

    const handleEditScope = (user: UserProfile) => {
        setSelectedUser(user);
        setSelectedWorkRole(user.workRole || "");
        setCurrentScopes(user.managementScopes || []);
        setIsDialogOpen(true);
    };

    const resetAddForm = () => {
        setSelectedUser(null);
        setSelectedWorkRole("");
        setSelectedBrand("");
        setSelectedDivisions([]);
        setCurrentScopes([]);
    };

    const handleAddScope = () => {
        if (!selectedBrand) return;
        const brand = brands.find(b => b.id === selectedBrand);
        if (!brand) return;

        // Check for duplicates
        if (currentScopes.some(s => s.brandId === selectedBrand)) {
            toast({ variant: "destructive", title: "Gagal", description: "Brand ini sudah ada dalam scope. Silakan hapus dulu jika ingin mengubah divisi." });
            return;
        }

        const isBrandLevel = selectedDivisions.length === 0;
        const isAllDivisions = selectedDivisions.length === divisions.length && divisions.length > 0;
        
        const finalDivisionIds = isBrandLevel || isAllDivisions ? ["all"] : selectedDivisions;
        const finalDivisionNames = isBrandLevel || isAllDivisions 
            ? ["Seluruh Brand / Perusahaan"] 
            : divisions
                .filter((d: Division) => selectedDivisions.includes(d.id!))
                .map((d: Division) => d.name);

        const newScope: ManagementScope = {
            brandId: selectedBrand,
            brandName: selectedBrand === 'all' ? 'Semua Brand' : (brand?.name || 'Unknown'),
            divisionIds: finalDivisionIds,
            divisionNames: finalDivisionNames,
            scopeType: isBrandLevel ? "brand_level" : "selected_divisions",
            scopeLabel: isBrandLevel ? "Seluruh Brand / Perusahaan" : "Divisi Tertentu"
        };

        setCurrentScopes([...currentScopes, newScope]);
        setSelectedBrand("");
        setSelectedDivisions([]);
    };

    const handleRemoveScope = (index: number) => {
        setCurrentScopes(currentScopes.filter((_, i) => i !== index));
    };

    const handleSaveScopes = async () => {
        if (!selectedUser) return;
        try {
            const userRef = doc(firestore, 'users', selectedUser.uid);
            const updateData = {
                managementScopes: currentScopes,
                workRole: selectedWorkRole,
                structuralLevel: 'management',
                updatedAt: serverTimestamp()
            };

            await updateDoc(userRef, updateData);

            // Also update employee profile if it exists
            const empRef = doc(firestore, 'employee_profiles', selectedUser.uid);
            await setDoc(empRef, updateData, { merge: true });

            toast({ title: "Berhasil", description: "Data manajemen telah diperbarui." });
            setIsDialogOpen(false);
            setIsAddDialogOpen(false);
            resetAddForm();
        } catch (error: any) {
            toast({ variant: "destructive", title: "Gagal", description: error.message });
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                <div>
                    <h3 className="text-xl font-bold flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-emerald-500" />
                        Daftar Direktur & Manajemen
                    </h3>
                    <p className="text-sm text-muted-foreground">Kelola pejabat struktural tingkat manajemen dan area kewenangannya.</p>
                </div>
                {isSuperAdmin && (
                    <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
                        setIsAddDialogOpen(open);
                        if (!open) resetAddForm();
                    }}>
                        <DialogTrigger asChild>
                            <Button size="lg" className="bg-emerald-600 hover:bg-emerald-500">
                                <Plus className="h-5 w-5 mr-2" />
                                Tetapkan Management Baru
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 overflow-hidden border-slate-800 shadow-2xl">
                            <DialogHeader className="p-8 border-b border-slate-800 bg-slate-950 sticky top-0 z-10">
                                <DialogTitle className="text-3xl font-black text-white">Tetapkan Level Management</DialogTitle>
                                <DialogDescription className="text-base text-slate-400 mt-2">Pilih user manager dan tentukan scope kewenangannya secara mendetail.</DialogDescription>
                            </DialogHeader>
                            
                            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                                <div className="space-y-12 pb-12">
                                    {/* Section 1 & 2 */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                        <div className="space-y-4">
                                            <Label className="text-sm font-bold flex items-center gap-3 text-slate-300">
                                                <div className="h-7 w-7 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm font-black">1</div>
                                                Pilih User Manager
                                            </Label>
                                            <Select value={selectedUser?.uid || ""} onValueChange={(uid) => setSelectedUser(users.find(u => u.uid === uid) || null)}>
                                                <SelectTrigger className="h-14 border-slate-700 bg-slate-900 text-base focus:ring-emerald-500">
                                                    <SelectValue placeholder="Cari user dengan role manager..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {potentialManagers.map(u => (
                                                        <SelectItem key={u.uid} value={u.uid}>
                                                            <div className="flex flex-col py-1">
                                                                <span className="font-bold text-base">{u.fullName}</span>
                                                                <span className="text-xs opacity-60">{u.email}</span>
                                                            </div>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <p className="text-xs text-slate-500 italic px-1">Hanya menampilkan user dengan role sistem "Manager" yang berstatus aktif.</p>
                                        </div>

                                        <div className="space-y-4">
                                            <Label className="text-sm font-bold flex items-center gap-3 text-slate-300">
                                                <div className="h-7 w-7 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm font-black">2</div>
                                                Jabatan Manajemen / Work Role
                                            </Label>
                                            <Select value={selectedWorkRole} onValueChange={setSelectedWorkRole}>
                                                <SelectTrigger className="h-14 border-slate-700 bg-slate-900 text-base focus:ring-emerald-500">
                                                    <SelectValue placeholder="Pilih jabatan resmi..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {WORK_ROLES.map(role => (
                                                        <SelectItem key={role} value={role}>{role}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            {selectedWorkRole === "Direktur Lainnya" && (
                                                <Input 
                                                    className="mt-3 h-12 bg-slate-900 border-slate-700 text-base"
                                                    placeholder="Sebutkan jabatan lainnya secara spesifik..." 
                                                    onChange={(e) => setSelectedWorkRole(e.target.value)}
                                                />
                                            )}
                                        </div>
                                    </div>

                                    <Separator className="bg-slate-800" />

                                    {/* Section 3 */}
                                    <div className="space-y-8">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-sm font-bold flex items-center gap-3 text-slate-300">
                                                <div className="h-7 w-7 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm font-black">3</div>
                                                Scope Kewenangan Direktur
                                            </Label>
                                            <Badge variant="outline" className="text-emerald-500 border-emerald-500/40 bg-emerald-500/5 px-3 py-1 font-bold">
                                                {currentScopes.length} Scope Ditambahkan
                                            </Badge>
                                        </div>

                                        <div className="p-5 rounded-2xl bg-blue-500/5 border border-blue-500/20 flex gap-4 items-start shadow-inner">
                                            <Info className="h-6 w-6 text-blue-400 shrink-0 mt-0.5" />
                                            <div className="space-y-1">
                                                <p className="text-sm text-blue-300 font-bold leading-relaxed">
                                                    Info Scope Kewenangan
                                                </p>
                                                <p className="text-xs text-blue-300/70 leading-relaxed">
                                                    Direktur dapat membawahi seluruh brand ini secara default. Pilih divisi hanya jika kewenangan ingin dibatasi ke unit kerja tertentu saja.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
                                            {/* Scope Picker */}
                                            <div className="lg:col-span-5 space-y-6 p-7 rounded-3xl bg-slate-900 border-2 border-slate-800 shadow-xl">
                                                <div className="space-y-3">
                                                    <Label className="text-xs font-black uppercase tracking-widest text-slate-500">Pilih Brand / Perusahaan</Label>
                                                    <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                                                        <SelectTrigger className="h-12 bg-slate-950 border-slate-700">
                                                            <SelectValue placeholder="Pilih Brand" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="all">Semua Brand</SelectItem>
                                                            {brands.map(b => <SelectItem key={b.id} value={b.id!}>{b.name}</SelectItem>)}
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                <div className="space-y-3">
                                                    <Label className="text-xs font-black uppercase tracking-widest text-slate-500">Pilih Divisi</Label>
                                                    <ScrollArea className="h-56 border border-slate-800 rounded-2xl p-4 bg-slate-950/50 shadow-inner">
                                                        <div className="space-y-3">
                                                            {isLoadingDivisions ? (
                                                                <div className="flex flex-col items-center justify-center h-40 gap-3">
                                                                    <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
                                                                    <p className="text-xs text-slate-500">Memuat divisi...</p>
                                                                </div>
                                                            ) : selectedBrand === 'all' ? (
                                                                <div className="p-6 text-center">
                                                                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 px-4 py-1.5 font-bold">Akses Seluruh Brand & Divisi</Badge>
                                                                    <p className="text-[10px] text-slate-500 mt-3 italic leading-relaxed">User ini akan memiliki akses manajemen penuh ke semua unit bisnis yang terdaftar.</p>
                                                                </div>
                                                            ) : divisions.length > 0 ? (
                                                                <>
                                                                    <div className="flex items-center space-x-3 pb-3 border-b border-slate-800 mb-3">
                                                                        <Checkbox 
                                                                            id="add-all-divs" 
                                                                            className="h-5 w-5 border-emerald-500/50 data-[state=checked]:bg-emerald-500"
                                                                            checked={selectedDivisions.length === divisions.length && divisions.length > 0}
                                                                            onCheckedChange={(checked) => {
                                                                                if (checked) setSelectedDivisions(divisions.map((d: Division) => d.id!));
                                                                                else setSelectedDivisions([]);
                                                                            }}
                                                                        />
                                                                        <label htmlFor="add-all-divs" className="text-sm font-black leading-none cursor-pointer text-emerald-400">
                                                                            Pilih Semua Divisi
                                                                        </label>
                                                                    </div>
                                                                    {divisions.map((div: Division) => (
                                                                        <div key={div.id} className="flex items-center space-x-3 py-2 px-1 hover:bg-slate-900/50 rounded-lg transition-colors">
                                                                            <Checkbox 
                                                                                id={`add-div-${div.id}`} 
                                                                                className="h-5 w-5 border-slate-700 data-[state=checked]:bg-emerald-500"
                                                                                checked={selectedDivisions.includes(div.id!)}
                                                                                onCheckedChange={(checked) => {
                                                                                    if (checked) setSelectedDivisions([...selectedDivisions, div.id!]);
                                                                                    else setSelectedDivisions(selectedDivisions.filter(id => id !== div.id));
                                                                                }}
                                                                            />
                                                                            <label htmlFor={`add-div-${div.id}`} className="text-sm leading-none cursor-pointer text-slate-300">
                                                                                {div.name}
                                                                            </label>
                                                                        </div>
                                                                    ))}
                                                                </>
                                                            ) : selectedBrand ? (
                                                                <div className="flex flex-col items-center justify-center h-40 p-4 text-center">
                                                                    <Info className="h-8 w-8 text-slate-600 mb-2" />
                                                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Brand Tanpa Divisi</p>
                                                                    <p className="text-[10px] text-slate-600 italic leading-relaxed">Brand ini belum memiliki divisi. Scope tetap bisa ditambahkan untuk seluruh brand.</p>
                                                                </div>
                                                            ) : (
                                                                <div className="flex flex-col items-center justify-center h-40 opacity-40">
                                                                    <Search className="h-10 w-10 mb-3" />
                                                                    <p className="text-xs font-bold uppercase tracking-widest">Pilih brand</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </ScrollArea>
                                                </div>

                                                <Button 
                                                    size="lg"
                                                    className="w-full h-14 bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-900/20 font-black" 
                                                    onClick={handleAddScope} 
                                                    disabled={!selectedBrand}
                                                >
                                                    <Plus className="h-5 w-5 mr-3" />
                                                    Tambahkan Scope
                                                </Button>
                                            </div>

                                            {/* Selected Scopes List */}
                                            <div className="lg:col-span-7 space-y-4">
                                                <Label className="text-xs font-black uppercase tracking-widest text-slate-500">Daftar Scope Ditambahkan:</Label>
                                                <div className="grid grid-cols-1 gap-4 max-h-[500px] overflow-y-auto pr-3 custom-scrollbar">
                                                    {currentScopes.map((scope, idx) => (
                                                        <div key={idx} className="group relative flex flex-col p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 transition-all shadow-lg hover:shadow-emerald-500/5">
                                                            <div className="flex justify-between items-start mb-3">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="p-2 bg-emerald-500/10 rounded-lg">
                                                                        <Building2 className="h-5 w-5 text-emerald-500" />
                                                                    </div>
                                                                    <span className="font-black text-white text-base tracking-tight">{scope.brandName}</span>
                                                                </div>
                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="icon" 
                                                                    className="h-10 w-10 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-xl" 
                                                                    onClick={() => handleRemoveScope(idx)}
                                                                >
                                                                    <Trash2 className="h-5 w-5" />
                                                                </Button>
                                                            </div>
                                                            <div className="flex flex-wrap gap-2">
                                                                {scope.divisionIds.includes("all") ? (
                                                                    <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-xs px-3 py-1 font-black">
                                                                        Seluruh Brand / Perusahaan
                                                                    </Badge>
                                                                ) : (
                                                                    <div className="flex flex-wrap gap-2 items-center">
                                                                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Divisi:</span>
                                                                        {scope.divisionNames.map((dn, i) => (
                                                                            <Badge key={i} variant="secondary" className="bg-slate-800 text-slate-300 border-slate-700 text-xs px-2.5 py-1">{dn}</Badge>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {currentScopes.length === 0 && (
                                                        <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-slate-800 rounded-3xl opacity-30">
                                                            <Network className="h-12 w-12 mb-4" />
                                                            <p className="text-sm font-black uppercase tracking-widest">Belum Ada Scope</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Hierarchy Preview */}
                                    <HierarchyPreview 
                                        selectedUser={selectedUser} 
                                        selectedWorkRole={selectedWorkRole} 
                                        currentScopes={currentScopes} 
                                        users={users} 
                                    />
                                </div>
                            </div>

                            <DialogFooter className="p-8 border-t border-slate-800 bg-slate-950 sticky bottom-0 z-10 shadow-[0_-10px_20px_rgba(0,0,0,0.4)]">
                                <Button variant="outline" size="lg" className="h-14 px-10 text-base font-bold border-slate-700 hover:bg-slate-900" onClick={() => setIsAddDialogOpen(false)}>Batal</Button>
                                <Button 
                                    size="lg" 
                                    className="h-14 px-12 bg-emerald-600 hover:bg-emerald-500 text-base font-black shadow-lg shadow-emerald-900/30"
                                    onClick={handleSaveScopes} 
                                    disabled={!selectedUser || !selectedWorkRole || currentScopes.length === 0}
                                >
                                    <ShieldCheck className="h-6 w-6 mr-3" />
                                    Tetapkan Direktur Baru
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}
            </div>

            <div className="grid grid-cols-1 gap-4">
                {managementUsers.map(user => (
                    <Card key={user.uid} className="bg-slate-900/40 border-slate-800">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <div className="space-y-1">
                                <CardTitle className="text-lg">{user.fullName}</CardTitle>
                                <CardDescription>{user.workRole || 'Direktur / Manajemen'}</CardDescription>
                            </div>
                            {isSuperAdmin && (
                                <Button variant="outline" size="sm" onClick={() => handleEditScope(user)}>
                                    <Pencil className="h-3 w-3 mr-2" />
                                    Atur Scope
                                </Button>
                            )}
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                <Label className="text-xs uppercase text-muted-foreground">Scope Manajemen:</Label>
                                <div className="flex flex-wrap gap-2">
                                    {user.managementScopes && user.managementScopes.length > 0 ? (
                                        user.managementScopes.map((scope, idx) => (
                                            <div key={idx} className="flex flex-col gap-1.5 p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 min-w-[220px]">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                                                    <span className="text-sm font-black text-white">{scope.brandName}</span>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5 pl-4">
                                                    {scope.divisionIds.includes("all") ? (
                                                        <span className="text-[10px] text-emerald-400/80 font-black italic tracking-tight">
                                                            — Seluruh Brand / Perusahaan
                                                        </span>
                                                    ) : (
                                                        <div className="flex flex-wrap gap-1 items-center">
                                                            <span className="text-[9px] text-slate-500 font-bold mr-1">Divisi:</span>
                                                            {scope.divisionNames.map(div => (
                                                                <Badge key={div} variant="secondary" className="text-[9px] py-0 h-4 bg-slate-900 text-slate-400 border-slate-800">{div}</Badge>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-sm text-slate-500 italic p-4 border-2 border-dashed border-slate-800 rounded-xl w-full text-center">Belum ada scope yang ditetapkan.</p>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Scope Dialog (Edit) */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 overflow-hidden border-slate-800">
                    <DialogHeader className="p-8 border-b border-slate-800 bg-slate-950 sticky top-0 z-10">
                        <DialogTitle className="text-3xl font-black text-white">Pengaturan Management: {selectedUser?.fullName}</DialogTitle>
                        <DialogDescription className="text-base text-slate-400 mt-2">Perbarui jabatan dan scope kewenangan secara mendetail.</DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                        <div className="space-y-12 pb-12">
                            <div className="space-y-4">
                                <Label className="text-sm font-bold text-slate-300">
                                    Jabatan Manajemen / Work Role
                                </Label>
                                <Select value={selectedWorkRole} onValueChange={setSelectedWorkRole}>
                                    <SelectTrigger className="h-14 border-slate-700 bg-slate-900 text-base focus:ring-emerald-500">
                                        <SelectValue placeholder="Pilih jabatan resmi..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {WORK_ROLES.map(role => (
                                            <SelectItem key={role} value={role}>{role}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {selectedWorkRole === "Direktur Lainnya" && (
                                    <Input 
                                        className="mt-3 h-12 bg-slate-900 border-slate-700 text-base"
                                        placeholder="Sebutkan jabatan lainnya secara spesifik..." 
                                        value={selectedWorkRole}
                                        onChange={(e) => setSelectedWorkRole(e.target.value)}
                                    />
                                )}
                            </div>

                            <Separator className="bg-slate-800" />

                            <div className="space-y-8">
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm font-bold text-slate-300">Scope Kewenangan Direktur</Label>
                                    <Badge variant="outline" className="text-emerald-500 border-emerald-500/40 bg-emerald-500/5 px-3 py-1 font-bold">
                                        {currentScopes.length} Scope Aktif
                                    </Badge>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
                                    {/* Scope Picker */}
                                    <div className="lg:col-span-5 space-y-6 p-7 rounded-3xl bg-slate-900 border-2 border-slate-800 shadow-xl">
                                        <div className="space-y-3">
                                            <Label className="text-xs font-black uppercase tracking-widest text-slate-500">Pilih Brand / Perusahaan</Label>
                                            <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                                                <SelectTrigger className="h-12 bg-slate-950 border-slate-700">
                                                    <SelectValue placeholder="Pilih Brand" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">Semua Brand</SelectItem>
                                                    {brands.map(b => <SelectItem key={b.id} value={b.id!}>{b.name}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-3">
                                            <Label className="text-xs font-black uppercase tracking-widest text-slate-500">Pilih Divisi</Label>
                                            <ScrollArea className="h-56 border border-slate-800 rounded-2xl p-4 bg-slate-950/50 shadow-inner">
                                                <div className="space-y-3">
                                                    {isLoadingDivisions ? (
                                                        <div className="flex flex-col items-center justify-center h-40 gap-3">
                                                            <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
                                                            <p className="text-xs text-slate-500">Memuat divisi...</p>
                                                        </div>
                                                    ) : selectedBrand === 'all' ? (
                                                        <div className="p-6 text-center">
                                                            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 px-4 py-1.5">Otomatis Semua Divisi</Badge>
                                                        </div>
                                                    ) : divisions.length > 0 ? (
                                                        <>
                                                            <div className="flex items-center space-x-3 pb-3 border-b border-slate-800 mb-3">
                                                                <Checkbox 
                                                                    id="edit-all-divs" 
                                                                    className="h-5 w-5 border-emerald-500/50 data-[state=checked]:bg-emerald-500"
                                                                    checked={selectedDivisions.length === divisions.length && divisions.length > 0}
                                                                    onCheckedChange={(checked) => {
                                                                        if (checked) setSelectedDivisions(divisions.map((d: Division) => d.id!));
                                                                        else setSelectedDivisions([]);
                                                                    }}
                                                                />
                                                                <label htmlFor="edit-all-divs" className="text-sm font-black leading-none cursor-pointer text-emerald-400">
                                                                    Pilih Semua Divisi
                                                                </label>
                                                            </div>
                                                            {divisions.map((div: Division) => (
                                                                <div key={div.id} className="flex items-center space-x-3 py-2 px-1 hover:bg-slate-900/50 rounded-lg transition-colors">
                                                                    <Checkbox 
                                                                        id={`edit-div-${div.id}`} 
                                                                        className="h-5 w-5 border-slate-700 data-[state=checked]:bg-emerald-500"
                                                                        checked={selectedDivisions.includes(div.id!)}
                                                                        onCheckedChange={(checked) => {
                                                                            if (checked) setSelectedDivisions([...selectedDivisions, div.id!]);
                                                                            else setSelectedDivisions(selectedDivisions.filter((id: string) => id !== div.id));
                                                                        }}
                                                                    />
                                                                    <label htmlFor={`edit-div-${div.id}`} className="text-sm leading-none cursor-pointer text-slate-300">
                                                                        {div.name}
                                                                    </label>
                                                                </div>
                                                            ))}
                                                        </>
                                                    ) : (
                                                        <div className="flex flex-col items-center justify-center h-40 opacity-40">
                                                            <Search className="h-10 w-10 mb-3" />
                                                            <p className="text-xs font-bold uppercase tracking-widest">Pilih brand</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </ScrollArea>
                                        </div>

                                        <Button 
                                            size="lg"
                                            className="w-full h-14 bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-900/20 font-black" 
                                            onClick={handleAddScope} 
                                            disabled={!selectedBrand || (selectedBrand !== 'all' && selectedDivisions.length === 0)}
                                        >
                                            <Plus className="h-5 w-5 mr-3" />
                                            Perbarui Scope
                                        </Button>
                                    </div>

                                    {/* Selected Scopes List */}
                                    <div className="lg:col-span-7 space-y-4">
                                        <Label className="text-xs font-black uppercase tracking-widest text-slate-500">Scope Terpilih:</Label>
                                        <div className="grid grid-cols-1 gap-4 max-h-[500px] overflow-y-auto pr-3 custom-scrollbar">
                                            {currentScopes.map((scope, idx) => (
                                                <div key={idx} className="group relative flex flex-col p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 transition-all shadow-lg hover:shadow-emerald-500/5">
                                                    <div className="flex justify-between items-start mb-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="p-2 bg-emerald-500/10 rounded-lg">
                                                                <Building2 className="h-5 w-5 text-emerald-500" />
                                                            </div>
                                                            <span className="font-black text-white text-base tracking-tight">{scope.brandName}</span>
                                                        </div>
                                                        <Button variant="ghost" size="icon" className="h-10 w-10 text-slate-500 hover:text-red-500" onClick={() => handleRemoveScope(idx)}>
                                                            <Trash2 className="h-5 w-5" />
                                                        </Button>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        {scope.divisionIds.includes("all") ? (
                                                            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-xs px-3 py-1 font-bold">Seluruh Unit Kerja / Divisi</Badge>
                                                        ) : (
                                                            scope.divisionNames.map((dn, i) => (
                                                                <Badge key={i} variant="secondary" className="bg-slate-800 text-slate-300 border-slate-700 text-xs px-2.5 py-1">{dn}</Badge>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Hierarchy Preview */}
                            <HierarchyPreview 
                                selectedUser={selectedUser} 
                                selectedWorkRole={selectedWorkRole} 
                                currentScopes={currentScopes} 
                                users={users} 
                            />
                        </div>
                    </div>

                    <DialogFooter className="p-8 border-t border-slate-800 bg-slate-950 sticky bottom-0 z-10 shadow-[0_-10px_20px_rgba(0,0,0,0.4)]">
                        <Button variant="outline" size="lg" className="h-14 px-10 text-base font-bold border-slate-700 hover:bg-slate-900" onClick={() => setIsDialogOpen(false)}>Batal</Button>
                        <Button 
                            size="lg" 
                            className="h-14 px-12 bg-emerald-600 hover:bg-emerald-500 text-base font-black shadow-lg shadow-emerald-900/30"
                            onClick={handleSaveScopes} 
                            disabled={!selectedUser || !selectedWorkRole || currentScopes.length === 0}
                        >
                            <ShieldCheck className="h-6 w-6 mr-3" />
                            Simpan Perubahan
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// --- TAB 2: DIVISION MANAGER ---
function DivisionManagerTab({ users, brands, managementUsers }: {
    users: UserProfile[],
    brands: Brand[],
    managementUsers: UserProfile[]
}) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [selectedBrand, setSelectedBrand] = useState<string>("");
    const [selectedDivision, setSelectedDivision] = useState<string>("");
    const [isPlacementOpen, setIsPlacementOpen] = useState(false);
    // Filter only active employees (role == 'karyawan')
    const activeEmployees = useMemo(() => {
        return users.filter(u => {
            // Role must be 'karyawan'
            if (u.role !== 'karyawan') return false;
            
            // Level must NOT be management (Director already set)
            if (u.structuralLevel === 'management') return false;

            // Status checks (robust check for multiple field possibilities)
            const isStatusActive = (
                u.isActive === true || 
                (u as any).status?.toLowerCase() === 'active' || 
                (u as any).status?.toLowerCase() === 'aktif' ||
                (u as any).employmentStatus?.toLowerCase() === 'active' ||
                (u as any).employmentStatus?.toLowerCase() === 'aktif' ||
                (u as any).employeeStatus?.toLowerCase() === 'active'
            );

            return isStatusActive;
        });
    }, [users]);

    const [potentialDirectors, setPotentialDirectors] = useState<UserProfile[]>([]);
    const [selectedDirectorUid, setSelectedDirectorUid] = useState<string>("");
    const [selectedManagerUid, setSelectedManagerUid] = useState<string>("");
    const [tempDivisions, setTempDivisions] = useState<Division[]>([]);

    const handleOpenPlacement = (brandId: string, divId: string, brandDivs: Division[]) => {
        setSelectedBrand(brandId);
        setSelectedDivision(divId);
        setTempDivisions(brandDivs);
        
        // Find matching Management (Directors) for this brand/division
        const matches = managementUsers.filter(dir => 
            dir.managementScopes?.some(s => 
                (s.brandId === brandId || s.brandId === 'all') && 
                (s.divisionIds.includes(divId) || s.divisionIds.includes("all"))
            )
        );
        
        setPotentialDirectors(matches);
        if (matches.length === 1) setSelectedDirectorUid(matches[0].uid);
        else setSelectedDirectorUid("");

        // Find current manager if any
        const current = users.find(u => 
            u.structuralLevel === 'division_manager' && 
            u.brandId === brandId && 
            u.divisionId === divId
        );
        setSelectedManagerUid(current?.uid || "");
        
        setIsPlacementOpen(true);
    };

    const handleSavePlacement = async () => {
        if (!selectedManagerUid || !selectedBrand || !selectedDivision) return;
        
        try {
            const manager = users.find(u => u.uid === selectedManagerUid);
            const brand = brands.find(b => b.id === selectedBrand);
            const division = tempDivisions.find(d => d.id === selectedDivision);
            const director = potentialDirectors.find(d => d.uid === selectedDirectorUid);
            
            if (!manager || !brand || !division) return;

            const updateData = {
                structuralLevel: 'division_manager',
                brandId: selectedBrand,
                brandName: brand.name,
                divisionId: selectedDivision,
                divisionName: division.name,
                workRole: `Manager Divisi ${division.name}`,
                directSupervisorUid: director?.uid || null,
                directSupervisorName: director?.fullName || null,
                updatedAt: serverTimestamp()
            };

            await updateDoc(doc(firestore, 'users', selectedManagerUid), updateData);
            await setDoc(doc(firestore, 'employee_profiles', selectedManagerUid), updateData, { merge: true });

            toast({ title: "Berhasil", description: `Manager Divisi ${division.name} telah ditetapkan.` });
            setIsPlacementOpen(false);
        } catch (error: any) {
            toast({ variant: "destructive", title: "Gagal", description: error.message });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4 bg-slate-900/50 p-6 rounded-xl border border-slate-800">
                <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                    <UserCheck className="h-6 w-6" />
                </div>
                <div>
                    <h3 className="text-lg font-bold">Penempatan Manager Divisi</h3>
                    <p className="text-sm text-muted-foreground">Tentukan penanggung jawab untuk setiap divisi di masing-masing brand.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {brands.map(brand => (
                    <BrandDivisionCard 
                        key={brand.id} 
                        brand={brand} 
                        users={users} 
                        onOpenPlacement={handleOpenPlacement}
                    />
                ))}
            </div>

            {/* Placement Dialog */}
            <Dialog open={isPlacementOpen} onOpenChange={setIsPlacementOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Pilih Manager Divisi</DialogTitle>
                        <DialogDescription>
                            Tentukan siapa yang akan menjabat sebagai Manager Divisi untuk unit ini.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                        <div className="space-y-2">
                            <Label>User / Karyawan</Label>
                                <Select value={selectedManagerUid} onValueChange={setSelectedManagerUid}>
                                    <SelectTrigger className="h-14 border-slate-700 bg-slate-900 text-base">
                                        <SelectValue placeholder="Pilih karyawan aktif..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {activeEmployees.map(u => (
                                            <SelectItem key={u.uid} value={u.uid}>
                                                <div className="flex flex-col py-1">
                                                    <span className="font-bold text-base">{u.fullName} ({u.email})</span>
                                                    {(u.brandName || u.divisionName) && (
                                                        <span className="text-[10px] text-slate-500 font-bold uppercase">
                                                            {u.brandName || 'Tanpa Brand'} — {u.divisionName || 'Tanpa Divisi'}
                                                        </span>
                                                    )}
                                                </div>
                                            </SelectItem>
                                        ))}
                                        {activeEmployees.length === 0 && (
                                            <div className="p-4 text-center text-xs text-slate-500 italic">
                                                Tidak ada karyawan aktif yang tersedia.
                                            </div>
                                        )}
                                    </SelectContent>
                                </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Atasan Langsung (Direktur/Manajemen)</Label>
                            {potentialDirectors.length > 0 ? (
                                <Select value={selectedDirectorUid} onValueChange={setSelectedDirectorUid}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Pilih Direktur..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {potentialDirectors.map(d => (
                                            <SelectItem key={d.uid} value={d.uid}>{d.fullName} ({d.workRole})</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-amber-500 text-xs flex gap-2 items-center">
                                    <AlertCircle className="h-4 w-4" />
                                    Belum ada Direktur/Manajemen yang membawahi divisi ini.
                                </div>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPlacementOpen(false)}>Batal</Button>
                        <Button onClick={handleSavePlacement} disabled={!selectedManagerUid}>Simpan Penempatan</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// Sub-component for Brand Card in Tab 2
function BrandDivisionCard({ brand, users, onOpenPlacement }: { 
    brand: Brand, 
    users: UserProfile[],
    onOpenPlacement: (brandId: string, divId: string, brandDivs: Division[]) => void
}) {
    const firestore = useFirestore();
    const [divisions, setDivisions] = useState<Division[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDivs = async () => {
            if (!brand.id) return;
            try {
                const q = query(collection(firestore, 'brands', brand.id, 'divisions'), where('isActive', '==', true));
                const snap = await getDocs(q);
                setDivisions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Division)));
            } finally {
                setLoading(false);
            }
        };
        fetchDivs();
    }, [brand.id, firestore]);

    return (
        <Card className="bg-slate-900/30 border-slate-800 h-fit">
            <CardHeader className="bg-slate-900/50 pb-4">
                <CardTitle className="text-md flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-emerald-500" />
                    {brand.name}
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
                {loading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                ) : divisions.length > 0 ? (
                    divisions.map(div => {
                        const currentManager = users.find(u => 
                            u.structuralLevel === 'division_manager' && 
                            u.brandId === brand.id && 
                            u.divisionId === div.id
                        );

                        return (
                            <div key={div.id} className="flex flex-col gap-2 p-3 rounded-lg border border-slate-800 bg-slate-950/50">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-semibold">{div.name}</span>
                                    {!currentManager && (
                                        <Badge variant="outline" className="text-[9px] text-amber-500 border-amber-500/30 bg-amber-500/5">Kosong</Badge>
                                    )}
                                </div>
                                
                                {currentManager ? (
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500 text-xs">
                                                {currentManager.fullName.charAt(0)}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium">{currentManager.fullName}</span>
                                                <span className="text-[10px] text-slate-500 truncate max-w-[120px]">Supervisor: {currentManager.directSupervisorName || 'Belum Ada'}</span>
                                            </div>
                                        </div>
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onOpenPlacement(brand.id!, div.id!, divisions)}>
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ) : (
                                    <Button variant="outline" size="sm" className="w-full text-xs h-8" onClick={() => onOpenPlacement(brand.id!, div.id!, divisions)}>
                                        Pilih Manager
                                    </Button>
                                )}
                            </div>
                        );
                    })
                ) : (
                    <p className="text-xs text-slate-500 italic text-center p-4">Belum ada divisi di brand ini.</p>
                )}
            </CardContent>
        </Card>
    );
}

// --- TAB 3: HIERARCHY VIEW ---
function HierarchyTab({ users, brands }: {
    users: UserProfile[],
    brands: Brand[]
}) {
    const managementUsers = users.filter(u => u.structuralLevel === 'management');
    const divisionManagers = users.filter(u => u.structuralLevel === 'division_manager');
    const staffUsers = users.filter(u => u.structuralLevel === 'staff' || (!u.structuralLevel && u.role === 'karyawan'));

    return (
        <div className="space-y-8">
            <div className="flex items-center gap-3">
                <Network className="h-6 w-6 text-emerald-500" />
                <h3 className="text-xl font-bold">Hirarki Struktur Organisasi</h3>
            </div>

            <div className="space-y-12">
                {managementUsers.map(manager => (
                    <div key={manager.uid} className="space-y-6">
                        {/* Management Node */}
                        <div className="relative flex justify-center">
                            <div className="z-10 bg-emerald-500/10 border-2 border-emerald-500/50 p-4 rounded-2xl min-w-[280px] shadow-lg shadow-emerald-500/10">
                                <div className="flex items-center gap-4">
                                    <div className="h-12 w-12 rounded-xl bg-emerald-500 flex items-center justify-center text-white font-bold text-xl">
                                        {manager.fullName.charAt(0)}
                                    </div>
                                    <div>
                                        <h4 className="font-black text-white">{manager.fullName}</h4>
                                        <p className="text-xs text-emerald-400 uppercase tracking-widest font-bold">{manager.workRole || 'Management'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Connection Line */}
                        <div className="flex justify-center -mt-6">
                            <div className="w-px h-12 bg-emerald-500/30"></div>
                        </div>

                        {/* Division Managers membawahi... */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 px-4">
                            {divisionManagers.filter(dm => dm.directSupervisorUid === manager.uid).map(dm => (
                                <div key={dm.uid} className="flex flex-col items-center gap-4">
                                    <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-xl w-full shadow-md">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-lg bg-blue-500 flex items-center justify-center text-white font-bold">
                                                {dm.fullName.charAt(0)}
                                            </div>
                                            <div>
                                                <h5 className="font-bold text-sm">{dm.fullName}</h5>
                                                <p className="text-[10px] text-blue-400 font-bold uppercase">{dm.divisionName || 'Manager Divisi'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Connection to Staff */}
                                    <div className="w-px h-6 bg-slate-700"></div>

                                    {/* Staff list */}
                                    <div className="w-full space-y-2">
                                        {staffUsers.filter(s => 
                                            s.brandId === dm.brandId && 
                                            s.divisionId === dm.divisionId
                                        ).map(s => (
                                            <div key={s.uid} className="flex items-center gap-3 p-2 bg-slate-900/50 border border-slate-800 rounded-lg ml-4">
                                                <div className="h-6 w-6 rounded bg-slate-800 flex items-center justify-center text-[10px] text-slate-400">
                                                    {s.fullName.charAt(0)}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-medium">{s.fullName}</span>
                                                    <span className="text-[9px] text-slate-500">{s.workRole || 'Staff'}</span>
                                                </div>
                                            </div>
                                        ))}
                                        {staffUsers.filter(s => 
                                            s.brandId === dm.brandId && 
                                            s.divisionId === dm.divisionId
                                        ).length === 0 && (
                                            <p className="text-[10px] text-slate-600 italic text-center">Belum ada staff</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}

                {/* Orphan Division Managers (No Director assigned) */}
                {divisionManagers.filter(dm => !dm.directSupervisorUid).length > 0 && (
                    <div className="space-y-6 pt-10 border-t border-slate-800/50">
                         <div className="flex items-center gap-2 justify-center text-amber-500">
                            <AlertCircle className="h-4 w-4" />
                            <span className="text-xs font-bold uppercase tracking-widest">Manager Divisi Tanpa Direktur</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {divisionManagers.filter(dm => !dm.directSupervisorUid).map(dm => (
                                <div key={dm.uid} className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-xl shadow-md">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-500 font-bold">
                                            {dm.fullName.charAt(0)}
                                        </div>
                                        <div>
                                            <h5 className="font-bold text-sm">{dm.fullName}</h5>
                                            <p className="text-[10px] text-amber-500/70 font-bold uppercase">{dm.divisionName || 'Manager Divisi'}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
