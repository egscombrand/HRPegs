'use client';

import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UploadCloud, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const HRP_FIELDS = [
  { value: "fullName", label: "Nama Lengkap" },
  { value: "email", label: "Email" },
  { value: "phone", label: "No. HP" },
  { value: "employeeNumber", label: "NIK Internal" },
  { value: "brandName", label: "Nama Brand" },
  { value: "division", label: "Divisi" },
  { value: "positionTitle", label: "Jabatan" },
  { value: "managerName", label: "Nama Manajer" },
  { value: "joinDate", label: "Tanggal Bergabung (YYYY-MM-DD)" },
  { value: "employmentStatus", label: "Status Kerja" },
];

export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [step, setStep] = useState(1);
    const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
    const { toast } = useToast();

    const resetState = () => {
        setSelectedFile(null);
        setIsDragging(false);
        setStep(1);
        setCsvHeaders([]);
    };
    
    const handleClose = (isOpen: boolean) => {
        if (!isOpen) {
            setTimeout(resetState, 300);
        }
        onOpenChange(isOpen);
    };

    const handleFileSelect = useCallback((file: File | null) => {
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            toast({ variant: 'destructive', title: 'File Terlalu Besar', description: 'Ukuran file tidak boleh melebihi 5MB.' });
            return;
        }

        if (!file.type.includes('csv') && !file.type.includes('spreadsheet')) {
            toast({ variant: 'destructive', title: 'Format Tidak Valid', description: 'Silakan unggah file CSV atau XLSX.' });
            return;
        }

        setSelectedFile(file);
    }, [toast]);
    
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        handleFileSelect(e.target.files?.[0] || null);
    };
    
    const handleDragEvents = (e: React.DragEvent<HTMLLabelElement>, isEntering: boolean) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(isEntering);
    };

    const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
        handleDragEvents(e, false);
        const file = e.dataTransfer.files?.[0];
        if (file) {
            handleFileSelect(file);
        }
    };
    
    const handleNextStep = () => {
        if (!selectedFile) {
            toast({ variant: 'destructive', title: 'Tidak ada file', description: 'Silakan pilih file untuk diimpor.' });
            return;
        }
        // Placeholder for CSV parsing logic
        // In a real scenario, you'd parse the first row of the CSV here.
        setCsvHeaders(['NAMA_LENGKAP', 'EMAIL_KANTOR', 'NO_TELEPON', 'JABATAN_DI_KANTOR', 'DIVISI', 'TANGGAL_MASUK']);
        setStep(2);
    };


    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className={cn("sm:max-w-xl transition-all duration-300", step === 2 && "sm:max-w-4xl")}>
                <DialogHeader>
                    <DialogTitle>
                      {step === 1 ? 'Import Data Karyawan' : 'Pemetaan Kolom'}
                    </DialogTitle>
                    <DialogDescription>
                       {step === 1 
                         ? 'Unggah file CSV atau XLSX untuk menambah atau memperbarui data karyawan secara massal.'
                         : 'Petakan kolom dari file Anda ke field yang sesuai di sistem HRP.'
                       }
                    </DialogDescription>
                </DialogHeader>
                
                {step === 1 && (
                     <div className="py-6">
                       <label 
                            htmlFor="dropzone-file"
                            className={cn(
                                "flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer bg-muted transition-colors",
                                isDragging ? "border-primary bg-primary/10" : "hover:bg-muted/80"
                            )}
                            onDragOver={(e) => handleDragEvents(e, true)}
                            onDragLeave={(e) => handleDragEvents(e, false)}
                            onDragEnd={(e) => handleDragEvents(e, false)}
                            onDrop={handleDrop}
                        >
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                <UploadCloud className="w-8 h-8 mb-4 text-muted-foreground" />
                                {selectedFile ? (
                                    <>
                                        <p className="font-semibold text-foreground">{selectedFile.name}</p>
                                        <p className="text-xs text-muted-foreground">({(selectedFile.size / 1024).toFixed(2)} KB)</p>
                                    </>
                                ) : (
                                    <>
                                        <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold">Klik untuk mengunggah</span> atau seret file ke sini</p>
                                        <p className="text-xs text-muted-foreground">CSV, XLSX (Maks. 5MB)</p>
                                    </>
                                )}
                            </div>
                            <input id="dropzone-file" type="file" className="hidden" onChange={handleFileChange} accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" />
                        </label> 
                    </div>
                )}
                
                {step === 2 && (
                    <div className="py-4">
                        <p className="text-sm font-medium mb-2">File: <span className="font-normal text-muted-foreground">{selectedFile?.name}</span></p>
                        <div className="rounded-md border h-96 overflow-y-auto">
                            <Table>
                                <TableHeader className="sticky top-0 bg-muted">
                                    <TableRow>
                                        <TableHead>Kolom dari File Anda</TableHead>
                                        <TableHead>Petakan ke Field HRP</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {csvHeaders.map(header => (
                                        <TableRow key={header}>
                                            <TableCell className="font-medium">{header}</TableCell>
                                            <TableCell>
                                                <Select>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Pilih field..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {HRP_FIELDS.map(field => (
                                                            <SelectItem key={field.value} value={field.value}>{field.label}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                )}

                <DialogFooter>
                    {step === 1 && (
                        <>
                           <Button variant="ghost" onClick={() => handleClose(false)}>Batal</Button>
                           <Button onClick={handleNextStep} disabled={!selectedFile}>Lanjut ke Pemetaan Kolom</Button>
                        </>
                    )}
                    {step === 2 && (
                        <>
                           <Button variant="ghost" onClick={() => setStep(1)}>Kembali</Button>
                           <Button disabled>Lanjut ke Preview</Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
