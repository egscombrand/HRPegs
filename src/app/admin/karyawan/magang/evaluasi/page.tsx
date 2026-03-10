'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import { Star, ThumbsUp, Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function EvaluasiPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Evaluasi & Feedback</h1>
                <p className="text-muted-foreground">Kumpulan feedback dan evaluasi dari mentor dan HRD selama periode magang.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Evaluasi Akhir Periode</CardTitle>
                    <CardDescription>Ringkasan performa dan pencapaian Anda selama program magang.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                        <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Nilai Akhir</p>
                            <p className="text-3xl font-bold">A</p>
                        </div>
                        <div className="space-y-1 text-right">
                            <p className="text-sm text-muted-foreground">Rekomendasi</p>
                            <Badge className="bg-green-600">Direkomendasikan untuk Lanjut</Badge>
                        </div>
                    </div>
                    
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <h4 className="font-semibold flex items-center gap-2"><ThumbsUp className="h-5 w-5 text-green-500"/> Kelebihan & Pencapaian</h4>
                            <ul className="list-disc pl-5 text-sm space-y-1 text-muted-foreground">
                                <li>Inisiatif tinggi dan proaktif dalam mencari solusi.</li>
                                <li>Kemampuan belajar cepat, terutama dalam adaptasi dengan tools baru.</li>
                                <li>Kontribusi signifikan pada proyek X, melebihi ekspektasi awal.</li>
                                <li>Keterampilan komunikasi yang baik dalam tim.</li>
                            </ul>
                        </div>
                         <div className="space-y-2">
                            <h4 className="font-semibold flex items-center gap-2"><Lightbulb className="h-5 w-5 text-yellow-500"/> Area untuk Perbaikan</h4>
                            <ul className="list-disc pl-5 text-sm space-y-1 text-muted-foreground">
                                <li>Manajemen waktu saat menghadapi beberapa tugas sekaligus.</li>
                                <li>Perlu lebih percaya diri saat mempresentasikan ide di depan forum besar.</li>
                                <li>Meningkatkan pemahaman teknis mendalam terkait arsitektur sistem.</li>
                            </ul>
                        </div>
                    </div>

                    <Separator />

                     <div className="space-y-3">
                        <h4 className="font-semibold">Catatan dari Mentor (Budi Santoso)</h4>
                        <div className="flex items-start gap-3 text-sm">
                            <Avatar className="h-9 w-9 border"><AvatarFallback>BS</AvatarFallback></Avatar>
                            <div className="flex-1 rounded-md bg-background border p-3">
                                <p className="italic text-muted-foreground">"Sangat puas dengan performa [Nama Intern] selama magang. Keinginannya untuk belajar dan kontribusinya sangat terasa. Terus pertahankan semangat dan proaktif dalam mencari tantangan baru. Potensi besar untuk berkembang lebih jauh di industri ini."</p>
                            </div>
                        </div>
                    </div>
                     <div className="space-y-3">
                        <h4 className="font-semibold">Catatan dari HRD (Dina Anggraini)</h4>
                        <div className="flex items-start gap-3 text-sm">
                            <Avatar className="h-9 w-9 border"><AvatarFallback>DA</AvatarFallback></Avatar>
                            <div className="flex-1 rounded-md bg-background border p-3">
                                <p className="italic text-muted-foreground">"Secara kultur, [Nama Intern] sangat cocok dengan nilai-nilai perusahaan. Proses adaptasi berjalan lancar dan mampu berkolaborasi dengan baik. Kami akan mempertimbangkan untuk proses selanjutnya."</p>
                            </div>
                        </div>
                    </div>

                </CardContent>
            </Card>
        </div>
    )
}
