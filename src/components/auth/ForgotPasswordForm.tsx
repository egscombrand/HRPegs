'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useAuth } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Loader2, MailCheck } from 'lucide-react';
import Link from 'next/link';

const formSchema = z.object({
  email: z.string().email({ message: 'Masukkan alamat email yang valid.' }),
});

export function ForgotPasswordForm() {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();
  const auth = useAuth();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, values.email);
      // For security, always show success to prevent email enumeration
      setSubmitted(true);
    } catch (error: any) {
      console.error("Password reset error:", error);
      // Even on "user-not-found", we show the success message.
      if (error.code === 'auth/user-not-found') {
        setSubmitted(true);
        return;
      }
      toast({
        variant: 'destructive',
        title: 'Gagal Mengirim Email',
        description: 'Terjadi kesalahan pada server. Silakan coba lagi nanti.',
      });
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="text-center">
        <MailCheck className="mx-auto h-12 w-12 text-primary" />
        <h2 className="mt-4 text-xl font-semibold">Periksa Email Anda</h2>
        <p className="mt-2 text-muted-foreground">
          Jika akun dengan email <strong>{form.getValues('email')}</strong> terdaftar, kami telah mengirimkan tautan untuk mengatur ulang kata sandi Anda.
        </p>
        <Button asChild className="mt-6 w-full">
          <Link href="/careers/login">Kembali ke Login</Link>
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormDescription>
                Masukkan alamat email yang terdaftar untuk menerima tautan reset kata sandi.
              </FormDescription>
              <FormControl>
                <Input placeholder="nama@gmail.com" {...field} autoComplete="email" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          Kirim Email Reset
        </Button>
      </form>
    </Form>
  );
}
