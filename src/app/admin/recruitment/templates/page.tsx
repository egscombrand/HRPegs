"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, orderBy, deleteDoc, doc } from "firebase/firestore";
import type { OfferingTemplate, Brand } from "@/lib/types";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Plus,
  Edit,
  Trash2,
  FileText,
  CheckCircle2,
  XCircle,
  Eye,
} from "lucide-react";
import { MENU_CONFIG } from "@/lib/menu-config";
import { Badge } from "@/components/ui/badge";
import { OfferingTemplateDialog } from "@/components/recruitment/OfferingTemplateDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

export default function OfferingTemplatesPage() {
  const hasAccess = useRoleGuard(["hrd", "super-admin"]);
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] =
    useState<OfferingTemplate | null>(null);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | "view">(
    "create",
  );
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);

  const menuConfig = useMemo(() => {
    if (!userProfile) return [];
    if (userProfile.role === "super-admin") return MENU_CONFIG["super-admin"];
    if (userProfile.role === "hrd") return MENU_CONFIG["hrd"];
    return [];
  }, [userProfile]);

  const templatesQuery = useMemoFirebase(
    () =>
      query(
        collection(firestore, "recruitment_offering_templates"),
        orderBy("updatedAt", "desc"),
      ),
    [firestore],
  );
  const {
    data: templates,
    isLoading,
    error,
  } = useCollection<OfferingTemplate>(templatesQuery);

  const brandsQuery = useMemoFirebase(
    () => collection(firestore, "brands"),
    [firestore],
  );
  const { data: brands } = useCollection<Brand>(brandsQuery);

  const handleEdit = (template: OfferingTemplate) => {
    setSelectedTemplate(template);
    setDialogMode("edit");
    setIsDialogOpen(true);
  };

  const handleView = (template: OfferingTemplate) => {
    setSelectedTemplate(template);
    setDialogMode("view");
    setIsDialogOpen(true);
  };

  const handleAdd = () => {
    setSelectedTemplate(null);
    setDialogMode("create");
    setIsDialogOpen(true);
  };

  const confirmDelete = (id: string) => {
    setTemplateToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!templateToDelete) return;
    try {
      await deleteDoc(
        doc(firestore, "recruitment_offering_templates", templateToDelete),
      );
      toast({
        title: "Template Dihapus",
        description: "Template telah berhasil dihapus dari sistem.",
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Gagal Menghapus",
        description: err.message,
      });
    } finally {
      setIsDeleteDialogOpen(false);
      setTemplateToDelete(null);
    }
  };

  if (!hasAccess) return null;

  return (
    <DashboardLayout
      pageTitle="Master Template Offering"
      menuConfig={menuConfig}
    >
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Master Template Offering
          </h2>
          <p className="text-muted-foreground">
            Kelola template resmi perusahaan untuk generate PDF penawaran kerja.
          </p>
        </div>
        <Button onClick={handleAdd} className="gap-2">
          <Plus className="h-4 w-4" /> Tambah Template
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTitle>Error Loading Templates</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama Template</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Tipe Pekerjaan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates && templates.length > 0 ? (
                templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {template.templateName}
                      </div>
                    </TableCell>
                    <TableCell>{template.brandName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {template.employmentType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {template.isActive ? (
                        <Badge
                          variant="default"
                          className="gap-1 bg-emerald-500 hover:bg-emerald-600"
                        >
                          <CheckCircle2 className="h-3 w-3" /> Aktif
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <XCircle className="h-3 w-3" /> Non-Aktif
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleView(template)}
                          title="Lihat Detail"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(template)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => confirmDelete(template.id!)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-32 text-center text-muted-foreground"
                  >
                    Belum ada template. Silakan tambah template baru.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <OfferingTemplateDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        template={selectedTemplate}
        brands={brands || []}
        mode={dialogMode}
        onSuccess={() => {}}
      />

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Template?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak dapat dibatalkan. Template yang dihapus tidak
              akan tersedia lagi untuk pembuatan offering baru.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
            >
              Ya, Hapus Template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
