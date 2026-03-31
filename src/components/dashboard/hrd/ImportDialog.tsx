'use client';

import { useState, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UploadCloud, Loader2, ArrowRight, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const HRP_FIELDS = [
  { group: "Identitas Dasar", value: "fullName", label: "Nama Lengkap", required: true },
  { group: "Identitas Dasar", value: "email", label: "Email", required: true },
  { group: "Identitas Dasar", value: "phone", label: "No. HP", required: false },
  { group: "Identitas Dasar", value: "employeeNumber", label: "NIK Internal", required: false },

  { group: "Informasi Kepegawaian", value: "brandName", label: "Nama Brand", required: true },
  { group: "Informasi Kepegawaian", value: "division", label: "Divisi", required: true },
  { group: "Informasi Kepegawaian", value: "positionTitle", label: "Jabatan", required: true },
  { group: "Informasi Kepegawaian", value: "managerName", label: "Nama Manajer", required: false },
  { group: "Informasi Kepegawaian", value: "joinDate", label: "Tanggal Bergabung (YYYY-MM-DD)", required: false },
  { group: "Informasi Kepegawaian", value: "employmentStatus", label: "Status Kerja", required: true },
];

const REQUIRED_HRP_FIELDS = HRP_FIELDS.filter(f => f.required).map(f => f.value);

const normalizeHeader = (header: string) => header.toLowerCase().replace(/[\s_]+/g, '');

const suggestMapping = (header: string): string => {
    const normalizedHeader = normalizeHeader(header);
    if (!normalizedHeader) return '';

    const keywordMap: Record<string, string[]> = {
        fullName: ['nama', 'namalengkap', 'fullname'],
        email: ['email', 'emailkantor', 'emailaddress'],
        phone: ['telepon', 'hp', 'nohp', 'phone'],
        employeeNumber: ['nik', 'nomorinduk'],
        brandName: ['brand', 'perusahaan', 'company'],
        division: ['divisi', 'division'],
        positionTitle: ['jabatan', 'posisi', 'jabatandikantor', 'position'],
        managerName: ['manager', 'atasan', 'supervisor'],
        joinDate: ['join', 'masuk', 'tanggalbergabung'],
        employmentStatus: ['status', 'employmentstatus', 'statuskerja'],
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


export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [step, setStep] = useState(1);
    const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
    const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
    const { toast } = useToast();

    const resetState = () => {
        setSelectedFile(null);
        setIsDragging(false);
        setStep(1);
        setCsvHeaders([]);
        setColumnMapping({});
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
            const headers = firstLine.split(',');
            setCsvHeaders(headers);
            
            const initialMapping: Record<string, string> = {};
            headers.forEach(header => {
              initialMapping[header] = suggestMapping(header);
            });
            setColumnMapping(initialMapping);

            setStep(2);
        };
        reader.readAsText(selectedFile);
    };
    
    const { mappedRequiredFields, isMappingComplete, mappingSummary } = useMemo(() => {
        const mappedValues = new Set(Object.values(columnMapping).filter(Boolean));
        const requiredCount = REQUIRED_HRP_FIELDS.length;
        const mappedRequiredCount = REQUIRED_HRP_FIELDS.filter(field => mappedValues.has(field)).length;
        const complete = mappedRequiredCount === requiredCount;
        
        const autoDetectedCount = csvHeaders.filter(header => {
            const suggestion = suggestMapping(header);
            return suggestion && columnMapping[header] === suggestion;
        }).length;
        
        const unmappedCount = Object.values(columnMapping).filter(v => !v).length;

        return {
            mappedRequiredFields: mappedRequiredCount,
            isMappingComplete: complete,
            mappingSummary: {
                autoDetected: autoDetectedCount,
                unmapped: unmappedCount,
                requiredProgress: `${mappedRequiredCount}/${requiredCount}`,
            }
        };
    }, [columnMapping, csvHeaders]);

    const handleMappingChange = (csvHeader: string, hrpField: string) => {
        setColumnMapping(prev => ({...prev, [csvHeader]: hrpField}));
    }

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className={cn("sm:max-w-xl transition-all duration-300", step === 2 && "sm:max-w-4xl")}>
                <DialogHeader>
                    <DialogTitle>
                      {step === 1 ? 'Import Data Karyawan' : 'Tahap 2: Pemetaan Kolom'}
                    </DialogTitle>
                    <DialogDescription>
                       {step === 1 
                         ? 'Unggah file CSV untuk menambah atau memperbarui data karyawan secara massal.'
                         : 'Sesuaikan kolom dari file Anda (kiri) dengan field yang ada di sistem HRP (kanan).'
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
                            <AlertTitle>Instruksi Pemetaan</AlertTitle>
                            <AlertDescription>
                                Kolom di kiri adalah header dari file Anda. Pilih field tujuan yang sesuai di sistem HRP pada dropdown di kanan. Field dengan tanda <span className="text-destructive font-bold">*</span> wajib untuk dipetakan.
                            </AlertDescription>
                        </Alert>
                        <div className="rounded-md border h-80 overflow-y-auto">
                            <Table>
                                <TableHeader className="sticky top-0 bg-muted z-10">
                                    <TableRow>
                                        <TableHead className="w-[45%]">Kolom dari File Anda</TableHead>
                                        <TableHead className="w-[45%]">Petakan ke Field Sistem HRP</TableHead>
                                        <TableHead className="w-[10%] text-center">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {csvHeaders.map(header => {
                                        const mappedValue = columnMapping[header];
                                        const isAutoSuggested = !!suggestMapping(header) && mappedValue === suggestMapping(header);
                                        return (
                                        <TableRow key={header}>
                                            <TableCell className="font-medium text-muted-foreground">{header}</TableCell>
                                            <TableCell>
                                                <Select value={mappedValue || ''} onValueChange={(value) => handleMappingChange(header, value)}>
                                                    <SelectTrigger><SelectValue placeholder="Pilih field..." /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="">Jangan Impor Kolom Ini</SelectItem>
                                                        {HRP_FIELDS.reduce((acc, field) => {
                                                            const groupKey = field.group || 'Lainnya';
                                                            if (!acc.find(g => (g as React.ReactElement).key === groupKey)) {
                                                                acc.push(<SelectGroup key={groupKey}><SelectLabel>{groupKey}</SelectLabel></SelectGroup>);
                                                            }
                                                            acc.push(<SelectItem key={field.value} value={field.value}>{field.label} {field.required && <span className="text-destructive">*</span>}</SelectItem>);
                                                            return acc;
                                                        }, [] as React.ReactNode[])}
                                                    </SelectContent>
                                                </Select>
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
                    </div>
                )}

                <DialogFooter>
                    {step === 1 && (
                        <>
                           <Button variant="ghost" onClick={() => handleClose(false)}>Batal</Button>
                           <Button onClick={handleNextStep} disabled={!selectedFile}>
                                Lanjut ke Pemetaan Kolom <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </>
                    )}
                    {step === 2 && (
                        <>
                           <Button variant="ghost" onClick={() => setStep(1)}>Kembali</Button>
                           <Button disabled={!isMappingComplete} title={!isMappingComplete ? 'Harap petakan semua field wajib (*)' : ''}>
                                Lanjut ke Preview <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
