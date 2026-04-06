'use client';

import { useState } from 'react';
import type { Profile, Job, CandidateFitAnalysisOutput, RequirementMatch, ScoreBreakdown } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from '../ui/button';
import { Sparkles, Loader2, AlertCircle, CheckCircle, XCircle, FileQuestion, Lightbulb, FlaskConical, Target, BrainCircuit, FileClock } from 'lucide-react';
import { getCandidateAnalysis } from '@/app/actions/analyze-candidate';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { Separator } from '../ui/separator';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { ChartContainer, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import type { JobApplication } from '@/lib/types';

interface CandidateFitAnalysisProps {
  profile: Profile;
  job: Job;
  application: JobApplication;
}

const decisionConfig = {
    advance_interview: { label: 'Lanjutkan ke Wawancara', icon: CheckCircle, className: 'text-green-600' },
    advance_test: { label: 'Lanjutkan ke Tes', icon: BrainCircuit, className: 'text-blue-600' },
    hold: { label: 'Tahan (Hold)', icon: AlertCircle, className: 'text-yellow-600' },
    reject: { label: 'Tolak', icon: XCircle, className: 'text-red-600' },
};

const matchConfig = {
    yes: { label: 'Ya', icon: CheckCircle, className: 'text-green-600' },
    partial: { label: 'Sebagian', icon: AlertCircle, className: 'text-yellow-600' },
    no: { label: 'Tidak', icon: XCircle, className: 'text-red-600' },
};

const scoreLabels: Record<keyof ScoreBreakdown | 'cultureFitScore', string> = {
    relevantExperience: 'Pengalaman',
    adminDocumentation: 'Administrasi',
    communicationTeamwork: 'Komunikasi',
    analyticalProblemSolving: 'Analitis',
    toolsHardSkills: 'Keahlian Teknis',
    initiativeOwnership: 'Inisiatif',
    cultureFit: 'Kecocokan Budaya',
    cultureFitScore: 'Kecocokan Budaya',
};

const confidenceLabels: Record<string, string> = {
    high: 'Tinggi',
    medium: 'Sedang',
    low: 'Rendah'
};

const fitLabels: Record<string, string> = {
    strong_fit: 'Sangat Cocok',
    moderate_fit: 'Cukup Cocok',
    weak_fit: 'Kurang Cocok',
}

const AnalysisSection = ({ title, icon, children }: { title: string, icon: React.ReactNode, children: React.ReactNode }) => (
    <Card>
        <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
                {icon}
                {title}
            </CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
    </Card>
);

const chartConfig = {
  score: {
    label: "Score",
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig;

export function CandidateFitAnalysis({ profile, job, application }: CandidateFitAnalysisProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<CandidateFitAnalysisOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleAnalyze = async () => {
    if (!profile.cvUrl) {
      toast({
        variant: 'destructive',
        title: 'CV Tidak Ditemukan',
        description: 'Kandidat ini belum mengunggah CV. Analisis tidak dapat dilakukan.',
      });
      return;
    }
    setIsLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const result = await getCandidateAnalysis(application.id!);
      setAnalysis(result);
    } catch (e: any) {
      setError("Gagal melakukan analisis. Silakan coba lagi.");
      toast({
        variant: 'destructive',
        title: 'Analisis Gagal',
        description: e.message || 'Terjadi kesalahan saat berkomunikasi dengan AI.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const Decision = analysis ? decisionConfig[analysis.recommendedDecision] : null;

  const chartData = analysis ? Object.entries(analysis.scoreBreakdown)
    .map(([key, value]) => {
      if (key === 'cultureFit') {
        return { name: scoreLabels['cultureFitScore'], score: value.score };
      }
      return { name: scoreLabels[key as keyof typeof scoreLabels], score: value };
    }) : [];

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Analisis AI (HR Analyst)
            </CardTitle>
            <CardDescription>Analisis kesesuaian kandidat berdasarkan CV dengan kualifikasi khusus (didukung oleh AI).</CardDescription>
          </div>
           <Button onClick={handleAnalyze} disabled={isLoading || !profile.cvUrl}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {isLoading ? 'Menganalisis...' : 'Lakukan Analisis'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!isLoading && !analysis && !error && (
            <div className="text-center py-8 text-muted-foreground">
                Klik tombol untuk memulai analisis AI.
            </div>
        )}
        {isLoading && (
            <div className="space-y-4 rounded-lg border border-dashed p-8 text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
              <div className="mx-auto max-w-md">
                <p className="font-semibold">AI sedang menganalisis CV kandidat...</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Proses ini biasanya membutuhkan waktu <strong>15-30 detik</strong>.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Akurasi analisis sangat bergantung pada kualitas CV (hasil pindaian/gambar mungkin kurang akurat).
                </p>
              </div>
            </div>
        )}
        {error && (
            <div className="flex flex-col items-center justify-center text-center py-8 text-destructive">
                <AlertCircle className="h-8 w-8 mb-2" />
                <p className="font-semibold">{error}</p>
            </div>
        )}
        {analysis && Decision && (
            <div className="space-y-6">
                 {analysis.confidence.level === 'low' && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Akurasi Analisis Rendah</AlertTitle>
                        <AlertDescription>
                            {analysis.confidence.reasons.join(' ')} Analisis mungkin tidak akurat. Disarankan untuk meminta kandidat mengunggah ulang CV berbasis teks.
                        </AlertDescription>
                    </Alert>
                 )}
                 <div className="grid md:grid-cols-5 gap-6">
                    <Card className="md:col-span-2">
                         <CardHeader><CardTitle className="text-base">Skor Kesesuaian</CardTitle></CardHeader>
                         <CardContent className="text-center">
                            <div className="text-7xl font-bold text-primary">{analysis.overallFitScore}</div>
                            <div className="text-lg font-semibold text-muted-foreground">{fitLabels[analysis.overallFitLabel]}</div>
                             <ul className="mt-4 space-y-1.5 text-left text-xs text-muted-foreground">
                                {analysis.scoreSummary.map((reason, i) => (
                                    <li key={i} className="flex items-start gap-2">
                                        <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary/50" />
                                        <span>{reason}</span>
                                    </li>
                                ))}
                            </ul>
                         </CardContent>
                    </Card>
                     <Card className="md:col-span-3">
                        <CardHeader><CardTitle className="text-base">Rincian Skor per Dimensi</CardTitle></CardHeader>
                         <CardContent>
                            <ChartContainer config={chartConfig} className="h-56 w-full">
                                <BarChart data={chartData} layout="vertical" margin={{ left: 10 }}>
                                    <CartesianGrid horizontal={false} />
                                    <XAxis type="number" dataKey="score" domain={[0, 100]} hide />
                                    <YAxis
                                        type="category"
                                        dataKey="name"
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={10}
                                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                                        width={110}
                                    />
                                    <Tooltip
                                        cursor={{ fill: 'hsl(var(--muted))' }}
                                        content={<ChartTooltipContent hideLabel />}
                                    />
                                    <Bar dataKey="score" fill="hsl(var(--primary))" radius={4} background={{ fill: 'hsl(var(--secondary))', radius: 4 }}>
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill="hsl(var(--primary))" />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ChartContainer>
                         </CardContent>
                     </Card>
                 </div>
                <div className="grid md:grid-cols-2 gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">A. Rekomendasi Keputusan</CardTitle>
                        </CardHeader>
                        <CardContent>
                             <div className={cn("flex items-center gap-2 text-lg font-semibold", Decision.className)}>
                                <Decision.icon className="h-6 w-6" />
                                <span>{Decision.label}</span>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">B. Tingkat Keyakinan</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-4">
                                <Badge variant="outline" className="capitalize text-base py-1 px-3">{confidenceLabels[analysis.confidence.level] || analysis.confidence.level}</Badge>
                                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                    {analysis.confidence.reasons.map((reason, i) => <li key={i}>{reason}</li>)}
                                </ul>
                            </div>
                        </CardContent>
                    </Card>
                </div>
                <AnalysisSection title="C. Matriks Kecocokan Kebutuhan" icon={<Target className="h-5 w-5" />}>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Kebutuhan</TableHead>
                                    <TableHead>Tipe</TableHead>
                                    <TableHead>Kecocokan</TableHead>
                                    <TableHead>Bukti dari CV</TableHead>
                                    <TableHead>Catatan Risiko</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {analysis.requirementMatchMatrix.map((item, i) => {
                                    const match = matchConfig[item.match];
                                    return (
                                        <TableRow key={i}>
                                            <TableCell className="font-medium">{item.requirement}</TableCell>
                                            <TableCell><Badge variant={item.type === 'must-have' ? 'destructive' : 'secondary'}>{item.type === 'must-have' ? 'Wajib' : 'Sebaiknya'}</Badge></TableCell>
                                            <TableCell>
                                                <div className={cn("flex items-center gap-1 font-medium", match.className)}>
                                                    <match.icon className="h-4 w-4" />
                                                    <span>{match.label}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground italic">"{item.evidence_from_cv}"</TableCell>
                                            <TableCell className="text-xs text-destructive">{item.risk_note}</TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </AnalysisSection>
                <div className="grid lg:grid-cols-2 gap-6 items-start">
                     <AnalysisSection title="E. Kekuatan" icon={<CheckCircle className="h-5 w-5 text-green-600" />}>
                         <ul className="space-y-3 text-sm">
                            {analysis.strengths.map((item, i) => (
                                <li key={i}>
                                    <p className="font-medium">{item.strength}</p>
                                    <p className="text-xs text-muted-foreground italic">Bukti: "{item.evidence_from_cv}"</p>
                                </li>
                            ))}
                        </ul>
                     </AnalysisSection>
                     <AnalysisSection title="F. Celah & Risiko" icon={<XCircle className="h-5 w-5 text-red-600" />}>
                         <ul className="space-y-3 text-sm">
                            {analysis.gapsRisks.map((item, i) => (
                                <li key={i}>
                                    <p className="font-medium">{item.gap}</p>
                                    <p className="text-xs text-muted-foreground"><strong>Dampak:</strong> {item.impact}</p>
                                    <p className="text-xs text-muted-foreground"><strong>Mitigasi Onboarding:</strong> {item.onboarding_mitigation}</p>
                                </li>
                            ))}
                        </ul>
                     </AnalysisSection>
                </div>
                 {analysis.redFlags && analysis.redFlags.length > 0 && (
                     <AnalysisSection title="G. Tanda Bahaya (Red Flags)" icon={<AlertCircle className="h-5 w-5 text-destructive" />}>
                         <ul className="list-disc list-inside space-y-1 text-sm text-destructive font-medium">
                            {analysis.redFlags.map((flag, i) => <li key={i}>{flag}</li>)}
                        </ul>
                    </AnalysisSection>
                 )}
                 <Separator />
                 <AnalysisSection title="H. Pertanyaan Wawancara" icon={<FileQuestion className="h-5 w-5" />}>
                     <Accordion type="single" collapsible className="w-full">
                        {analysis.interviewQuestions.map((item, i) => (
                            <AccordionItem value={`item-${i}`} key={i}>
                                <AccordionTrigger>{i+1}. {item.question}</AccordionTrigger>
                                <AccordionContent>
                                    <p className="text-xs text-muted-foreground italic">Jawaban ideal: {item.ideal_answer}</p>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </AnalysisSection>
                 <div className="grid md:grid-cols-2 gap-6 items-start">
                    <AnalysisSection title="I. Rekomendasi Tes Cepat" icon={<FlaskConical className="h-5 w-5" />}>
                        <ul className="list-disc list-inside text-sm space-y-1">
                            {analysis.quickTestRecommendation.map((item, i) => <li key={i}>{item}</li>)}
                        </ul>
                    </AnalysisSection>
                     <AnalysisSection title="J. Informasi yang Hilang" icon={<Lightbulb className="h-5 w-5" />}>
                         <ul className="list-disc list-inside text-sm space-y-1">
                            {analysis.missingInformation.map((item, i) => <li key={i}>{item}</li>)}
                        </ul>
                    </AnalysisSection>
                 </div>
                 {application.cvTextExtractedAt && (
                    <div className="text-center text-xs text-muted-foreground pt-4">
                        <p>CV dianalisis menggunakan '{application.cvTextSource}' pada {application.cvTextExtractedAt.toDate().toLocaleString()}. ({application.cvCharCount} karakter).</p>
                    </div>
                )}
            </div>
        )}
      </CardContent>
    </Card>
  );
}
