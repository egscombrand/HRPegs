'use client';

import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { MENU_CONFIG } from '@/lib/menu-config';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { uploadFile, UploadResult } from '@/lib/storage/storage-adapter';
import { useAuth } from '@/providers/auth-provider';
import { Loader2, FileUp, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';

export default function StorageTestPage() {
  const hasAccess = useRoleGuard('super-admin');
  const { userProfile } = useAuth();
  const menuConfig = useMemo(() => MENU_CONFIG['super-admin'] || [], []);

  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeProvider = process.env.NEXT_PUBLIC_STORAGE_PROVIDER || 'firebaseStorage';

  if (!hasAccess) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center p-4 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h3 className="text-lg font-bold">Akses Ditolak</h3>
        <p className="text-muted-foreground">Anda tidak memiliki akses ke halaman ini.</p>
      </div>
    );
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    setError(null);
    setResult(null);
  };

  const handleUpload = async () => {
    if (!file || !userProfile) return;

    if (file.size > 1 * 1024 * 1024) {
      setError("Ukuran file terlalu besar. Maksimal 1 MB.");
      return;
    }

    setIsUploading(true);
    setError(null);
    setResult(null);

    try {
      // Test path
      const testPath = `dev_test/${userProfile.uid}/${Date.now()}_${file.name}`;
      
      const uploadResult = await uploadFile(file, testPath, userProfile.uid, {
        category: "profile_photo", // Default category for test
        ownerUid: userProfile.uid,
        compress: true
      });

      setResult(uploadResult);
    } catch (err: any) {
      console.error("Upload test failed:", err);
      setError(err.message || "Terjadi kesalahan saat upload.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <DashboardLayout pageTitle="Storage Test" menuConfig={menuConfig}>
      <div className="max-w-4xl space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Storage Test</h2>
          <p className="text-muted-foreground">
            Halaman internal untuk menguji upload file ke Google Drive.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Upload Test</CardTitle>
              <CardDescription>
                Pilih file untuk menguji integrasi Google Drive.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">Provider Aktif:</span>
                <Badge variant={activeProvider === 'googleDrive' ? 'default' : 'secondary'}>
                  {activeProvider}
                </Badge>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Pilih File (Max 1MB)</label>
                <Input type="file" onChange={handleFileChange} disabled={isUploading} />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
            <CardFooter>
              <Button 
                onClick={handleUpload} 
                disabled={!file || isUploading} 
                className="w-full"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Mengunggah...
                  </>
                ) : (
                  <>
                    <FileUp className="mr-2 h-4 w-4" />
                    Upload Test
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Hasil Upload</CardTitle>
              <CardDescription>
                Metadata hasil upload akan muncul di sini.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {result ? (
                <div className="space-y-4">
                  <div className="rounded-lg bg-green-50 p-4 border border-green-200">
                    <div className="flex items-center gap-2 text-green-700 font-medium mb-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Upload Berhasil
                    </div>
                    <div className="grid grid-cols-1 gap-1 text-xs font-mono break-all">
                      <p><span className="text-muted-foreground">storageProvider:</span> {result.storageProvider}</p>
                      <p><span className="text-muted-foreground">fileId:</span> {result.fileId}</p>
                      <p><span className="text-muted-foreground">fileName:</span> {result.fileName}</p>
                      <p><span className="text-muted-foreground">fileSize:</span> {result.fileSize} bytes</p>
                      <p><span className="text-muted-foreground">fileType:</span> {result.fileType}</p>
                      <p><span className="text-muted-foreground">driveFolderId:</span> {result.driveFolderId}</p>
                      <p><span className="text-muted-foreground">driveFolderPath:</span> {result.driveFolderPath}</p>
                      <p><span className="text-muted-foreground">uploadedBy:</span> {result.uploadedBy}</p>
                    </div>
                  </div>

                  {result.webViewLink && (
                    <Button asChild variant="outline" className="w-full">
                      <a href={result.webViewLink} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Buka File di Google Drive
                      </a>
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <p>Belum ada data upload.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
