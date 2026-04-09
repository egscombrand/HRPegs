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
import { JobApplication } from '@/lib/types';
import { format } from 'date-fns';

interface CandidateFitAnalysisProps {
  profile: Profile;
  job: Job;
  application: JobApplication;
  compact?: boolean;
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

const scoreLabels: Record<string, string> = {
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

export function CandidateFitAnalysis({ profile, job, application, compact }: CandidateFitAnalysisProps) {
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
        const cultureFitValue = typeof value === 'object' ? value.score : value;
        return { name: scoreLabels['cultureFitScore'], score: cultureFitValue };
      }
      return { name: scoreLabels[key as keyof typeof scoreLabels] || key, score: typeof value === 'object' ? value.score : value };
    }) : [];

  const MainContent = (
    <div className="space-y-6">
      {!compact && (
        <div className="flex justify-between items-start mb-6">
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
      )}
      
      {compact && !analysis && !isLoading && !error && (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
              <Sparkles className="h-12 w-12 text-primary/20" />
              <div>
                  <h4 className="text-xl font-black italic">Ready to Analyze</h4>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto">Klik tombol di bawah untuk memulai analisis AI pada CV kandidat ini.</p>
              </div>
              <Button onClick={handleAnalyze}>
                  Mulai Analisis Sekarang
              </Button>
          </div>
      )}

        {!isLoading && !analysis && !error && !compact && (
            <div className="text-center py-8 text-muted-foreground">
                Klik tombol untuk memulai analisis AI.
            </div>
        )}
        {isLoading && (
            <div className="space-y-4 rounded-lg border border-dashed p-8 text-center min-h-[300px] flex flex-col justify-center">
              <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
              <div className="mx-auto max-w-md">
                <p className="font-bold text-lg">AI sedang menganalisis profil...</p>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  Proses ini membutuhkan waktu sekitar <strong>15-30 detik</strong>. AI sedang membandingkan kualifikasi CV dengan persyaratan jabatan.
                </p>
              </div>
            </div>
        )}
        {error && (
            <div className="flex flex-col items-center justify-center text-center py-12 text-destructive">
                <AlertCircle className="h-12 w-12 mb-4" />
                <p className="font-bold text-lg">{error}</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={handleAnalyze}>Coba Lagi</Button>
            </div>
        )}
        {analysis && Decision && (
            <div className="space-y-6">
                 {analysis.confidence.level === 'low' && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Akurasi Analisis Rendah</AlertTitle>
                        <AlertDescription>
                            {analysis.confidence.reasons.join(' ')} Analisis mungkin tidak akurat.
                        </AlertDescription>
                    </Alert>
                 )}
                 <div className="grid md:grid-cols-5 gap-6">
                    <Card className="md:col-span-2 border-primary/20">
                         <CardHeader><CardTitle className="text-base uppercase tracking-widest font-black">Overall Fit</CardTitle></CardHeader>
                         <CardContent className="text-center">
                            <div className="text-7xl font-black text-primary">{analysis.overallFitScore}</div>
                            <div className="text-lg font-bold text-muted-foreground uppercase">{fitLabels[analysis.overallFitLabel]}</div>
                              <div className="mt-6 space-y-2 text-left bg-muted/30 p-4 rounded-2xl border">
                                {analysis.scoreSummary.map((reason, i) => (
                                    <div key={i} className="flex items-start gap-2 text-xs font-medium">
                                        <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
                                        <span>{reason}</span>
                                    </div>
                                ))}
                            </div>
                         </CardContent>
                    </Card>
                     <Card className="md:col-span-3 border-primary/20">
                        <CardHeader><CardTitle className="text-base uppercase tracking-widest font-black">Score Matrix</CardTitle></CardHeader>
                         <CardContent>
                            <ChartContainer config={chartConfig} className="h-64 w-full">
                                <BarChart data={chartData} layout="vertical" margin={{ left: 10 }}>
                                    <CartesianGrid horizontal={false} strokeDasharray="3 3" opacity={0.3} />
                                    <XAxis type="number" dataKey="score" domain={[0, 100]} hide />
                                    <YAxis
                                        type="category"
                                        dataKey="name"
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={10}
                                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11, fontWeight: 'bold' }}
                                        width={110}
                                    />
                                    <Tooltip
                                        cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                                        content={<ChartTooltipContent hideLabel />}
                                    />
                                    <Bar dataKey="score" fill="hsl(var(--primary))" radius={6} background={{ fill: 'hsl(var(--secondary))', radius: 6 }}>
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
                    <Card className="border-green-200 bg-green-50/10">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-black">Decision Recommendation</CardTitle>
                        </CardHeader>
                        <CardContent>
                             <div className={cn("flex items-center gap-3 text-xl font-black", Decision.className)}>
                                <Decision.icon className="h-7 w-7" />
                                <span>{Decision.label}</span>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-blue-200 bg-blue-50/10">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-black">AI Confidence</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col gap-2">
                                <Badge variant="outline" className="w-fit capitalize text-sm font-black py-1 px-3 border-2">{confidenceLabels[analysis.confidence.level] || analysis.confidence.level}</Badge>
                                <p className="text-xs text-muted-foreground italic leading-relaxed">
                                    {analysis.confidence.reasons.join(', ')}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
                <AnalysisSection title="Requirement Match Matrix" icon={<Target className="h-5 w-5" />}>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead className="font-black text-[10px] uppercase tracking-wider">Requirement</TableHead>
                                    <TableHead className="font-black text-[10px] uppercase tracking-wider text-center">Type</TableHead>
                                    <TableHead className="font-black text-[10px] uppercase tracking-wider text-center">Match</TableHead>
                                    <TableHead className="font-black text-[10px] uppercase tracking-wider">Evidence from CV</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {analysis.requirementMatchMatrix.map((item, i) => {
                                    const match = matchConfig[item.match];
                                    return (
                                        <TableRow key={i}>
                                            <TableCell className="font-bold text-sm">{item.requirement}</TableCell>
                                            <TableCell className="text-center"><Badge variant={item.type === 'must-have' ? 'destructive' : 'secondary'} className="text-[9px] font-black">{item.type === 'must-have' ? 'WAJIB' : 'SEBAIKNYA'}</Badge></TableCell>
                                            <TableCell>
                                                <div className={cn("flex items-center justify-center gap-1.5 font-black text-[10px] uppercase", match.className)}>
                                                    <match.icon className="h-3.5 w-3.5" />
                                                    <span>{match.label}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground leading-relaxed italic">
                                                &ldquo;{item.evidence_from_cv}&rdquo;
                                                {item.risk_note && <p className="text-[10px] text-destructive font-bold mt-1 uppercase tracking-tighter">(!) {item.risk_note}</p>}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </AnalysisSection>
                <div className="grid lg:grid-cols-2 gap-6 items-start">
                     <AnalysisSection title="Strengths" icon={<CheckCircle className="h-5 w-5 text-green-500" />}>
                         <ul className="space-y-4">
                            {analysis.strengths.map((item, i) => (
                                <li key={i} className="bg-green-500/10 p-5 rounded-2xl border border-green-500/20">
                                    <p className="font-black text-base text-green-500">{item.strength}</p>
                                    <p className="text-sm text-green-400/80 italic mt-2 leading-relaxed">&ldquo;{item.evidence_from_cv}&rdquo;</p>
                                </li>
                            ))}
                        </ul>
                     </AnalysisSection>
                     <AnalysisSection title="Gaps & Risks" icon={<XCircle className="h-5 w-5 text-red-500" />}>
                         <ul className="space-y-4">
                            {analysis.gapsRisks.map((item, i) => (
                                <li key={i} className="bg-red-500/10 p-5 rounded-2xl border border-red-500/20">
                                    <p className="font-black text-base text-red-500">{item.gap}</p>
                                    <div className="mt-3 space-y-2">
                                        <p className="text-sm text-red-400/90 font-medium leading-relaxed underline decoration-red-500/30 underline-offset-4">Impact: {item.impact}</p>
                                        <p className="text-xs text-red-50/70 font-medium leading-relaxed bg-red-500/20 p-3 rounded-xl">
                                            <strong className="text-red-400 uppercase tracking-tighter">Mitigation:</strong> {item.onboarding_mitigation}
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                     </AnalysisSection>
                </div>
                  {analysis.redFlags && analysis.redFlags.length > 0 && (
                      <div className="p-6 rounded-3xl bg-red-500/10 border-2 border-dashed border-red-500/30">
                          <h4 className="flex items-center gap-2 font-black text-red-600 mb-4 uppercase tracking-widest text-sm">
                             <AlertCircle className="h-5 w-5" /> Tanda Bahaya (Red Flags)
                          </h4>
                          <ul className="list-disc list-inside space-y-2">
                            {analysis.redFlags.map((flag, i) => <li key={i} className="text-sm font-bold text-red-800">{flag}</li>)}
                        </ul>
                    </div>
                 )}
                 
                 <AnalysisSection title="Interview Questions Strategy" icon={<FileQuestion className="h-5 w-5" />}>
                     <Accordion type="single" collapsible className="w-full">
                        {analysis.interviewQuestions.map((item, i) => (
                            <AccordionItem value={`item-${i}`} key={i} className="border-b-muted last:border-0 px-2">
                                <AccordionTrigger className="text-left font-bold py-4 hover:no-underline">{i+1}. {item.question}</AccordionTrigger>
                                <AccordionContent className="bg-muted/30 p-4 rounded-2xl border mb-2">
                                    <p className="text-[10px] font-black uppercase text-muted-foreground mb-2">Ideal Answer Insight</p>
                                    <p className="text-sm leading-relaxed text-foreground/80 italic font-medium">{item.ideal_answer}</p>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </AnalysisSection>

                 <div className="grid md:grid-cols-2 gap-6 items-start">
                    <AnalysisSection title="Quick Test Recs" icon={<FlaskConical className="h-5 w-5" />}>
                        <ul className="space-y-2">
                            {analysis.quickTestRecommendation.map((item, i) => (
                                <li key={i} className="flex gap-2 items-start text-xs font-bold leading-relaxed">
                                    <Target className="h-3.5 w-3.5 shrink-0 text-primary/50" />
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </AnalysisSection>
                     <AnalysisSection title="Missing Info" icon={<Lightbulb className="h-5 w-5" />}>
                         <ul className="space-y-2">
                            {analysis.missingInformation.map((item, i) => (
                                <li key={i} className="flex gap-2 items-start text-xs font-bold leading-relaxed">
                                    <FileClock className="h-3.5 w-3.5 shrink-0 text-amber-500/50" />
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </AnalysisSection>
                 </div>
                 {application.cvTextExtractedAt && (
                    <div className="text-center text-[10px] font-bold text-muted-foreground/50 pt-8 border-t border-dashed">
                        <p>Dianalisis menggunakan {application.cvTextSource} pada {format(application.cvTextExtractedAt.toDate(), 'dd MMM yyyy, HH:mm')} WIB. Total {application.cvCharCount} karakter CV diproses.</p>
                    </div>
                )}
            </div>
        )}
    </div>
  );

  if (compact) return MainContent;

  return (
    <Card className="border-none shadow-none bg-transparent">
      <CardContent className="p-0">
        {MainContent}
      </CardContent>
    </Card>
  );
}
