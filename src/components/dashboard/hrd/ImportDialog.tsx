'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UploadCloud, Loader2, ArrowRight, Info, Edit, FileQuestion, HelpCircle, Sparkles, ArrowLeft, AlertCircle, CheckCircle, FileUp, XCircle, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HRP_FIELD_GROUPS, RECOMMENDED_HRP_FIELDS } from '@/lib/hrp-fields';
import { useAuth } from '@/providers/auth-provider';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportSuccess?: () => void;
}

interface ImportResult {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    errors: string[];
}

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

const parseCsv = (csvText: string): { headers: string[], rows: Record<string, string>[] } => {
    const lines = csvText.split(/\r\n|\n/);
    if (lines.length < 2) return { headers: [], rows: [] };
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
        const rowObject: Record<string, string> = {};
        headers.forEach((header, index) => {
            rowObject[header] = values[index];
        });
        return rowObject;
    }).filter(row => Object.values(row).some(val => val)); // Filter out empty rows

    return { headers, rows };
};


export function ImportDialog({ open, onOpenChange, onImportSuccess }: ImportDialogProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [step, setStep] = useState(1);
    const [isProcessing, setIsProcessing] = useState(false);
    
    const [csvData, setCsvData] = useState<{ headers: string[], rows: Record<string, string>[] }>({ headers: [], rows: [] });
    const [columnMapping, setColumnMapping] = useState<Record<string, string | undefined>>({});
    const [customFieldNames, setCustomFieldNames] = useState<Record<string, string>>({});
    const [importResult, setImportResult] = useState<ImportResult | null>(null);

    const { toast } = useToast();
    const { firebaseUser } = useAuth();

    const resetState = () => {
        setSelectedFile(null);
        setIsDragging(false);
        setStep(1);
        setCsvData({ headers: [], rows: [] });
        setColumnMapping({});
        setCustomFieldNames({});
        setImportResult(null);
    };
    
    const handleClose = (isOpen: boolean) => {
        if (!isOpen) {
            setTimeout(resetState, 300); // Delay reset to allow for closing animation
        }
        onOpenChange(isOpen);
    };

    const handleFileSelect = useCallback((file: File | null) => {
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
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
            const { headers, rows } = parseCsv(text);
            if (headers.length === 0) {
                 toast({ variant: 'destructive', title: 'File Kosong atau Tidak Valid', description: 'Pastikan file CSV Anda memiliki header dan data.' });
                 return;
            }
            setCsvData({ headers, rows });
            
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
    
    const { unmappedRequiredFields, mappingSummary } = useMemo(() => {
        const mappedValues = new Set(Object.values(columnMapping).filter((v): v is string => !!v && v !== '__skip__' && v !== '__custom__'));
        const mappedRecommended = RECOMMENDED_HRP_FIELDS.filter(field => mappedValues.has(field.value));
        const unmappedRecommended = RECOMMENDED_HRP_FIELDS.filter(field => !mappedValues.has(field.value));
        const autoDetectedCount = csvData.headers.filter(header => suggestMapping(header) && columnMapping[header] === suggestMapping(header)).length;
        const skippedCount = Object.values(columnMapping).filter(v => v === undefined || v === '__skip__').length;
        const mappedManuallyCount = Object.values(columnMapping).filter(v => v && v !== '__skip__' && v !== '__custom__' && !suggestMapping(Object.keys(columnMapping).find(k => columnMapping[k] === v) || '')).length;


        return {
            unmappedRequiredFields: unmappedRecommended,
            mappingSummary: {
                autoDetected: autoDetectedCount,
                mappedManually: mappedManuallyCount,
                unmapped: Object.keys(columnMapping).filter(k => !columnMapping[k]).length,
                skipped: skippedCount,
                requiredProgress: `${mappedRecommended.length}/${RECOMMENDED_HRP_FIELDS.length}`,
            }
        };
    }, [columnMapping, csvData.headers]);

    const isMappingComplete = unmappedRequiredFields.length === 0;

    const handleMappingChange = (csvHeader: string, hrpField: string) => {
        setColumnMapping(prev => ({...prev, [csvHeader]: hrpField === '__skip__' ? undefined : hrpField}));
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

    const handleImportFinal = async () => {
        if (!firebaseUser) {
             toast({ variant: 'destructive', title: 'Sesi tidak valid', description: 'Silakan login kembali.' });
             return;
        }
        setIsProcessing(true);
        try {
            const idToken = await firebaseUser.getIdToken(true); // Force refresh token
            const response = await fetch('/api/admin/import-employees', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    rows: csvData.rows,
                    mapping: columnMapping,
                    customFields: customFieldNames,
                }),
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Terjadi kesalahan di server.');
            }
            setImportResult(result);
            setStep(4);
            onImportSuccess?.();
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Gagal Mengimpor Data', description: e.message });
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className={cn(
                "max-w-xl transition-all duration-300", 
                (step === 2 || step === 3) && "sm:max-w-5xl h-[90vh] flex flex-col p-0",
                step === 4 && "sm:max-w-lg"
            )}>
                <DialogHeader className={cn("p-6 pb-2", step >= 2 && "border-b")}>
                    <DialogTitle>
                      {step === 1 && 'Import Data Karyawan'}
                      {step === 2 && 'Tahap 2: Pemetaan Kolom'}
                      {step === 3 && 'Tahap 3: Pratinjau & Konfirmasi'}
                      {step === 4 && 'Hasil Impor'}
                    </DialogTitle>
                    <DialogDescription>
                       {step === 1 && 'Unggah file CSV untuk menambah atau memperbarui data karyawan secara massal.'}
                       {step === 2 && 'Sesuaikan kolom dari file Anda dengan field yang ada di sistem HRP.'}
                       {step === 3 && 'Tinjau beberapa baris data Anda sebelum mengimpor secara final.'}
                       {step === 4 && 'Berikut adalah ringkasan dari proses impor yang telah selesai.'}
                    </DialogDescription>
                </DialogHeader>
                
                {step === 1 && (
                     <div className="p-6">
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
                    <div className="flex-grow overflow-y-auto px-6">
                        <div className="py-4 space-y-4">
                            <Alert>
                                <Info className="h-4 w-4" />
                                <AlertTitle>Petunjuk Pemetaan</AlertTitle>
                                <AlertDescription>
                                    Kolom di kiri adalah header dari file Anda. Pilih field tujuan yang sesuai di HRP pada dropdown di kanan. Field yang ditandai <strong className="text-destructive">*</strong> disarankan untuk dipetakan.
                                </AlertDescription>
                            </Alert>
                             <div className="rounded-md border max-h-[55vh]">
                                <ScrollArea className="h-full">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-muted z-10">
                                        <TableRow>
                                            <TableHead className="w-[40%] font-bold">Kolom dari File Anda</TableHead>
                                            <TableHead className="w-[45%] font-bold">Petakan ke Field Sistem HRP</TableHead>
                                            <TableHead className="w-[15%] text-center font-bold">Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {csvData.headers.map(header => {
                                            const mappedValue = columnMapping[header];
                                            const isAutoSuggested = !!suggestMapping(header) && mappedValue === suggestMapping(header);
                                            const isCustom = mappedValue === '__custom__';

                                            return (
                                            <TableRow key={header}>
                                                <TableCell className="font-semibold bg-slate-50 dark:bg-slate-900">{header}</TableCell>
                                                <TableCell>
                                                    <div className="space-y-2">
                                                        <Select onValueChange={(value) => handleMappingChange(header, value)} value={mappedValue || '__skip__'}>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="(Jangan Impor Kolom Ini)" />
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
                                                    {isAutoSuggested ? <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/50 dark:text-green-300">Otomatis</Badge> : (mappedValue ? (mappedValue === '__skip__' ? <Badge variant="outline">Diabaikan</Badge> : (mappedValue === '__custom__' ? <Badge>Kustom</Badge> : <Badge variant="default">Dipilih</Badge>)) : <Badge variant="outline">Belum</Badge>)}
                                                </TableCell>
                                            </TableRow>
                                        )})}
                                    </TableBody>
                                </Table>
                                </ScrollArea>
                            </div>
                        </div>
                    </div>
                )}
                
                {step === 3 && (
                     <div className="flex-grow overflow-y-auto px-6">
                        <div className="py-4 space-y-4">
                             <Alert>
                                <Info className="h-4 w-4" />
                                <AlertTitle>Pratinjau Impor</AlertTitle>
                                <AlertDescription>Ini adalah 5 baris pertama dari data Anda berdasarkan pemetaan yang telah Anda atur. Periksa kembali sebelum melanjutkan.</AlertDescription>
                            </Alert>
                             <div className="rounded-md border max-h-[60vh]">
                                <ScrollArea className="h-full">
                                    <Table>
                                        <TableHeader className="sticky top-0 bg-muted z-10">
                                            <TableRow>
                                                {csvData.headers.map(header => {
                                                    const mappedField = columnMapping[header];
                                                    const isSkipped = !mappedField || mappedField === '__skip__';
                                                    if (isSkipped) return null;
                                                    const hrpField = mappedField === '__custom__'
                                                        ? customFieldNames[header]
                                                        : RECOMMENDED_HRP_FIELDS.find(f => f.value === mappedField)?.label;
                                                    return <TableHead key={header}>{hrpField || header}</TableHead>;
                                                })}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {csvData.rows.slice(0, 5).map((row, rowIndex) => (
                                                <TableRow key={rowIndex}>
                                                    {csvData.headers.map(header => {
                                                        const mappedField = columnMapping[header];
                                                        const isSkipped = !mappedField || mappedField === '__skip__';
                                                        if (isSkipped) return null;
                                                        return <TableCell key={`${rowIndex}-${header}`}>{row[header]}</TableCell>;
                                                    })}
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </ScrollArea>
                            </div>
                        </div>
                    </div>
                )}

                {step === 4 && (
                    <div className="p-6">
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold">Ringkasan Hasil Impor</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Berhasil Dibuat</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{importResult?.created || 0}</p></CardContent></Card>
                                <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Berhasil Diperbarui</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{importResult?.updated || 0}</p></CardContent></Card>
                                <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Gagal/Dilewati</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-destructive">{importResult?.failed || 0}</p></CardContent></Card>
                                <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Total Diproses</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{csvData.rows.length}</p></CardContent></Card>
                            </div>
                            {importResult && importResult.errors.length > 0 && (
                                <Alert variant="destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle>Detail Kegagalan</AlertTitle>
                                    <AlertDescription>
                                        <ScrollArea className="h-24">
                                            <ul className="list-disc pl-5">
                                                {importResult.errors.map((err, i) => <li key={i} className="text-xs">{err}</li>)}
                                            </ul>
                                        </ScrollArea>
                                    </AlertDescription>
                                </Alert>
                            )}
                        </div>
                    </div>
                )}
                
                <DialogFooter className={cn( "justify-between items-center p-6 pt-2 border-t flex-shrink-0", step === 1 && "justify-end" )}>
                    {step > 1 && step < 4 && (
                        <div className="text-xs text-muted-foreground">
                            {step === 2 && (
                                !isMappingComplete ? (
                                    <Alert variant="warning" className="text-xs">
                                        <AlertCircle className="h-4 w-4" />
                                        <AlertTitle>Rekomendasi Belum Lengkap</AlertTitle>
                                        <AlertDescription>
                                            Harap petakan: {unmappedRequiredFields.map(f => `"${f.label}"`).join(', ')}.
                                        </AlertDescription>
                                    </Alert>
                                ) : (
                                    <div className="flex items-center gap-2 text-green-600">
                                        <CheckCircle className="h-4 w-4" />
                                        <span>Semua field rekomendasi telah dipetakan.</span>
                                    </div>
                                )
                            )}
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        {step > 1 && step < 4 && <Button variant="ghost" onClick={() => setStep(s => s - 1)}><ArrowLeft className="mr-2 h-4 w-4" /> Kembali</Button>}
                        {step < 4 && <DialogClose asChild><Button variant="outline">Batal</Button></DialogClose>}
                        {step === 1 && <Button onClick={handleNextStep} disabled={!selectedFile}>Lanjut ke Pemetaan Kolom <ArrowRight className="ml-2 h-4 w-4" /></Button>}
                        {step === 2 && <Button onClick={() => setStep(3)}>Lanjut ke Preview <ArrowRight className="ml-2 h-4 w-4" /></Button>}
                        {step === 3 && <Button onClick={handleImportFinal} disabled={isProcessing}>{isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Import Final</Button>}
                        {step === 4 && <Button onClick={() => handleClose(false)}>Selesai</Button>}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
