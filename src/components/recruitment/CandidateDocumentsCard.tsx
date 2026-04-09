'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { Profile, Certification, JobApplication } from "@/lib/types";
import { Button } from "../ui/button";
import { FileText, Eye, Check, X, ShieldQuestion, ShieldCheck } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { updateDocumentNonBlocking } from "@/firebase";
import { doc, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "../ui/separator";

interface CandidateDocumentsCardProps {
  application: JobApplication;
  profile: Profile;
  onVerificationChange: () => void;
}

const VerificationToggle = ({ isVerified, onToggle }: { isVerified?: boolean, onToggle: (verified: boolean) => void }) => (
    <Button variant={isVerified ? 'default' : 'outline'} size="sm" onClick={() => onToggle(!isVerified)} className={isVerified ? "bg-green-600 hover:bg-green-700" : ""}>
        {isVerified ? <Check className="mr-2 h-4 w-4" /> : <ShieldQuestion className="mr-2 h-4 w-4" />}
        {isVerified ? 'Verified' : 'Verify'}
    </Button>
);

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


export function CandidateDocumentsCard({ application, profile, onVerificationChange }: CandidateDocumentsCardProps) {
    const { userProfile } = useAuth();
    const firestore = useFirestore();
    const { toast } = useToast();

    const handleVerificationToggle = async (docType: 'cv' | 'ijazah') => {
        if (!userProfile) return;

        const field = docType === 'cv' ? 'cvVerified' : 'ijazahVerified';
        const currentValue = application[field];

        try {
            await updateDocumentNonBlocking(doc(firestore, 'applications', application.id!), {
                [field]: !currentValue,
            });
            toast({ title: "Verifikasi Diperbarui" });
            onVerificationChange();
        } catch (e: any) {
            toast({ variant: 'destructive', title: "Gagal memperbarui verifikasi" });
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

                <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Verifikasi Dokumen</h4>
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                        <p className="text-sm font-medium">CV</p>
                        <VerificationToggle isVerified={application.cvVerified} onToggle={() => handleVerificationToggle('cv')} />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                        <p className="text-sm font-medium">Ijazah</p>
                         <VerificationToggle isVerified={application.ijazahVerified} onToggle={() => handleVerificationToggle('ijazah')} />
                    </div>
                </div>
                
                 {hasCerts && (
                    <>
                        <Separator />
                        <div>
                            <h4 className="font-semibold text-sm mb-2">Sertifikasi</h4>
                            <div className="space-y-2 rounded-md border p-2">
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
