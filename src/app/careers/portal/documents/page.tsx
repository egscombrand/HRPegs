'use client';

import { useMemo, useState, useCallback, ChangeEvent, useEffect } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, serverTimestamp, writeBatch, doc } from 'firebase/firestore';
import { uploadFile } from '@/lib/storage/storage-adapter';
import { 
  validateStorageFile, 
  compressImage, 
  handleStorageError 
} from '@/lib/storage-utils';
import type { JobApplication } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileUp, Loader2, UploadCloud, CheckCircle, XCircle, FileCheck, Info, Eye, RefreshCw, ClipboardCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface UploadedFile {
  url: string;
  name: string;
}

// Read-only view for submitted documents
function SubmittedDocumentsView({ application }: { application: JobApplication }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dokumen Terkirim: {application.jobPosition}</CardTitle>
        <CardDescription>
          Dokumen Anda untuk lamaran ini telah berhasil dikirim dan sedang dalam proses verifikasi oleh tim HRD.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="default">
          <ClipboardCheck className="h-4 w-4" />
          <AlertTitle>Status: Sedang Diverifikasi</AlertTitle>
          <AlertDescription>
            Anda dapat memperbarui dokumen jika diperlukan. Tim kami akan menghubungi Anda jika ada informasi lebih lanjut.
          </AlertDescription>
        </Alert>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
          {application.cvUrl && application.cvFileName && (
            <div className="p-4 border rounded-lg">
              <p className="font-medium text-sm">Curriculum Vitae (CV)</p>
              <p className="text-muted-foreground text-sm truncate" title={application.cvFileName}>{application.cvFileName}</p>
              <Button asChild variant="outline" size="sm" className="mt-2">
                <a href={application.cvUrl} target="_blank" rel="noopener noreferrer">
                  <Eye className="mr-2 h-4 w-4" /> Lihat File
                </a>
              </Button>
            </div>
          )}
          {application.ijazahUrl && application.ijazahFileName && (
            <div className="p-4 border rounded-lg">
              <p className="font-medium text-sm">Ijazah / SKL</p>
              <p className="text-muted-foreground text-sm truncate" title={application.ijazahFileName}>{application.ijazahFileName}</p>
              <Button asChild variant="outline" size="sm" className="mt-2">
                <a href={application.ijazahUrl} target="_blank" rel="noopener noreferrer">
                  <Eye className="mr-2 h-4 w-4" /> Lihat File
                </a>
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}


interface DocumentUploadSlotProps {
  label: string;
  fileType: 'cv' | 'ijazah';
  userId: string;
  applicationId: string;
  initialFile: UploadedFile | null;
  onUploadComplete: (fileType: 'cv' | 'ijazah', file: UploadedFile) => void;
}

function DocumentUploadSlot({ label, fileType, userId, applicationId, initialFile, onUploadComplete }: DocumentUploadSlotProps) {
    const [file, setFile] = useState<File | null>(null);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        setError(null);

        if (selectedFile) {
            const validation = validateStorageFile(selectedFile);
            if (!validation.isValid) {
                setError(validation.message || 'File tidak valid');
                setFile(null);
                e.target.value = '';
                return;
            }
            
            const processedFile = await compressImage(selectedFile);
            setFile(processedFile);
        } else {
            setFile(null);
        }
    };

    const handleUpload = async () => {
        if (!file) return;

        setIsUploading(true);
        setError(null);
        setProgress(0);

        try {
            const filePath = `candidate_docs/${userId}/${fileType}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
            
            const result = await uploadFile(file, filePath, userId, {
                category: fileType === 'cv' ? 'cv' : 'ijazah',
                ownerUid: userId,
                applicationId: applicationId,
                compress: false // Already compressed above
            });

            const downloadURL = result.webViewLink || result.downloadUrl || "";
            
            onUploadComplete(fileType, { 
                url: downloadURL, 
                name: file.name 
            });
            
            setFile(null);
            const input = document.getElementById(`${fileType}-upload`) as HTMLInputElement;
            if (input) input.value = '';
            
            setProgress(100);
        } catch (uploadError: any) {
            console.error("Candidate upload error:", uploadError);
            setError(uploadError.message || 'Gagal mengunggah file ke Google Drive.');
        } finally {
            setIsUploading(false);
        }
    };

    const fileDescription = '(maks. 1MB - PDF, JPG, PNG, DOCX)';

    return (
        <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex justify-between items-center">
                <h4 className="font-semibold flex items-center gap-2">
                    {label}
                    <span className="text-destructive">*</span>
                </h4>
                {initialFile && <Badge className="bg-blue-100 text-blue-800">Done</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">{fileDescription}</p>

            <div className="grid grid-cols-1 md:grid-cols-2 items-center gap-4">
                <Button asChild variant="outline" size="sm" disabled={!initialFile}>
                    <a href={initialFile?.url} target="_blank" rel="noopener noreferrer">
                        Pratinjau File
                    </a>
                </Button>
                <div className="flex items-center gap-2">
                    <Input id={`${fileType}-upload`} type="file" onChange={handleFileChange} className="text-sm h-9 flex-grow" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
                    <Button onClick={handleUpload} disabled={!file || isUploading} size="sm">
                        {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upload"}
                    </Button>
                </div>
            </div>

            {isUploading && <Progress value={progress} className="mt-2" />}
            {error && <p className="text-sm text-destructive mt-1">{error}</p>}
        </div>
    );
}

export default function DocumentsPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploads, setUploads] = useState<{ cv: UploadedFile | null, ijazah: UploadedFile | null }>({ cv: null, ijazah: null });

  const applicationsQuery = useMemoFirebase(() => {
    if (!userProfile?.uid) return null;
    return query(
      collection(firestore, 'applications'),
      where('candidateUid', '==', userProfile.uid),
      where('status', 'in', ['document_submission', 'interview', 'hired'])
    );
  }, [userProfile?.uid, firestore]);

  const { data: applications, isLoading: appsLoading } = useCollection<JobApplication>(applicationsQuery);
  const isLoading = authLoading || appsLoading;

  const applicationsForEditing = useMemo(() => 
    applications?.filter(app => ['document_submission', 'interview'].includes(app.status)) || [], 
    [applications]
  );
  
  const applicationsReadOnly = useMemo(() => 
    applications?.filter(app => ['hired'].includes(app.status)) || [],
    [applications]
  );

  useEffect(() => {
    if (applicationsForEditing && applicationsForEditing.length > 0) {
      const app = applicationsForEditing[0];
      setUploads({
        cv: app.cvUrl && app.cvFileName ? { url: app.cvUrl, name: app.cvFileName } : null,
        ijazah: app.ijazahUrl && app.ijazahFileName ? { url: app.ijazahUrl, name: app.ijazahFileName } : null,
      });
    }
  }, [appsLoading, applicationsForEditing]);

  const handleUploadComplete = (fileType: 'cv' | 'ijazah', file: UploadedFile) => {
    setUploads(prev => ({ ...prev, [fileType]: file }));
  };

  const handleSubmitDocuments = async () => {
    if (!applicationsForEditing || applicationsForEditing.length === 0 || !uploads.cv || !uploads.ijazah) return;
    setIsSubmitting(true);
    
    const isFirstSubmissionForAny = applicationsForEditing.some(app => app.status === 'document_submission');

    const batch = writeBatch(firestore);
    
    applicationsForEditing.forEach(app => {
      const appRef = doc(firestore, 'applications', app.id!);
      
      const updatePayload: any = {
        cvUrl: uploads.cv?.url,
        ijazahUrl: uploads.ijazah?.url,
        cvFileName: uploads.cv?.name,
        ijazahFileName: uploads.ijazah?.name,
        updatedAt: serverTimestamp(),
      };

      if (app.status === 'document_submission') {
        updatePayload.status = 'interview';
      }

      batch.update(appRef, updatePayload);
    });

    try {
      await batch.commit();
      toast({
        title: isFirstSubmissionForAny ? "Dokumen Berhasil Dikirim" : "Dokumen Diperbarui",
        description: isFirstSubmissionForAny ? "Selamat, Anda lolos ke tahap wawancara!" : "Perubahan dokumen Anda telah disimpan.",
      });
      // The useCollection hook will update automatically
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Gagal Mengirim Dokumen',
        description: error.message || 'Terjadi kesalahan pada server.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const isFirstSubmission = applicationsForEditing.some(app => app.status === 'document_submission');

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (applicationsForEditing.length === 0 && applicationsReadOnly.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dokumen</CardTitle>
          <CardDescription>Kelola CV, portofolio, dan dokumen pendukung lainnya.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center p-8 border rounded-lg bg-muted/50 flex flex-col items-center gap-4">
            <FileCheck className="h-12 w-12 text-muted-foreground" />
            <p className="font-medium">Tidak Ada Permintaan Dokumen</p>
            <p className="text-sm text-muted-foreground max-w-md">
              Saat ini tidak ada lamaran Anda yang memerlukan pengumpulan dokumen. Anda akan melihat formulir unggah di sini jika sudah waktunya.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
        {applicationsForEditing.length > 0 && (
             <Card>
                <CardHeader>
                    <CardTitle>Pengumpulan Dokumen</CardTitle>
                    <CardDescription>
                        Unggah dokumen yang diminta. File yang diunggah akan menggantikan versi sebelumnya.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>Perhatian</AlertTitle>
                    <AlertDescription>
                        Dokumen yang Anda unggah di sini akan digunakan untuk semua lamaran yang sedang dalam tahap ini ({applicationsForEditing.length} lamaran).
                    </AlertDescription>
                    </Alert>

                    <div className="space-y-4">
                    <DocumentUploadSlot
                        label="Curriculum Vitae (CV)"
                        fileType="cv"
                        initialFile={uploads.cv}
                        onUploadComplete={handleUploadComplete}
                        userId={userProfile!.uid}
                        applicationId={applicationsForEditing[0].id!}
                    />
                    <DocumentUploadSlot
                        label="Ijazah / SKL"
                        fileType="ijazah"
                        initialFile={uploads.ijazah}
                        onUploadComplete={handleUploadComplete}
                        userId={userProfile!.uid}
                        applicationId={applicationsForEditing[0].id!}
                    />
                    </div>

                    <Separator />

                    <div className="flex justify-end">
                    <Button
                        size="lg"
                        disabled={!uploads.cv || !uploads.ijazah || isSubmitting}
                        onClick={handleSubmitDocuments}
                    >
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
                         {isFirstSubmission ? 'Kirim Final Dokumen' : 'Simpan Perubahan'}
                    </Button>
                    </div>
                </CardContent>
            </Card>
        )}
        
        {applicationsReadOnly.length > 0 && (
            <div className="space-y-4">
                 {applicationsForEditing.length > 0 && <Separator />}
                 {applicationsReadOnly.map(app => (
                    <SubmittedDocumentsView key={app.id} application={app} />
                 ))}
            </div>
        )}
    </div>
  )
}

    