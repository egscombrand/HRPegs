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
    <div className="text-sm flex justify-between items-start gap-2">
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
        {hasDocuments ? (
          <div className="grid grid-cols-1 gap-2">
            {profile.cvUrl && (
              <Button asChild variant="outline" className="justify-start">
                <a href={profile.cvUrl} target="_blank" rel="noopener noreferrer">
                  <FileText className="mr-2 h-4 w-4" />
                  Lihat CV
                </a>
              </Button>
            )}
            {profile.ijazahUrl && (
              <Button asChild variant="outline" className="justify-start">
                <a href={profile.ijazahUrl} target="_blank" rel="noopener noreferrer">
                  <FileText className="mr-2 h-4 w-4" />
                  Lihat Ijazah/SKL
                </a>
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-2">
            CV atau Ijazah belum diunggah.
          </p>
        )}

        {hasCerts && (
            <>
                <Separator />
                <div>
                    <h4 className="font-semibold text-sm mb-3">Sertifikasi</h4>
                    <div className="space-y-3">
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
