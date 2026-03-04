'use client';

import { useState, useEffect, Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Eye, EyeOff, XCircle, FileText, CheckCircle, Clock } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import Link from 'next/link';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import type { Invite } from '@/lib/types';

const formSchema = z.object({
    fullName: z.string().min(2, { message: 'Nama lengkap (sesuai KTP) harus diisi.' }),
    email: z.string().email({ message: 'Masukkan email yang valid.' }),
    password: z.string().min(8, { message: 'Password minimal 8 karakter.' }),
    confirmPassword: z.string().min(8, { message: 'Konfirmasi password minimal 8 karakter.' }),
}).refine(data => data.password === data.confirmPassword, {
    message: "Password tidak cocok.",
    path: ["confirmPassword"],
});

type FormValues = z.infer<typeof formSchema>;

export function RegisterWithCodeForm() {
    const [inviteState, setInviteState] = useState<{
        status: 'loading' | 'valid' | 'invalid';
        data: Invite | null;
        message: string | null;
    }>({ status: 'loading', data: null, message: null });

    const [isRegistering, setIsRegistering] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const searchParams = useSearchParams();
    const router = useRouter();
    const { toast } = useToast();
    const code = searchParams.get('code');

    useEffect(() => {
        if (!code) {
            setInviteState({ status: 'invalid', data: null, message: 'Kode undangan tidak ditemukan. Pastikan URL Anda benar.' });
            return;
        }

        const validateCode = async () => {
            try {
                const response = await fetch(`/api/invites/${code}`);
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error || 'Gagal memvalidasi kode.');
                }
                setInviteState({ status: 'valid', data, message: null });
            } catch (error: any) {
                setInviteState({ status: 'invalid', data: null, message: error.message });
            }
        };

        validateCode();
    }, [code]);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: { fullName: '', email: '', password: '', confirmPassword: '' },
    });

    async function onSubmit(values: FormValues) {
        setIsRegistering(true);
        try {
            const response = await fetch('/api/register-with-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...values, code }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Registrasi gagal.');
            }
            toast({
                title: 'Registrasi Berhasil!',
                description: 'Silakan login dengan akun yang baru Anda buat.',
            });
            router.push('/admin/login');
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Registrasi Gagal',
                description: error.message,
            });
        } finally {
            setIsRegistering(false);
        }
    }

    if (inviteState.status === 'loading') {
        return <div className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /><span>Memvalidasi undangan...</span></div>;
    }

    if (inviteState.status === 'invalid') {
        return (
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-destructive">Undangan Tidak Valid</CardTitle>
                </CardHeader>
                <CardContent>
                    <Alert variant="destructive">
                        <XCircle className="h-4 w-4" />
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>{inviteState.message || 'Terjadi kesalahan tidak diketahui.'}</AlertDescription>
                    </Alert>
                    <Button asChild className="w-full mt-6"><Link href="/admin/login">Kembali ke Login</Link></Button>
                </CardContent>
            </Card>
        );
    }
    
    return (
        <Card className="w-full max-w-md">
            <CardHeader>
                <CardTitle>Registrasi Karyawan Baru</CardTitle>
                <CardDescription>Anda diundang untuk bergabung sebagai {inviteState.data?.employmentType} di {inviteState.data?.brandName}.</CardDescription>
            </CardHeader>
            <CardContent>
                 <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField control={form.control} name="fullName" render={({ field }) => (<FormItem><FormLabel>Nama Lengkap</FormLabel><FormControl><Input placeholder="Sesuai KTP" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                        <FormField control={form.control} name="email" render={({ field }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="email@contoh.com" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                        <FormField control={form.control} name="password" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Password</FormLabel>
                                <FormControl>
                                    <div className="relative">
                                    <Input type={showPassword ? 'text' : 'password'} placeholder="Minimal 8 karakter" {...field} />
                                    <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute inset-y-0 right-0 flex items-center pr-3"><span className="sr-only">Toggle password visibility</span>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                                    </div>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}/>
                        <FormField control={form.control} name="confirmPassword" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Konfirmasi Password</FormLabel>
                                <FormControl>
                                    <div className="relative">
                                    <Input type={showConfirmPassword ? 'text' : 'password'} placeholder="Ulangi password" {...field} />
                                    <button type="button" onClick={() => setShowConfirmPassword(p => !p)} className="absolute inset-y-0 right-0 flex items-center pr-3"><span className="sr-only">Toggle password visibility</span>{showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                                    </div>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}/>
                        <Button type="submit" className="w-full" disabled={isRegistering}>
                            {isRegistering && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Daftar
                        </Button>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
