'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useAuth, useFirestore, setDocumentNonBlocking } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { UserProfile } from '@/lib/types';
import { Checkbox } from '../ui/checkbox';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const formSchema = z.object({
    fullName: z.string().min(2, { message: 'Nama lengkap (sesuai KTP) harus diisi.' }),
    email: z.string().email({ message: 'Masukkan email yang valid.' }),
    confirmEmail: z.string().email({ message: 'Konfirmasi email yang valid.' }),
    whatsappNumber: z.string()
      .min(10, { message: 'Nomor WhatsApp minimal 10 digit.' })
      .regex(/^[0-9+\-\s]+$/, { message: 'Nomor WhatsApp hanya boleh berisi angka, +, spasi, atau strip.' }),
    password: z.string().min(8, { message: 'Password minimal 8 karakter.' }),
    confirmPassword: z.string().min(8, { message: 'Konfirmasi password minimal 8 karakter.' }),
    agreeToTerms: z.boolean().refine(value => value === true, {
      message: "Anda harus menyetujui Syarat & Ketentuan serta Kebijakan Privasi.",
    }),
  }).refine(data => data.email === data.confirmEmail, {
      message: "Alamat email tidak cocok.",
      path: ["confirmEmail"],
  }).refine(data => data.password === data.confirmPassword, {
      message: "Password tidak cocok.",
      path: ["confirmPassword"],
  });

export function CandidateRegisterForm({ onSwitchToLogin }: { onSwitchToLogin?: () => void } = {}) {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { toast } = useToast();
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
        fullName: '',
        email: '',
        confirmEmail: '',
        whatsappNumber: '',
        password: '',
        confirmPassword: '',
        agreeToTerms: false,
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setLoading(true);
    try {
      const { user } = await createUserWithEmailAndPassword(auth, values.email, values.password);

      const userDocRef = doc(firestore, 'users', user.uid);
      const profileDocRef = doc(firestore, 'profiles', user.uid);
      const batch = writeBatch(firestore);
      const now = serverTimestamp();

      const userProfileData: Omit<UserProfile, 'createdAt'> & { createdAt: any } = {
        uid: user.uid,
        email: values.email,
        fullName: values.fullName,
        nameLower: values.fullName.toLowerCase(),
        role: 'kandidat',
        isActive: true,
        isProfileComplete: false, // Explicitly set to false on creation
        createdAt: now,
      };
      batch.set(userDocRef, userProfileData);

      const profileData = {
          fullName: values.fullName,
          email: values.email,
          phone: values.whatsappNumber,
          whatsappNumber: values.whatsappNumber,
          profileStatus: 'draft',
          profileStep: 1,
          createdAt: now,
          updatedAt: now,
      };
      batch.set(profileDocRef, profileData);
      
      await batch.commit();
      
      // Sign the user out immediately after creating the profile
      await auth.signOut();

      toast({ title: 'Pendaftaran Berhasil', description: 'Silakan login dengan akun Anda yang baru dibuat.' });
      
      // Manually redirect to the login page
      router.push('/careers/login');

    } catch (error: any) {
      console.error(error);
      let desc = 'Terjadi kesalahan saat mendaftar.';
      if (error.code === 'auth/email-already-in-use') {
          desc = 'Email ini sudah terdaftar. Silakan login.';
      }
      toast({
        variant: 'destructive',
        title: 'Pendaftaran Gagal',
        description: desc,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-slate-700 dark:text-slate-300">Nama Lengkap (Sesuai KTP)</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Environesia Keren"
                    {...field}
                    autoComplete="name"
                    className="h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:focus:ring-teal-400"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-slate-700 dark:text-slate-300">Alamat Email</FormLabel>
                <FormControl>
                  <Input
                    placeholder="nama@gmail.com"
                    type="email"
                    {...field}
                    autoComplete="email"
                    className="h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:focus:ring-teal-400"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confirmEmail"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-slate-700 dark:text-slate-300">Konfirmasi Email</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Ulangi alamat email"
                    type="email"
                    {...field}
                    autoComplete="email"
                    className="h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:focus:ring-teal-400"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="whatsappNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-slate-700 dark:text-slate-300">Nomor WhatsApp / HP</FormLabel>
                <FormControl>
                  <Input
                    placeholder="08XXXXXXXXXX atau +62XXXXXXXXXX"
                    {...field}
                    autoComplete="tel"
                    className="h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:focus:ring-teal-400"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-slate-700 dark:text-slate-300">Password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Minimal 8 karakter"
                      className="h-10 pr-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:focus:ring-teal-400"
                      autoComplete="new-password"
                      {...field}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-slate-700 dark:text-slate-300">Konfirmasi Password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Ulangi password"
                      className="h-10 pr-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:focus:ring-teal-400"
                      autoComplete="new-password"
                      {...field}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="agreeToTerms"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <div className="space-y-0.5 leading-none">
                  <FormLabel className="text-sm font-medium text-slate-900 dark:text-slate-200 cursor-pointer">
                    Saya menyetujui Syarat & Ketentuan serta Kebijakan Privasi
                  </FormLabel>
                  <FormMessage />
                </div>
              </FormItem>
            )}
          />
          <Button
            type="submit"
            className="w-full h-10 mt-2 rounded-lg font-semibold text-sm bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600 text-white"
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Daftar
          </Button>
        </form>
      </Form>

      {/* Login Link */}
      <p className="text-center text-sm text-slate-600 dark:text-slate-400">
        Sudah punya akun?{' '}
        {onSwitchToLogin ? (
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors underline-offset-4 hover:underline"
          >
            Login di sini
          </button>
        ) : (
          <Link
            href="/careers/login"
            className="font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors underline-offset-4 hover:underline"
          >
            Login di sini
          </Link>
        )}
      </p>

      {/* Back Link */}
      <div className="pt-2 text-center">
        <Link
          href="/careers"
          className="text-xs text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
        >
          ← Kembali ke Halaman Karir
        </Link>
      </div>
    </div>
  );
}
