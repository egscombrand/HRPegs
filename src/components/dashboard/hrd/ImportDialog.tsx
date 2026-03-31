
'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UploadCloud, Loader2, ArrowRight, Info, Edit, FileQuestion, HelpCircle, Sparkles, ArrowLeft, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportSuccess?: () => void;
}

type HRPField = {
    value: string;
    label: string;
    required?: boolean;
    description?: string;
};

const HRP_FIELD_GROUPS: Record<string, HRPField[]> = {
    "Data Pribadi": [
        { value: "fullName", label: "Nama Lengkap", required: true, description: "Nama lengkap karyawan sesuai KTP." },
        { value: "birthPlace", label: "Tempat Lahir", description: "Kota tempat karyawan dilahirkan." },
        { value: "birthDate", label: "Tanggal Lahir", description: "Format: YYYY-MM-DD" },
        { value: "gender", label: "Jenis Kelamin", description: "Laki-laki atau Perempuan." },
        { value: "maritalStatus", label: "Status Pernikahan" },
        { value: "address", label: "Alamat", description: "Alamat lengkap saat ini." },
        { value: "phone", label: "Kontak (No. HP)" },
        { value: "email", label: "Kontak (Email)", required: true },
    ],
    "Informasi Pekerjaan": [
        { value: "employeeNumber", label: "Nomor Induk Karyawan (NIK)", required: true, description: "Nomor identifikasi unik internal perusahaan." },
        { value: "positionTitle", label: "Jabatan/Posisi", required: true },
        { value: "division", label: "Departemen/Bagian", required: true },
        { value: "joinDate", label: "Tanggal Mulai Bekerja", required: true, description: "Format: YYYY-MM-DD" },
        { value: "employmentType", label: "Jenis Kontrak Kerja", description: "Contoh: Tetap, Kontrak, Harian." },
        { value: "employmentStatus", label: "Status Kerja", required: true, description: "Contoh: active, probation, resigned." },
        { value: "brandName", label: "Nama Brand", required: true },
        { value: "managerName", label: "Nama Manajer Divisi" },
    ],
    "Data Administratif": [
        { value: "nik", label: "No. KTP/SIM", required: true },
        { value: "npwp", label: "NPWP" },
        { value: "bpjsKesehatan", label: "No. BPJS Kesehatan" },
        { value: "bpjsKetenagakerjaan", label: "No. BPJS Ketenagakerjaan" },
        { value: "bankAccountNumber", label: "No. Rekening Bank" },
    ],
    "Riwayat Pendidikan dan Pelatihan": [
        { value: 'education', label: 'Pendidikan Terakhir' },
        { value: 'certification', label: 'Sertifikasi' },
    ],
    "Riwayat Karier dan Kinerja": [
        { value: 'promotion', label: 'Riwayat Promosi' },
        { value: 'performanceReview', label: 'Riwayat Penilaian Kinerja' },
    ],
};


const HRP_FIELDS: HRPField[] = Object.values(HRP_FIELD_GROUPS).flat();
const REQUIRED_HRP_FIELDS = HRP_FIELDS.filter(f => f.required);

const normalizeHeader = (header: string) => header ? header.toLowerCase().replace(/[\s_]+/g, '') : '';

