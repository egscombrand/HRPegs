'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, ListChecks, MessageSquareWarning, Award, Activity } from "lucide-react";

export default function RekapLaporanPage() {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">Rekap Laporan</h1>
                    <p className="text-muted-foreground">Analisis dan ringkasan dari semua laporan harian yang telah Anda buat.</p>
                </div>
                <Select defaultValue="july-2024">
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Pilih Periode" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="july-2024">Juli 2024</SelectItem>
                        <SelectItem value="june-2024">Juni 2024</SelectItem>
                        <SelectItem value="may-2024">Mei 2024</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total Laporan</CardTitle><ListChecks className="h-4 w-4 text-muted-foreground"/></CardHeader><CardContent><div className="text-2xl font-bold">21</div></CardContent></Card>
                <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Disetujui</CardTitle><Award className="h-4 w-4 text-muted-foreground"/></CardHeader><CardContent><div className="text-2xl font-bold">15</div></CardContent></Card>
                <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Perlu Revisi</CardTitle><MessageSquareWarning className="h-4 w-4 text-muted-foreground"/></CardHeader><CardContent><div className="text-2xl font-bold">3</div></CardContent></Card>
                <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Menunggu Review</CardTitle><Activity className="h-4 w-4 text-muted-foreground"/></CardHeader><CardContent><div className="text-2xl font-bold">3</div></CardContent></Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                 <Card>
                    <CardHeader><CardTitle>Ringkasan Pembelajaran Utama</CardTitle></CardHeader>
                    <CardContent>
                        <ul className="list-disc pl-5 space-y-2 text-sm">
                            <li>Memahami alur kerja tim desain dari riset hingga implementasi.</li>
                            <li>Menguasai penggunaan komponen dan varian di Figma untuk efisiensi.</li>
                            <li>Belajar teknik analisis kompetitor untuk menemukan Unique Selling Points (USP).</li>
                            <li>Meningkatkan kemampuan komunikasi dan presentasi ide desain kepada tim.</li>
                        </ul>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader><CardTitle>Ringkasan Kendala Utama</CardTitle></CardHeader>
                    <CardContent>
                        <ul className="list-disc pl-5 space-y-2 text-sm">
                            <li>Kesulitan dalam mendapatkan akses ke data riset pengguna yang relevan.</li>
                            <li>Keterbatasan performa perangkat saat mengerjakan file desain yang kompleks.</li>
                             <li>Membutuhkan waktu adaptasi lebih untuk memahami istilah teknis dalam rapat.</li>
                        </ul>
                    </CardContent>
                </Card>
            </div>
             <Card>
                <CardHeader><CardTitle>Progres dan Pencapaian Umum</CardTitle></CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">Secara umum, progres selama periode ini sangat baik. Berhasil menyelesaikan 3 dari 4 target utama, termasuk finalisasi desain untuk fitur X. Mampu berkolaborasi dengan baik bersama tim developer dalam fase slicing. Masih perlu meningkatkan kecepatan dalam membuat prototipe interaktif.</p>
                </CardContent>
            </Card>
        </div>
    );
}
