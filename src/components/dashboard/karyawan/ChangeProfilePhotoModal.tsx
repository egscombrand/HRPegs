"use client";

import { useState, useRef, ChangeEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Upload, X, Camera, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { uploadFile } from "@/lib/storage/storage-adapter";
import { doc, serverTimestamp } from "firebase/firestore";
import { useFirestore, updateDocumentNonBlocking } from "@/firebase";
import { User } from "lucide-react";
import { 
  validateStorageFile, 
  compressImage, 
  handleStorageError 
} from "@/lib/storage-utils";
import { useAuth } from "@/providers/auth-provider";

interface ChangeProfilePhotoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  uid: string;
  currentPhotoUrl: string | null;
  currentPhotoPath?: string | null;
  onSuccess: () => void;
}

export function ChangeProfilePhotoModal({
  open,
  onOpenChange,
  uid,
  currentPhotoUrl,
  currentPhotoPath,
  onSuccess,
}: ChangeProfilePhotoModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const firestore = useFirestore();
  const { userProfile } = useAuth();

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate using global helper (1MB limit)
    const validation = validateStorageFile(file);
    if (!validation.isValid) {
      toast({
        variant: "destructive",
        title: "File tidak valid",
        description: validation.message,
      });
      return;
    }

    // Compress image
    const compressed = await compressImage(file);
    setSelectedFile(compressed);
    const url = URL.createObjectURL(compressed);
    setPreviewUrl(url);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress(10);

    try {
      const timestamp = Date.now();
      const filename = selectedFile.name.replace(/[^a-zA-Z0-9.]/g, "_");
      const storagePath = `employee_profiles/${uid}/profile-photo/${timestamp}-${filename}`;
      
      // Use unified storage adapter
      const result = await uploadFile(selectedFile, storagePath, userProfile?.uid || uid, {
        category: "profile_photo",
        ownerUid: uid,
        compress: false // Already compressed above
      });

      const finalUrl = result.thumbnailUrl || result.directViewUrl || result.webViewLink || "";

      // Update Firestore: employee_profiles
      const employeeProfileRef = doc(firestore, "employee_profiles", uid);
      await updateDocumentNonBlocking(employeeProfileRef, {
        photoUrl: finalUrl,
        photoPath: result.filePath || storagePath,
        profilePhotoUrl: finalUrl,
        profilePhotoFile: {
          ...result,
          uploadedBy: userProfile?.uid || uid,
        },
        // Update nested fields for UI display
        "dataDiriIdentitas.profilePhotoUrl": finalUrl,
        "dataDiriIdentitas.photoUrl": finalUrl,
        updatedAt: serverTimestamp() as any,
      });

      // Sync with users collection
      const userRef = doc(firestore, "users", uid);
      await updateDocumentNonBlocking(userRef, {
        photoURL: finalUrl,
        photoPath: result.filePath || storagePath,
        updatedAt: serverTimestamp() as any,
      });

      toast({
        title: "Foto profil diperbarui",
        description: "Foto profil Anda berhasil diperbarui ke Google Drive.",
      });

      setIsUploading(false);
      onSuccess();
      onOpenChange(false);
      resetState();
    } catch (error: any) {
      console.error("Profile photo upload error:", error);
      toast({
        variant: "destructive",
        title: "Upload Gagal",
        description: error.message || "Terjadi kesalahan saat mengunggah foto profil.",
      });
      setIsUploading(false);
    }
  };

  const resetState = () => {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setUploadProgress(0);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!isUploading) {
        onOpenChange(val);
        if (!val) resetState();
      }
    }}>
      <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800 text-slate-100">
        <DialogHeader>
          <DialogTitle>Ganti Foto Profil</DialogTitle>
          <DialogDescription className="text-slate-400">
            Unggah foto profil baru Anda. Maksimal 1 MB (JPG, PNG, atau WebP).
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center py-6 gap-6">
          <div className="relative group">
            <Avatar className="h-48 w-48 rounded-[2.5rem] border-4 border-slate-800 shadow-2xl overflow-hidden bg-slate-900">
              <AvatarImage src={previewUrl || currentPhotoUrl || ""} className="object-cover" />
              <AvatarFallback className="bg-slate-900 text-slate-500">
                <User className="h-20 w-20" />
              </AvatarFallback>
            </Avatar>
            
            {isUploading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-[2.5rem] z-10">
                <Loader2 className="h-10 w-10 text-primary animate-spin mb-2" />
                <span className="text-xs font-bold text-white">{Math.round(uploadProgress)}%</span>
              </div>
            )}
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
          />

          {!selectedFile ? (
            <Button
              variant="outline"
              onClick={triggerFileInput}
              className="rounded-xl border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-200"
            >
              <Upload className="mr-2 h-4 w-4" /> Pilih Foto
            </Button>
          ) : (
            <div className="flex gap-3">
              <Button
                variant="ghost"
                onClick={resetState}
                disabled={isUploading}
                className="rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                <X className="mr-2 h-4 w-4" /> Batal
              </Button>
              <Button
                onClick={handleUpload}
                disabled={isUploading}
                className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Mengunggah...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" /> Simpan Foto
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-start">
          <p className="text-[10px] text-slate-500 italic">
            * Perubahan foto profil akan terlihat di seluruh sistem setelah disimpan.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