const suggestMapping = (header: string): string => {
    const normalizedHeader = normalizeHeader(header);
    if (!normalizedHeader) return '';

    const keywordMap: Record<string, string[]> = {
        fullName: ['nama', 'namalengkap', 'fullname'],
        email: ['email', 'emailkantor', 'emailaddress'],
        phone: ['telepon', 'hp', 'nohp', 'phone', 'kontak'],
        employeeNumber: ['nik', 'nomorinduk', 'nomorkaryawan', 'employeeid'],
        brandName: ['brand', 'perusahaan', 'company'],
        division: ['divisi', 'division', 'departemen', 'department'],
        positionTitle: ['jabatan', 'posisi', 'jabatandikantor', 'position'],
        managerName: ['manager', 'atasan', 'supervisor', 'pic'],
        joinDate: ['join', 'masuk', 'tanggalbergabung', 'joindate', 'hiredate', 'tglmasuk'],
        employmentStatus: ['status', 'employmentstatus', 'statuskerja'],
        nik: ['ktp', 'noktp', 'nomorktp', 'identitynumber'],
        npwp: ['npwp', 'nomornpwp'],
        bpjsKesehatan: ['bpjskesehatan'],
        bpjsKetenagakerjaan: ['bpjsketenagakerjaan', 'bpjstk'],
        bankAccountNumber: ['rekening', 'norek', 'bankaccount'],
    };

    for (const hrpField in keywordMap) {
        for (const keyword of keywordMap[hrpField]) {
            if (normalizedHeader.includes(keyword)) {
                return hrpField;
            }
        }
    }
    return '';
};

