"use client";

import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FileUp, Eye, Trash2 } from "lucide-react";
import { useFirestore } from "@/firebase";
import { useAuth } from "@/providers/auth-provider";
import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp 
} from "firebase/firestore";
import { 
  getStorage, 
  ref, 
  uploadBytesResumable, 
  getDownloadURL 
} from "firebase/storage";
import type { OfferingTemplate, Brand } from "@/lib/types";

const formSchema = z.object({
  templateName: z.string().min(1, "Nama template harus diisi"),
  brandName: z.string().min(1, "Brand harus dipilih"),
  employmentType: z.enum(["fulltime", "internship", "contract"]),
  htmlContent: z.string().min(1, "Konten template HTML harus diisi"),
  isActive: z.boolean().default(true),
  referencePdfUrl: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface OfferingTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: OfferingTemplate | null;
  brands: Brand[];
  onSuccess: () => void;
}

export function OfferingTemplateDialog({
  open,
  onOpenChange,
  template,
  brands,
  onSuccess,
}: OfferingTemplateDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const firestore = useFirestore();
  const { userProfile } = useAuth();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      templateName: "",
      brandName: "",
      employmentType: "fulltime",
      htmlContent: "",
      isActive: true,
      referencePdfUrl: "",
    },
  });

  useEffect(() => {
    if (template) {
      form.reset({
        templateName: template.templateName,
        brandName: template.brandName,
        employmentType: template.employmentType,
        htmlContent: template.htmlContent,
        isActive: template.isActive,
        referencePdfUrl: template.referencePdfUrl || "",
      });
    } else {
      form.reset({
        templateName: "",
        brandName: "",
        employmentType: "fulltime",
        htmlContent: `
<div style="font-family: Arial, sans-serif; padding: 40px; color: #333; line-height: 1.6;">
  <div style="text-align: right; margin-bottom: 40px;">
    <p>NOMOR: {{letterNumber}}</p>
    <p>{{startDate}}</p>
  </div>
  
  <div style="margin-bottom: 30px;">
    <p>Kepada Yth,<br><strong>{{candidateName}}</strong></p>
  </div>
  
  <h2 style="text-align: center; text-decoration: underline; margin-bottom: 30px;">SURAT PENAWARAN KERJA (OFFERING LETTER)</h2>
  
  <p>Halo {{candidateName}},</p>
  
  <p>Selamat! Kami dari <strong>{{brandName}}</strong> sangat terkesan dengan kualifikasi Anda. Melalui surat ini, kami bermaksud menawarkan posisi <strong>{{jobTitle}}</strong> kepada Anda.</p>
  
  <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
    <tr>
      <td style="width: 30%; padding: 8px 0;">Gaji Bulanan</td>
      <td style="padding: 8px 0;">: Rp {{salary}}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0;">Tanggal Mulai</td>
      <td style="padding: 8px 0;">: {{startDate}}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0;">Batas Respons</td>
      <td style="padding: 8px 0;">: {{responseDeadline}}</td>
    </tr>
  </table>
  
  <p>Penawaran ini tunduk pada syarat dan ketentuan yang berlaku di {{brandName}}.</p>
  
  <div style="margin-top: 60px;">
    <p>Hormat kami,</p>
    <div style="height: 80px;"></div>
    <p><strong>{{signerName}}</strong><br>{{signerTitle}}</p>
  </div>
</div>`,
        isActive: true,
        referencePdfUrl: "",
      });
    }
  }, [template, form]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const storage = getStorage();
    const storageRef = ref(storage, `offering_templates/${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      "state_changed",
      null,
      (error) => {
        toast({
          variant: "destructive",
          title: "Upload Gagal",
          description: error.message,
        });
        setIsUploading(false);
      },
      async () => {
        const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
        form.setValue("referencePdfUrl", downloadUrl);
        setIsUploading(false);
        toast({
          title: "Upload Berhasil",
          description: "Template referensi telah diunggah.",
        });
      }
    );
  };

  const onSubmit = async (values: FormValues) => {
    if (!userProfile) return;
    setIsSaving(true);
    try {
      if (template?.id) {
        const docRef = doc(firestore, "recruitment_offering_templates", template.id);
        await updateDoc(docRef, {
          ...values,
          updatedAt: serverTimestamp(),
        });
        toast({ title: "Template Diperbarui", description: "Template telah berhasil disimpan." });
      } else {
        await addDoc(collection(firestore, "recruitment_offering_templates"), {
          ...values,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: userProfile.uid,
        });
        toast({ title: "Template Dibuat", description: "Template baru telah berhasil ditambahkan." });
      }
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan",
        description: error.message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? "Edit Master Template Offering" : "Tambah Master Template Offering"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="templateName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nama Template</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Contoh: Offering Letter Fulltime HoD" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="brandName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Perusahaan / Brand</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih Brand" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {brands.map((brand) => (
                          <SelectItem key={brand.id} value={brand.name}>
                            {brand.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="employmentType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipe Pekerjaan</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih Tipe" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="fulltime">Full-time</SelectItem>
                        <SelectItem value="internship">Internship</SelectItem>
                        <SelectItem value="contract">Contract</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel>Status Aktif</FormLabel>
                      <FormDescription>Template ini dapat digunakan oleh HRD</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4">
              <FormLabel>Template Referensi (PDF/Gambar)</FormLabel>
              <div className="flex items-center gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
                  Unggah Master Referensi
                </Button>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".pdf,image/*"
                  onChange={handleFileUpload}
                />
                {form.watch("referencePdfUrl") && (
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" asChild>
                      <a href={form.watch("referencePdfUrl")} target="_blank" rel="noopener noreferrer">
                        <Eye className="h-4 w-4 mr-2" /> Lihat
                      </a>
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => form.setValue("referencePdfUrl", "")}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Unggah PDF/Gambar dari surat asli sebagai referensi visual.</p>
            </div>

            <FormField
              control={form.control}
              name="htmlContent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Template HTML (Layout Fixed)</FormLabel>
                  <FormDescription>Gunakan HTML dan CSS inline untuk layout yang konsisten. Placeholder: &#123;&#123;candidateName&#125;&#125;, &#123;&#123;jobTitle&#125;&#125;, &#123;&#123;salary&#125;&#125;, dll.</FormDescription>
                  <FormControl>
                    <Textarea {...field} className="font-mono h-64 text-xs" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
              <Button type="submit" disabled={isSaving || isUploading}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Simpan Master Template
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
