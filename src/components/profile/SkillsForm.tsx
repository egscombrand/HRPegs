
'use client';

import { useState, useCallback, ChangeEvent, useEffect, useRef } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from '@/components/ui/button';
import { Loader2, X, PlusCircle, Trash2, FileUp, Eye, Globe, Info } from 'lucide-react';
import { Separator } from '../ui/separator';
import { useAuth } from '@/providers/auth-provider';
import { useFirestore, setDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL, type UploadTask } from 'firebase/storage';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '../ui/progress';
import { Alert, AlertDescription } from '../ui/alert';
import { cn } from '@/lib/utils';


const certificationSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Nama sertifikasi harus diisi"),
  organization: z.string().min(1, "Nama organisasi harus diisi"),
  issueDate: z.string().regex(/^\d{4}-\d{2}$/, { message: "Gunakan format YYYY-MM" }),
  expirationDate: z.string().regex(/^\d{4}-\d{2}$/, { message: "Gunakan format YYYY-MM" }).optional().or(z.literal('')),
  imageUrl: z.string().optional().or(z.literal('')),
});

const formSchema = z.object({
  cvUrl: z.string().min(1, "CV harus diunggah atau dilampirkan via link"),
  ijazahUrl: z.string().min(1, "Ijazah harus diunggah atau dilampirkan via link"),
  certifications: z.array(certificationSchema).optional(),
});

type FormValues = z.infer<typeof formSchema>;

const FILE_SIZE_LIMIT = 2 * 1024 * 1024; // 2MB

interface FileUploadFieldProps {
  label: string;
  value?: string;
  onChange: (url: string) => void;
  userId: string;
  pathPrefix: string;
  required?: boolean;
}

function FileUploadField({ label, value, onChange, userId, pathPrefix, required = false }: FileUploadFieldProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [useLink, setUseLink] = useState(!!value && !value.includes('firebasestorage'));
    const [fileName, setFileName] = useState<string | null>(null);
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (value && value.includes('firebasestorage')) {
            try {
                const url = new URL(value);
                const pathParts = decodeURIComponent(url.pathname).split('/');
                const lastPart = pathParts[pathParts.length - 1];
                const name = lastPart.split('?')[0].split('_').slice(2).join('_');
                setFileName(name || 'File terunggah');
            } catch (e) {
                setFileName('File terunggah');
            }
        } else if (value && !value.includes('firebasestorage')) {
            setFileName(value);
        } else {
            setFileName(null);
        }
    }, [value]);

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > FILE_SIZE_LIMIT) {
            toast({
                variant: 'destructive',
                title: 'File Terlalu Besar',
                description: `Maksimal ukuran file adalah 2MB. Untuk file lebih besar, gunakan link external.`,
            });
            return;
        }

        setFileName(file.name);
        setIsUploading(true);
        const storage = getStorage();
        const storageRef = ref(storage, `user_docs/${userId}/${pathPrefix}_${Date.now()}_${file.name}`);
        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on('state_changed',
            (snapshot) => setProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
            (error) => {
                toast({ variant: 'destructive', title: 'Upload Gagal', description: error.message });
                setIsUploading(false);
            },
            async () => {
                const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                onChange(downloadUrl);
                setIsUploading(false);
                toast({ title: 'Upload Berhasil', description: `${label} telah diunggah.` });
            }
        );
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <FormLabel className="text-sm font-semibold">{label} {required && <span className="text-destructive">*</span>}</FormLabel>
                <Button type="button" variant="link" size="sm" className="text-xs h-7" onClick={() => setUseLink(!useLink)}>
                    {useLink ? 'Gunakan Upload File' : 'Gunakan Link External'}
                </Button>
            </div>
            {useLink ? (
                <div className="flex gap-2 items-center">
                    <Input placeholder="Tempel link Google Drive / Dropbox" value={value || ''} onChange={(e) => onChange(e.target.value)} className="h-9" />
                </div>
            ) : (
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <label htmlFor={`${pathPrefix}-upload`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), "h-9 cursor-pointer")}>
                            Choose File
                        </label>
                        <div className="flex-1 text-sm text-muted-foreground truncate border rounded-md h-9 px-3 flex items-center bg-muted/50">
                            {fileName || 'No file chosen'}
                        </div>
                        <Input id={`${pathPrefix}-upload`} ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" disabled={isUploading}/>
                    </div>
                    {isUploading && <Progress value={progress} className="h-1" />}
                </div>
            )}
             <p className="text-[10px] text-muted-foreground italic">
                {useLink ? "Pastikan izin link sudah 'siapa saja yang memiliki link'." : "Maks. 2MB. Untuk file lebih besar, gunakan link external."}
            </p>
        </div>
    );
}

interface SkillsFormProps {
    initialData: { 
        skills?: string[], 
        certifications?: any[], 
        cvUrl?: string, 
        ijazahUrl?: string 
    };
    onSaveSuccess: () => void;
    onBack: () => void;
}

