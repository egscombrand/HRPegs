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
  serverTimestamp,
} from "firebase/firestore";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from "firebase/storage";
import type { OfferingTemplate, Brand } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const DEFAULT_PLACEHOLDERS = [
  "candidateName",
  "jobTitle",
  "brandName",
  "startDate",
  "contractEndDate",
  "salary",
  "signerName",
  "signerTitle",
  "letterNumber",
  "responseDeadline",
];

const formSchema = z.object({
  templateName: z.string().min(1, "Nama template harus diisi"),
  brandId: z.string().min(1, "Brand harus dipilih"),
  brandName: z.string().min(1, "Nama brand harus ada"),
  employmentType: z.enum(["fulltime", "internship", "contract"]),
  htmlTemplate: z.string().min(1, "Template HTML harus diisi"),
  cssTemplate: z.string().optional(),
  placeholders: z.array(z.string()).default(DEFAULT_PLACEHOLDERS),
  isActive: z.boolean().default(true),
  referenceFileUrl: z.string().optional(),
  referenceFileName: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface OfferingTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: OfferingTemplate | null;
  brands: Brand[];
  mode?: "create" | "edit" | "view";
  onSuccess: () => void;
}

export function OfferingTemplateDialog({
  open,
  onOpenChange,
  template,
  brands,
  mode = "create",
  onSuccess,
}: OfferingTemplateDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const isReadOnly = mode === "view";
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const firestore = useFirestore();
  const { userProfile } = useAuth();
  const isSuperAdmin = userProfile?.role === "super-admin";

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      templateName: "",
      brandId: "",
      brandName: "",
      employmentType: "fulltime",
      htmlTemplate: "",
      cssTemplate: "",
      placeholders: DEFAULT_PLACEHOLDERS,
      isActive: true,
      referenceFileUrl: "",
      referenceFileName: "",
    },
  });

  useEffect(() => {
    if (template) {
      form.reset({
        templateName: template.templateName,
        brandId: template.brandId || "",
        brandName: template.brandName,
        employmentType: template.employmentType,
        htmlTemplate: template.htmlTemplate || template.htmlContent || "",
        cssTemplate: template.cssTemplate || "",
        placeholders: template.placeholders || DEFAULT_PLACEHOLDERS,
        isActive: template.isActive,
        referenceFileUrl:
          template.referenceFileUrl || template.referencePdfUrl || "",
        referenceFileName: template.referenceFileName || "",
      });
    } else {
      form.reset({
        templateName: "",
        brandId: "",
        brandName: "",
        employmentType: "fulltime",
        htmlTemplate: `
<div class="offering-container">
  <div class="letter-meta">
    <p>NOMOR: {{letterNumber}}</p>
    <p>{{startDate}}</p>
  </div>
  
  <div class="address-block">
    <p>Kepada Yth,<br><strong>{{candidateName}}</strong></p>
  </div>
  
  <h2 class="letter-title">SURAT PENAWARAN KERJA (OFFERING LETTER)</h2>
  
  <p>Halo {{candidateName}},</p>
  
  <p>Selamat! Kami dari <strong>{{brandName}}</strong> sangat terkesan dengan kualifikasi Anda. Melalui surat ini, kami bermaksud menawarkan posisi <strong>{{jobTitle}}</strong> kepada Anda.</p>
  
  <table class="detail-table">
    <tr>
      <td class="label-td">Gaji Bulanan</td>
      <td>: Rp {{salary}}</td>
    </tr>
    <tr>
      <td class="label-td">Tanggal Mulai</td>
      <td>: {{startDate}}</td>
    </tr>
    <tr>
      <td class="label-td">Batas Respons</td>
      <td>: {{responseDeadline}}</td>
    </tr>
  </table>
  
  <p>Penawaran ini tunduk pada syarat dan ketentuan yang berlaku di {{brandName}}.</p>
  
  <div class="signature-block">
    <p>Hormat kami,</p>
    <div class="sig-space"></div>
    <p><strong>{{signerName}}</strong><br>{{signerTitle}}</p>
  </div>
</div>`,
        cssTemplate: `
.offering-container { font-family: 'Arial', sans-serif; padding: 40px; color: #333; line-height: 1.6; }
.letter-meta { text-align: right; margin-bottom: 40px; }
.address-block { margin-bottom: 30px; }
.letter-title { text-align: center; text-decoration: underline; margin-bottom: 30px; }
.detail-table { width: 100%; margin: 20px 0; border-collapse: collapse; }
.label-td { width: 30%; padding: 8px 0; font-weight: bold; }
.signature-block { margin-top: 60px; }
.sig-space { height: 80px; }
`,
        placeholders: DEFAULT_PLACEHOLDERS,
        isActive: true,
        referenceFileUrl: "",
        referenceFileName: "",
      });
    }
  }, [template, form]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const storage = getStorage();
    const filePath = `offering_templates/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, filePath);
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
        form.setValue("referenceFileUrl", downloadUrl);
        form.setValue("referenceFileName", file.name);
        setIsUploading(false);
        toast({
          title: "Upload Berhasil",
          description: "Template referensi telah diunggah.",
        });
      },
    );
  };

  const onSubmit = async (values: FormValues) => {
    if (!userProfile) return;
    setIsSaving(true);
    try {
      const data = {
        ...values,
        updatedAt: serverTimestamp(),
      };

      if (template?.id) {
        const docRef = doc(
          firestore,
          "recruitment_offering_templates",
          template.id,
        );
        await updateDoc(docRef, data);
        toast({
          title: "Template Diperbarui",
          description: "Template telah berhasil disimpan.",
        });
      } else {
        await addDoc(collection(firestore, "recruitment_offering_templates"), {
          ...data,
          createdAt: serverTimestamp(),
          createdBy: userProfile.uid,
        });
        toast({
          title: "Template Dibuat",
          description: "Template baru telah berhasil ditambahkan.",
        });
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
      <DialogContent className="max-w-[95vw] max-h-[95vh] w-full overflow-hidden flex flex-col p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>
            {mode === "view"
              ? "Detail Master Template Offering"
              : template
                ? "Edit Master Template Offering"
                : "Tambah Master Template Offering"}
          </DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-4">
          <p className="text-sm text-slate-500">
            Template ini digunakan sebagai acuan layout surat offering. Data
            kandidat seperti nama, jabatan, gaji, dan tanggal akan diisi pada
            tahap offering kandidat.
          </p>
        </div>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="overflow-y-auto px-6 pb-4 flex-1 space-y-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="templateName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nama Template</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          disabled={isReadOnly}
                          placeholder="Contoh: Offering Letter Intern 2024"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="brandId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Perusahaan / Brand</FormLabel>
                      <Select
                        disabled={isReadOnly}
                        onValueChange={(val) => {
                          field.onChange(val);
                          const brand = brands.find((b) => b.id === val);
                          if (brand) form.setValue("brandName", brand.name);
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih Brand" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {brands.map((brand) => (
                            <SelectItem key={brand.id} value={brand.id!}>
                              {brand.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="employmentType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipe Offering</FormLabel>
                      <Select
                        disabled={isReadOnly}
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih Tipe" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="fulltime">
                            Full-time (Karyawan Tetap/Kontrak)
                          </SelectItem>
                          <SelectItem value="internship">
                            Internship (Magang)
                          </SelectItem>
                          <SelectItem value="contract">
                            Freelance / Special Project
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4">
                <div className="p-4 border rounded-xl bg-muted/30">
                  <FormLabel className="mb-2 block">
                    Master Referensi (PDF/DOCX)
                  </FormLabel>
                  <FormDescription className="text-xs mb-3">
                    Upload file desain/scan resmi sebagai acuan visual HRD.
                  </FormDescription>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        !isReadOnly && fileInputRef.current?.click()
                      }
                      disabled={isUploading || isReadOnly}
                      className="bg-background"
                    >
                      {isUploading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <FileUp className="mr-2 h-4 w-4" />
                      )}
                      Upload File
                    </Button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept=".pdf,.docx,.doc,image/*"
                      onChange={handleFileUpload}
                    />
                    {form.watch("referenceFileUrl") && (
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="text-xs truncate max-w-[120px]">
                          {form.watch("referenceFileName")}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          asChild
                        >
                          <a
                            href={form.watch("referenceFileUrl")}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Eye className="h-3 w-3" />
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => {
                            form.setValue("referenceFileUrl", "");
                            form.setValue("referenceFileName", "");
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-xl border p-4 shadow-sm">
                      <div className="space-y-0.5">
                        <FormLabel>Status Aktif</FormLabel>
                        <FormDescription className="text-xs">
                          Aktifkan untuk digunakan di pemilihan template.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={isReadOnly}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <section className="rounded-3xl border border-slate-700 bg-slate-950 shadow-lg p-6">
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-white">
                  Preview Surat Referensi
                </h2>
                <p className="text-sm text-slate-400">
                  Ini adalah contoh layout surat offering yang digunakan sebagai
                  acuan.
                </p>
              </div>
              <div className="min-h-[75vh] rounded-3xl border border-slate-800 bg-slate-100/95">
                {form.watch("referenceFileUrl") ? (
                  <iframe
                    src={form.watch("referenceFileUrl")}
                    title="Preview Surat Referensi"
                    className="h-full w-full"
                    style={{ minHeight: "75vh" }}
                  />
                ) : (
                  <div className="flex h-full min-h-[75vh] items-center justify-center p-6 text-center text-sm text-slate-500">
                    Upload PDF/DOCX referensi untuk melihat layout di sini.
                  </div>
                )}
              </div>
              <p className="mt-4 text-sm text-slate-500">
                Template ini digunakan sebagai acuan layout surat offering. Data
                kandidat seperti nama, jabatan, gaji, dan tanggal akan diisi
                pada tahap offering kandidat.
              </p>
            </section>

            {isSuperAdmin && (
              <Accordion type="single" collapsible className="space-y-3">
                <AccordionItem
                  value="advanced-settings"
                  className="overflow-hidden rounded-2xl border"
                >
                  <AccordionTrigger className="bg-slate-100 px-5 py-4 text-left text-base font-semibold">
                    Pengaturan Lanjutan: HTML Template & CSS Print
                  </AccordionTrigger>
                  <AccordionContent className="border-t border-slate-200 px-5 py-5">
                    <p className="text-sm text-slate-500 mb-4">
                      Bagian ini adalah pengaturan teknis template surat dan
                      hanya digunakan untuk struktur serta styling PDF.
                    </p>
                    <Tabs defaultValue="html" className="w-full">
                      <TabsList className="mb-3">
                        <TabsTrigger value="html">HTML Template</TabsTrigger>
                        <TabsTrigger value="css">CSS (Print Style)</TabsTrigger>
                      </TabsList>
                      <TabsContent value="html" className="mt-0">
                        <FormField
                          control={form.control}
                          name="htmlTemplate"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Textarea
                                  {...field}
                                  disabled={isReadOnly}
                                  className="font-mono h-[240px] text-xs resize-none bg-slate-950 text-slate-200"
                                  placeholder="Template HTML akan ditampilkan di sini untuk pengaturan lanjutan"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </TabsContent>
                      <TabsContent value="css" className="mt-0">
                        <FormField
                          control={form.control}
                          name="cssTemplate"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Textarea
                                  {...field}
                                  disabled={isReadOnly}
                                  className="font-mono h-[240px] text-xs resize-none bg-slate-950 text-slate-200"
                                  placeholder="CSS untuk tampilan cetak akan ditampilkan di sini"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </TabsContent>
                    </Tabs>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            <DialogFooter className="p-6 pt-2 border-t mt-auto">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                {isReadOnly ? "Tutup" : "Batal"}
              </Button>
              {!isReadOnly && (
                <Button
                  type="submit"
                  disabled={isSaving || isUploading}
                  className="min-w-[150px]"
                >
                  {isSaving && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {template ? "Simpan Perubahan" : "Simpan Master Template"}
                </Button>
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
