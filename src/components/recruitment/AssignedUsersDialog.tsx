'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import type { Job, UserProfile, Brand } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { useAuth as useFirebaseAuth } from '@/firebase';
import { PanelistPickerSimple } from './PanelistPickerSimple';
import { useRouter } from 'next/navigation';

interface AssignedUsersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  currentUser: UserProfile;
  allUsers: UserProfile[];
  allBrands: Brand[];
  onSuccess: () => void;
}

export function AssignedUsersDialog({ open, onOpenChange, job, currentUser, allUsers, allBrands, onSuccess }: AssignedUsersDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const { toast } = useToast();
  const { firebaseUser } = useAuth();
  const auth = useFirebaseAuth();
  const router = useRouter();

  useEffect(() => {
    if (open && job) {
      setSelectedUserIds(job.assignedUserIds || []);
    }
  }, [open, job]);

  const handleSave = async () => {
    if (!job || !firebaseUser) return;
    setIsSaving(true);
    try {
        const idToken = await firebaseUser.getIdToken(true);
        const response = await fetch(`/api/admin/jobs/${job.id}/assign-users`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`,
            },
            body: JSON.stringify({ userIds: selectedUserIds }),
        });

        // If the token is truly expired, server should send 401. This is correct.
        if (response.status === 401) {
            toast({ variant: 'destructive', title: 'Sesi Habis', description: "Sesi Anda telah berakhir. Silakan login kembali." });
            await auth.signOut();
            router.push('/admin/login');
            return;
        }

        // If it's another error (e.g., 500, 403, 400), don't log out.
        if (!response.ok) {
            let errorMsg = 'Gagal menyimpan data. Silakan coba lagi.';
            try {
                // Try to parse JSON, but don't fail if it's not JSON.
                const errorData = await response.json();
                errorMsg = errorData.error || errorMsg;
            } catch (e) {
                // The response was not JSON, which is the original problem.
                // We've caught it and can now display a user-friendly message.
                console.error("API did not return JSON. Status:", response.status);
            }
            throw new Error(errorMsg);
        }

        toast({ title: 'Tim Rekrutmen Diperbarui', description: 'Pengguna yang ditugaskan ke lowongan ini telah diperbarui.' });
        onSuccess();
        onOpenChange(false);
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'Gagal Menyimpan', description: e.message });
    } finally {
        setIsSaving(false);
    }
  };
  
  if (!job) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Kelola User untuk: {job.position}</DialogTitle>
          <DialogDescription>
            Pilih pengguna internal yang akan dilibatkan dalam proses rekrutmen untuk lowongan ini.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
            <PanelistPickerSimple
                allUsers={allUsers}
                allBrands={allBrands}
                selectedIds={selectedUserIds}
                onChange={setSelectedUserIds}
            />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Simpan Perubahan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