export function SkillsForm({ initialData, onSaveSuccess, onBack }: SkillsFormProps) {
    const [isSaving, setIsSaving] = useState(false);
    const { firebaseUser } = useAuth();
    const firestore = useFirestore();
    const { toast } = useToast();

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            cvUrl: initialData?.cvUrl || '',
            ijazahUrl: initialData?.ijazahUrl || '',
            certifications: initialData?.certifications || [],
        },
    });

    const { fields: certFields, append: appendCert, remove: removeCert } = useFieldArray({
        control: form.control,
        name: "certifications",
    });

    const handleSubmit = async (values: FormValues) => {
        if (!firebaseUser) {
            toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in.' });
            return;
        }
        setIsSaving(true);
        try {
            const payload = {
                cvUrl: values.cvUrl,
                ijazahUrl: values.ijazahUrl,
                certifications: values.certifications,
                profileStatus: 'draft',
                profileStep: 6,
                updatedAt: serverTimestamp() as Timestamp,
            };
            const profileDocRef = doc(firestore, 'profiles', firebaseUser.uid);
            await setDocumentNonBlocking(profileDocRef, payload, { merge: true });
            
            toast({ title: 'Dokumen & Sertifikasi Disimpan', description: 'Melanjutkan ke langkah terakhir.' });
            onSaveSuccess();
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Gagal Menyimpan", description: error.message });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Unggah Dokumen Wajib</CardTitle>
                        <CardDescription>Lampirkan dokumen pendukung lamaran Anda. Ukuran file maksimal 2MB per file atau lampirkan link Google Drive jika ukuran file lebih besar.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-2">
                             <FormField
                                control={form.control}
                                name="cvUrl"
                                render={({ field }) => (
                                    <FormItem>
                                        <FileUploadField 
                                            label="Curriculum Vitae (CV)" 
                                            value={field.value} 
                                            onChange={field.onChange}
                                            userId={firebaseUser?.uid || ''}
                                            pathPrefix="cv"
                                            required
                                        />
                                        <FormMessage />
                                    </FormItem>
                                )}
                             />
                              <FormField
                                control={form.control}
                                name="ijazahUrl"
                                render={({ field }) => (
                                    <FormItem>
                                        <FileUploadField 
                                            label="Ijazah / SKL" 
                                            value={field.value} 
                                            onChange={field.onChange}
                                            userId={firebaseUser?.uid || ''}
                                            pathPrefix="ijazah"
                                            required
                                        />
                                        <FormMessage />
                                    </FormItem>
                                )}
                             />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Sertifikasi & Pelatihan (Opsional)</CardTitle>
                        <CardDescription>Sebutkan sertifikasi profesional atau kursus yang relevan dan lampirkan bukti foto/sertifikat.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                         <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
                            <Info className="h-4 w-4 text-blue-600" />
                            <AlertDescription className="text-xs text-blue-700 dark:text-blue-300">
                                Punya banyak sertifikat? Masukkan semua file ke dalam satu folder Google Drive, lalu bagikan link folder tersebut pada salah satu kolom "Link External".
                            </AlertDescription>
                        </Alert>
                        <div className="space-y-6">
                            {certFields.map((field, index) => (
                                <div key={field.id} className="space-y-4 p-5 border rounded-xl relative bg-muted/20">
                                    <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 text-destructive hover:bg-destructive/10 h-8 w-8" onClick={() => removeCert(index)}><Trash2 className="h-4 w-4" /></Button>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <FormField control={form.control} name={`certifications.${index}.name`} render={({ field }) => (<FormItem><FormLabel>Nama Sertifikasi <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} placeholder="Contoh: Certified Cloud Practitioner" value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                        <FormField control={form.control} name={`certifications.${index}.organization`} render={({ field }) => (<FormItem><FormLabel>Lembaga Penerbit <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} placeholder="Contoh: Amazon Web Services" value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <FormField control={form.control} name={`certifications.${index}.issueDate`} render={({ field }) => (<FormItem><FormLabel>Tgl Terbit <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} placeholder="YYYY-MM" value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>)} />
                                        <FormField control={form.control} name={`certifications.${index}.expirationDate`} render={({ field }) => (<FormItem><FormLabel>Tgl Kedaluwarsa</FormLabel><FormControl><Input {...field} value={field.value ?? ''} placeholder="YYYY-MM" /></FormControl><FormMessage /></FormItem>)} />
                                    </div>
                                    <FormField
                                        control={form.control}
                                        name={`certifications.${index}.imageUrl`}
                                        render={({ field }) => (
                                        <FormItem>
                                            <FileUploadField 
                                                label="Bukti Sertifikat (File/Link)" 
                                                value={field.value} 
                                                onChange={field.onChange}
                                                userId={firebaseUser?.uid || ''}
                                                pathPrefix={`cert_${index}`}
                                            />
                                            <FormMessage />
                                        </FormItem>
                                    )}/>
                                </div>
                            ))}
                        </div>
                        <Button type="button" variant="outline" className="w-full border-dashed" onClick={() => appendCert({ id: crypto.randomUUID(), name: '', organization: '', issueDate: '' })}><PlusCircle className="mr-2 h-4 w-4" /> Tambah Sertifikasi</Button>
                    </CardContent>
                </Card>

                <div className="flex justify-between pt-4">
                    <Button type="button" variant="secondary" onClick={onBack}>Kembali</Button>
                    <Button type="submit" disabled={isSaving} size="lg" className="min-w-[150px]">
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Simpan & Lanjut"}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
