"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import type { Profile, Certification, JobApplication } from "@/lib/types";
import { Button } from "../ui/button";
import {
  FileText,
  Eye,
  Check,
  X,
  ShieldQuestion,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { updateDocumentNonBlocking } from "@/firebase";
import { doc, serverTimestamp } from "firebase/firestore";
import { useFirestore } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "../ui/separator";
import { extractFileIdFromUrl, openSecureFile } from "@/lib/candidate-docs-utils";
import { useState } from "react";

interface CandidateDocumentsCardProps {
  application: JobApplication;
  profile: Profile;
  onVerificationChange: () => void;
}

const VerificationToggle = ({
  isVerified,
  onToggle,
}: {
  isVerified?: boolean;
  onToggle: (verified: boolean) => void;
}) => (
  <Button
    variant={isVerified ? "default" : "outline"}
    size="sm"
    onClick={() => onToggle(!isVerified)}
    className={isVerified ? "bg-green-600 hover:bg-green-700" : ""}
  >
    {isVerified ? (
      <Check className="mr-2 h-4 w-4" />
    ) : (
      <ShieldQuestion className="mr-2 h-4 w-4" />
    )}
    {isVerified ? "Verified" : "Verify"}
  </Button>
);

const CertificationView = ({ item }: { item: Certification }) => {
  const { toast } = useToast();
  return (
    <div className="text-sm flex justify-between items-start gap-2 py-2 border-b last:border-b-0 border-slate-200 dark:border-border">
      <div>
        <p className="font-semibold text-slate-900 dark:text-foreground">{item.name}</p>
        <p className="text-slate-600 dark:text-muted-foreground text-xs">
          Penerbit: {item.organization}
        </p>
        <p className="text-slate-600 dark:text-muted-foreground text-xs">
          Tanggal: {item.issueDate}{" "}
          {item.expirationDate ? ` - ${item.expirationDate}` : ""}
        </p>
      </div>
      {item.imageUrl && (
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          onClick={async () => {
            const fileId = extractFileIdFromUrl(item.imageUrl);
            try {
              await openSecureFile(fileId, item.name + ".pdf");
            } catch (err: any) {
              toast({
                variant: "destructive",
                title: "Gagal Membuka Sertifikat",
                description: err.message,
              });
            }
          }}
          title="Lihat Sertifikat"
        >
          <Eye className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};

export function CandidateDocumentsCard({
  application,
  profile,
  onVerificationChange,
}: CandidateDocumentsCardProps) {
  const { userProfile } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [loadingDoc, setLoadingDoc] = useState<"cv" | "ijazah" | null>(null);

  const handleViewDocument = async (docType: "cv" | "ijazah") => {
    setLoadingDoc(docType);
    try {
      // Priority lookup for fileId: application -> profile -> application URL -> profile URL
      const fileId =
        docType === "cv"
          ? application.cvFileId || 
            profile.cvFileId || 
            extractFileIdFromUrl(application.cvUrl) || 
            extractFileIdFromUrl(profile.cvUrl)
          : application.ijazahFileId || 
            profile.ijazahFileId || 
            extractFileIdFromUrl(application.ijazahUrl) || 
            extractFileIdFromUrl(profile.ijazahUrl);

      const fileName =
        docType === "cv" 
          ? application.cvFileName || profile.cvFileName || "CV.pdf"
          : application.ijazahFileName || profile.ijazahFileName || "Ijazah.pdf";

      if (!fileId) {
        toast({
          variant: "destructive",
          title: "Dokumen tidak tersedia",
          description: "Dokumen belum memiliki fileId. Silakan minta kandidat unggah ulang dokumen.",
        });
        return;
      }

      await openSecureFile(fileId, fileName);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal membuka dokumen",
        description: error?.message || "Tidak dapat membuka dokumen. Silakan coba lagi.",
      });
    } finally {
      setLoadingDoc(null);
    }
  };

  const handleVerificationToggle = async (docType: "cv" | "ijazah") => {
    if (!userProfile) return;

    const field = docType === "cv" ? "cvVerified" : "ijazahVerified";
    const currentValue = application[field];

    try {
      await updateDocumentNonBlocking(
        doc(firestore, "applications", application.id!),
        {
          [field]: !currentValue,
        },
      );
      toast({ title: "Verifikasi Diperbarui" });
      onVerificationChange();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Gagal memperbarui verifikasi" });
    }
  };

  const hasCerts = profile.certifications && profile.certifications.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dokumen & Sertifikasi</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {application.cvFileId || application.cvUrl || profile.cvFileId || profile.cvUrl ? (
            <button
              onClick={() => handleViewDocument("cv")}
              disabled={loadingDoc === "cv"}
              className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors dark:border-border dark:bg-muted dark:hover:bg-muted/80 w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-primary" />
                <span className="font-medium text-sm text-foreground">
                  Curriculum Vitae (CV)
                </span>
              </div>
              {loadingDoc === "cv" ? (
                <Loader2 className="h-4 w-4 text-slate-600 dark:text-muted-foreground animate-spin" />
              ) : (
                <Eye className="h-4 w-4 text-slate-600 dark:text-muted-foreground" />
              )}
            </button>
          ) : (
            <div className="flex items-center p-3 rounded-lg border border-dashed border-slate-300 text-slate-700 dark:border-border dark:text-muted-foreground text-sm bg-slate-50 dark:bg-muted/20">
              CV belum diunggah.
            </div>
          )}
          {application.ijazahFileId || application.ijazahUrl || profile.ijazahFileId || profile.ijazahUrl ? (
            <button
              onClick={() => handleViewDocument("ijazah")}
              disabled={loadingDoc === "ijazah"}
              className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors dark:border-border dark:bg-muted dark:hover:bg-muted/80 w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-primary" />
                <span className="font-medium text-sm text-foreground">
                  Ijazah / SKL
                </span>
              </div>
              {loadingDoc === "ijazah" ? (
                <Loader2 className="h-4 w-4 text-slate-600 dark:text-muted-foreground animate-spin" />
              ) : (
                <Eye className="h-4 w-4 text-slate-600 dark:text-muted-foreground" />
              )}
            </button>
          ) : (
            <div className="flex items-center p-3 rounded-lg border border-dashed border-slate-300 text-slate-700 dark:border-border dark:text-muted-foreground text-sm bg-slate-50 dark:bg-muted/20">
              Ijazah/SKL belum diunggah.
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h4 className="font-semibold text-sm">Verifikasi Dokumen</h4>
          <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white dark:border-border dark:bg-muted/30">
            <p className="text-sm font-medium text-foreground">CV</p>
            <VerificationToggle
              isVerified={application.cvVerified}
              onToggle={() => handleVerificationToggle("cv")}
            />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white dark:border-border dark:bg-muted/30">
            <p className="text-sm font-medium text-foreground">Ijazah</p>
            <VerificationToggle
              isVerified={application.ijazahVerified}
              onToggle={() => handleVerificationToggle("ijazah")}
            />
          </div>
        </div>

        {hasCerts && (
          <>
            <Separator />
            <div>
              <h4 className="font-semibold text-sm mb-2">Sertifikasi</h4>
              <div className="space-y-2 rounded-md border border-slate-200 bg-white p-2 dark:border-border dark:bg-muted/20">
                {profile.certifications!.map((cert, index) => (
                  <CertificationView key={cert.id || index} item={cert} />
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