export function ImportDialog({ open, onOpenChange, onImportSuccess }: ImportDialogProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [step, setStep] = useState(1);
    const [isSaving, setIsSaving] = useState(false);
    const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
    const [columnMapping, setColumnMapping] = useState<Record<string, string | undefined>>({});
    const [customFieldNames, setCustomFieldNames] = useState<Record<string, string>>({});
    const { toast } = useToast();

    const resetState = () => {
        setSelectedFile(null);
        setIsDragging(false);
        setStep(1);
        setCsvHeaders([]);
        setColumnMapping({});
        setCustomFieldNames({});
    };
    
    const handleClose = (isOpen: boolean) => {
        if (!isOpen) {
            setTimeout(resetState, 300);
        }
        onOpenChange(isOpen);
    };

    const handleFileSelect = useCallback((file: File | null) => {
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            toast({ variant: 'destructive', title: 'File Terlalu Besar', description: 'Ukuran file tidak boleh melebihi 5MB.' });
            return;
        }
        if (!file.name.endsWith('.csv')) {
            toast({ variant: 'destructive', title: 'Format Tidak Valid', description: 'Saat ini hanya file .csv yang didukung.' });
            return;
        }
        setSelectedFile(file);
    }, [toast]);
    
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => handleFileSelect(e.target.files?.[0] || null);
    const handleDragEvents = (e: React.DragEvent<HTMLLabelElement>, isEntering: boolean) => { e.preventDefault(); e.stopPropagation(); setIsDragging(isEntering); };
    const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => { handleDragEvents(e, false); handleFileSelect(e.dataTransfer.files?.[0] || null); };
    
    const handleNextStep = () => {
        if (!selectedFile) {
            toast({ variant: 'destructive', title: 'Tidak ada file', description: 'Silakan pilih file CSV untuk diimpor.' });
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            const firstLine = text.split('\n')[0].trim();
            const headers = firstLine.split(',').map(h => h.trim().replace(/"/g, ''));
            setCsvHeaders(headers);
            
            const initialMapping: Record<string, string | undefined> = {};
            headers.forEach(header => {
              const suggestion = suggestMapping(header);
              initialMapping[header] = suggestion || undefined;
            });
            setColumnMapping(initialMapping);

            setStep(2);
        };
        reader.readAsText(selectedFile);
    };
    
    const { isMappingComplete, unmappedRequiredFields, mappingSummary } = useMemo(() => {
        const mappedValues = new Set(Object.values(columnMapping).filter((v): v is string => !!v && !v.startsWith('__custom__')));
        const mappedRequired = REQUIRED_HRP_FIELDS.filter(field => mappedValues.has(field.value));
        const unmappedRequired = REQUIRED_HRP_FIELDS.filter(field => !mappedValues.has(field.value));

        const requiredCount = REQUIRED_HRP_FIELDS.length;
        const mappedRequiredCount = mappedRequired.length;
        const complete = mappedRequiredCount === requiredCount;
        
        const autoDetectedCount = csvHeaders.filter(header => {
            const suggestion = suggestMapping(header);
            return suggestion && columnMapping[header] === suggestion;
        }).length;
        
        const unmappedCount = csvHeaders.filter(header => !columnMapping[header]).length;

        return {
            isMappingComplete: complete,
            unmappedRequiredFields: unmappedRequired,
            mappingSummary: {
                autoDetected: autoDetectedCount,
                unmapped: unmappedCount,
                requiredProgress: `${mappedRequiredCount}/${requiredCount}`,
            }
        };
    }, [columnMapping, csvHeaders]);

    const handleMappingChange = (csvHeader: string, hrpField: string | undefined) => {
        setColumnMapping(prev => ({...prev, [csvHeader]: hrpField}));
        if (hrpField !== '__custom__') {
          setCustomFieldNames(prev => {
            const newNames = { ...prev };
            delete newNames[csvHeader];
            return newNames;
          });
        }
    };
    
    const handleCustomFieldNameChange = (csvHeader: string, customName: string) => {
      setCustomFieldNames(prev => ({...prev, [csvHeader]: customName }));
    }

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className={cn("sm:max-w-xl transition-all duration-300", step === 2 && "sm:max-w-5xl")}>
                <DialogHeader>
                    <DialogTitle>
                      {step === 1 ? 'Import Data Karyawan' : 'Tahap 2: Pemetaan Kolom'}
                    </DialogTitle>
                    <DialogDescription>
                       {step === 1 
                         ? 'Unggah file CSV untuk menambah atau memperbarui data karyawan secara massal.'
                         : 'Sesuaikan kolom dari file Anda dengan field yang ada di sistem HRP.'
                       }
                    </DialogDescription>
                </DialogHeader>
                
                {step === 1 && (
                     <div className="py-6">
                       <label 
                            htmlFor="dropzone-file"
                            className={cn( "flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer bg-muted transition-colors", isDragging ? "border-primary bg-primary/10" : "hover:bg-muted/80" )}
                            onDragOver={(e) => handleDragEvents(e, true)} onDragLeave={(e) => handleDragEvents(e, false)}
                            onDragEnd={(e) => handleDragEvents(e, false)} onDrop={handleDrop}
                        >
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                <UploadCloud className="w-8 h-8 mb-4 text-muted-foreground" />
                                {selectedFile ? (
                                    <><p className="font-semibold text-foreground">{selectedFile.name}</p><p className="text-xs text-muted-foreground">({(selectedFile.size / 1024).toFixed(2)} KB)</p></>
                                ) : (
                                    <><p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold">Klik untuk mengunggah</span> atau seret file ke sini</p><p className="text-xs text-muted-foreground">Hanya format .csv (Maks. 5MB)</p></>
                                )}
                            </div>
                            <input id="dropzone-file" type="file" className="hidden" onChange={handleFileChange} accept=".csv" />
                        </label> 
                    </div>
                )}
                
                {step === 2 && (
                    <div className="py-4 space-y-4">
                        <Alert>
                           <Info className="h-4 w-4" />
                            <AlertTitle>Petunjuk Pemetaan</AlertTitle>
                            <AlertDescription>
                                Kolom di kiri adalah header dari file Anda. Pilih field tujuan yang sesuai di HRP pada dropdown di kanan. Field dengan tanda <span className="text-destructive font-bold">*</span> wajib untuk dipetakan.
                            </AlertDescription>
                        </Alert>
                        <div className="rounded-md border h-96 overflow-y-auto">
                            <Table>
                                <TableHeader className="sticky top-0 bg-muted z-10">
                                    <TableRow>
                                        <TableHead className="w-[40%] font-bold">Kolom dari File Anda</TableHead>
                                        <TableHead className="w-[45%] font-bold">Petakan ke Field Sistem HRP</TableHead>
                                        <TableHead className="w-[15%] text-center font-bold">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {csvHeaders.map(header => {
                                        const mappedValue = columnMapping[header];
                                        const isAutoSuggested = !!suggestMapping(header) && mappedValue === suggestMapping(header);
                                        const isCustom = mappedValue === '__custom__';

                                        return (
                                        <TableRow key={header}>
                                            <TableCell className="font-semibold bg-slate-50 dark:bg-slate-900">{header}</TableCell>
                                            <TableCell>
                                                <div className="space-y-2">
                                                    <Select onValueChange={(value) => handleMappingChange(header, value === '__skip__' ? undefined : value)} value={mappedValue || '__skip__'}>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Pilih field tujuan..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="__skip__">(Jangan Impor Kolom Ini)</SelectItem>
                                                            <SelectSeparator />
                                                            {Object.entries(HRP_FIELD_GROUPS).map(([group, fields]) => (
                                                                <SelectGroup key={group}>
                                                                    <SelectLabel>{group}</SelectLabel>
                                                                    {fields.map(field => (
                                                                        <SelectItem key={field.value} value={field.value}>
                                                                            {field.label} {field.required && <span className="text-destructive">*</span>}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectGroup>
                                                            ))}
                                                             <SelectSeparator />
                                                             <SelectItem value="__custom__">Buat Field Baru...</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                     {isCustom && (
                                                        <Input 
                                                            placeholder="Masukkan nama field baru..."
                                                            value={customFieldNames[header] || ''}
                                                            onChange={(e) => handleCustomFieldNameChange(header, e.target.value)}
                                                        />
                                                     )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {isAutoSuggested ? <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">Otomatis</Badge> : (mappedValue ? <Badge variant="default">Dipilih</Badge> : <Badge variant="outline">Belum</Badge>)}
                                            </TableCell>
                                        </TableRow>
                                    )})}
                                </TableBody>
                            </Table>
                        </div>
                        
                        <div className="flex justify-between items-center text-sm text-muted-foreground pt-2">
                            <span className={cn("font-semibold", isMappingComplete ? 'text-green-600' : 'text-amber-600')}>
                                Field Wajib Terpenuhi: <strong>{mappingSummary.requiredProgress}</strong>
                            </span>
                            <div className="flex items-center gap-4">
                                <span>Otomatis Terdeteksi: <strong>{mappingSummary.autoDetected}</strong></span>
                                <span>Belum Dipetakan: <strong>{mappingSummary.unmapped}</strong></span>
                            </div>
                        </div>
                        
                        {!isMappingComplete && (
                            <Alert variant="destructive" className="text-xs">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>Field Wajib Belum Lengkap</AlertTitle>
                                <AlertDescription>
                                    Harap petakan field berikut: {unmappedRequiredFields.map(f => `"${f.label}"`).join(', ')}.
                                </AlertDescription>
                            </Alert>
                        )}
                    </div>
                )}
                
                {step === 3 && (
                    <div className="py-4 space-y-4">
                        <Alert>
                           <Info className="h-4 w-4" />
                            <AlertTitle>Pratinjau & Validasi Data</AlertTitle>
                            <AlertDescription>
                                Fitur pratinjau data dan validasi sebelum import final sedang dalam pengembangan.
                            </AlertDescription>
                        </Alert>
                    </div>
                )}

                <DialogFooter className="justify-between items-center">
                    {step > 1 ? (
                        <Button variant="ghost" onClick={() => setStep(step - 1)}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Kembali
                        </Button>
                    ) : <div />}

                    <div className="flex items-center gap-2">
                        <DialogClose asChild><Button variant="outline">Batal</Button></DialogClose>
                        {step === 1 && (
                            <Button onClick={handleNextStep} disabled={!selectedFile}>
                                Lanjut ke Pemetaan Kolom <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        )}
                        {step === 2 && (
                            !isMappingComplete ? (
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="inline-block">
                                                <Button disabled={true}>
                                                    Lanjut ke Preview <ArrowRight className="ml-2 h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Harap petakan semua field wajib (*).</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            ) : (
                                <Button onClick={() => setStep(3)}>
                                    Lanjut ke Preview <ArrowRight className="ml-2 h-4 w-4" />
                                </Button>
                            )
                        )}
                        {step === 3 && (
                            <Button onClick={() => alert('Importing...')} disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Import Final
                            </Button>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
