'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { Profile, Certification } from "@/lib/types";
import { Button } from "../ui/button";
import { FileText, Eye } from "lucide-react";
import { Separator } from "../ui/separator";

interface CandidateDocumentsCardProps {
  profile: Profile;
}

const CertificationView = ({ item }: { item: Certification }) => (
    <div className="text-sm flex justify-between items-start gap-2 py-2 border-b last:border-b-0">
        <div>
            <p className="font-semibold">{item.name}</p>
            <p className="text-muted-foreground text-xs">Penerbit: {item.organization}</p>
            <p className="text-muted-foreground text-xs">Tanggal: {item.issueDate} {item.expirationDate ? ` - ${item.expirationDate}` : ''}</p>
        </div>
        {item.imageUrl && (
            <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0" asChild>
                <a href={item.imageUrl} target="_blank" rel="noopener noreferrer" title="Lihat Sertifikat">
                    <Eye className="h-4 w-4" />
                </a>
            </Button>
        )}
    </div>
);

export function CandidateDocumentsCard({ profile }: CandidateDocumentsCardProps) {
  const hasDocuments = profile.cvUrl || profile.ijazahUrl;
  const hasCerts = profile.certifications && profile.certifications.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dokumen Kandidat</CardTitle>
        <CardDescription>Dokumen yang diunggah oleh kandidat saat melengkapi profil.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
            {profile.cvUrl ? (
                <a href={profile.cvUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted transition-colors">
                    <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-primary" />
                        <span className="font-medium text-sm">Curriculum Vitae (CV)</span>
                    </div>
                    <Eye className="h-4 w-4 text-muted-foreground" />
                </a>
            ) : (
                <div className="flex items-center p-3 rounded-lg border border-dashed text-muted-foreground text-sm">
                    CV belum diunggah.
                </div>
            )}
            {profile.ijazahUrl ? (
                 <a href={profile.ijazahUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted transition-colors">
                    <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-primary" />
                        <span className="font-medium text-sm">Ijazah / SKL</span>
                    </div>
                    <Eye className="h-4 w-4 text-muted-foreground" />
                </a>
            ) : (
                 <div className="flex items-center p-3 rounded-lg border border-dashed text-muted-foreground text-sm">
                    Ijazah/SKL belum diunggah.
                </div>
            )}
        </div>
        
        <Separator />

        <div>
            <h4 className="font-semibold text-sm mb-2">Sertifikasi</h4>
            {hasCerts ? (
                <div className="space-y-2 rounded-md border p-2">
                    {profile.certifications!.map((cert, index) => (
                        <CertificationView key={cert.id || index} item={cert} />
                    ))}
                </div>
            ) : (
                 <p className="text-sm text-muted-foreground text-center py-4 border rounded-lg border-dashed">
                    Kandidat tidak melampirkan sertifikasi.
                </p>
            )}
        </div>

      </CardContent>
    </Card>
  );
}
