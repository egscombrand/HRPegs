'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth as useFirebaseAuth, useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, LogIn, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { UserProfile, ROLES_INTERNAL } from '@/lib/types';
import { cn } from '@/lib/utils';

const formSchema = z.object({
  email: z.string().email({ message: 'Masukkan email yang valid.' }),
  password: z.string().min(8, { message: 'Password minimal 8 karakter.' }),
  rememberMe: z.boolean().default(false),
});

const REMEMBER_ME_KEY = 'hrp-remember-email';
const REMEMBER_ME_EMAIL_KEY = 'hrp-remember-email-value';

export function AdminLoginForm() {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPasswordDialog, setShowForgotPasswordDialog] = useState(false);
  const { toast } = useToast();
  const auth = useFirebaseAuth();
  const firestore = useFirestore();
  const router = useRouter();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: typeof window !== 'undefined'
        ? localStorage.getItem(REMEMBER_ME_EMAIL_KEY) || ''
        : '',
      password: '',
      rememberMe: typeof window !== 'undefined'
        ? localStorage.getItem(REMEMBER_ME_KEY) === 'true'
        : false,
    },
  });

  const handleRememberMeChange = (checked: boolean) => {
    if (checked) {
      localStorage.setItem(REMEMBER_ME_KEY, 'true');
      localStorage.setItem(REMEMBER_ME_EMAIL_KEY, form.getValues('email'));
    } else {
      localStorage.removeItem(REMEMBER_ME_KEY);
      localStorage.removeItem(REMEMBER_ME_EMAIL_KEY);
    }
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        values.email,
        values.password
      );
      const user = userCredential.user;

      const userDocRef = doc(firestore, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        await auth.signOut();
        throw new Error('Akun internal belum terdaftar. Hubungi admin.');
      }

      const userProfile = userDocSnap.data() as UserProfile;

      // Check if account is active
      if (!userProfile.isActive) {
        await auth.signOut();
        toast({
          variant: 'destructive',
          title: 'Akun Dinonaktifkan',
          description: 'Akun Anda telah dinonaktifkan. Hubungi administrator untuk informasi lebih lanjut.',
        });
        return;
      }

      if (!ROLES_INTERNAL.includes(userProfile.role)) {
        await auth.signOut();
        toast({
          variant: 'destructive',
          title: 'Akses Ditolak',
          description: 'Akses khusus karyawan. Silakan login kandidat di halaman karir.',
        });
        router.push('/careers/login');
        return;
      }

      // Update remember me preference
      if (values.rememberMe) {
        localStorage.setItem(REMEMBER_ME_KEY, 'true');
        localStorage.setItem(REMEMBER_ME_EMAIL_KEY, values.email);
      } else {
        localStorage.removeItem(REMEMBER_ME_KEY);
        localStorage.removeItem(REMEMBER_ME_EMAIL_KEY);
      }

      toast({
        title: 'Berhasil Masuk',
        description: 'Selamat datang di HRP Environesia.',
      });
    } catch (error: any) {
      console.error(error);
      let errorMessage = 'Terjadi kesalahan. Silakan coba lagi.';
      let errorTitle = 'Login Gagal';

      if (
        error.code === 'auth/user-not-found' ||
        error.code === 'auth/wrong-password' ||
        error.code === 'auth/invalid-credential'
      ) {
        errorMessage = 'Email atau password salah. Silakan coba lagi.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage =
          'Terlalu banyak percobaan login yang gagal. Coba beberapa saat lagi.';
      } else if (error.code === 'auth/user-disabled') {
        errorMessage = 'Akun Anda telah dinonaktifkan. Hubungi administrator.';
      } else if (error.message?.includes('belum terdaftar')) {
        errorMessage = error.message;
      }

      toast({
        variant: 'destructive',
        title: errorTitle,
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Form {...form}>
        <div className="space-y-6 w-full">
          {/* Email Field */}
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                  Email
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="nama@company.com"
                    {...field}
                    autoComplete="email"
                    disabled={loading}
                    className="h-11 rounded-lg border bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 border-slate-300 dark:border-slate-700 transition-colors focus:border-teal-500 dark:focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:focus:ring-teal-400/20"
                  />
                </FormControl>
                <FormMessage className="text-rose-600 dark:text-rose-400" />
              </FormItem>
            )}
          />

          {/* Password Field */}
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                    Password
                  </FormLabel>
                  <button
                    type="button"
                    onClick={() => setShowForgotPasswordDialog(true)}
                    className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
                  >
                    Lupa kata sandi?
                  </button>
                </div>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      {...field}
                      autoComplete="current-password"
                      disabled={loading}
                      className="h-11 pr-11 rounded-lg border bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 border-slate-300 dark:border-slate-700 transition-colors focus:border-teal-500 dark:focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:focus:ring-teal-400/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={loading}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage className="text-rose-600 dark:text-rose-400" />
              </FormItem>
            )}
          />

          {/* Remember Me Checkbox */}
          <FormField
            control={form.control}
            name="rememberMe"
            render={({ field }) => (
              <FormItem className="flex items-center space-x-3 space-y-0 pt-2">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(checked) => {
                      field.onChange(checked);
                      handleRememberMeChange(checked as boolean);
                    }}
                    disabled={loading}
                    className="w-5 h-5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </FormControl>
                <FormLabel className="text-sm font-medium cursor-pointer mt-0 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-300 transition-colors">
                  Ingat saya di perangkat ini
                </FormLabel>
              </FormItem>
            )}
          />

          {/* Submit Button */}
          <button
            type="button"
            onClick={() => form.handleSubmit(onSubmit)()}
            disabled={loading}
            className="w-full h-11 mt-8 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 bg-teal-600 dark:bg-teal-600 text-white hover:bg-teal-700 dark:hover:bg-teal-700 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Memproses...
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                Masuk
              </>
            )}
          </button>

          {/* Security Notice - Single one only */}
          <div className="rounded-xl p-4 border-l-4 mt-6 bg-teal-50 dark:bg-teal-950/20 border-teal-200 dark:border-teal-800">
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              <span className="font-semibold text-teal-600 dark:text-teal-400">
                Keamanan:
              </span>
              {' '}Jangan bagikan akun dan password Anda kepada siapapun.
            </p>
          </div>
        </div>
      </Form>

      {/* Forgot Password Dialog */}
      <Dialog open={showForgotPasswordDialog} onOpenChange={setShowForgotPasswordDialog}>
        <DialogContent className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950">
          <DialogHeader className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="rounded-full p-2 flex-shrink-0 mt-0.5 bg-teal-100 dark:bg-teal-950/30">
                <AlertCircle className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="space-y-1 flex-1">
                <DialogTitle className="text-slate-900 dark:text-white">
                  Lupa Kata Sandi?
                </DialogTitle>
                <DialogDescription className="text-slate-600 dark:text-slate-400">
                  Proses pemulihan akun Anda
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Info Alert */}
            <div className="rounded-lg p-4 border-l-4 bg-teal-50 dark:bg-teal-950/20 border-teal-200 dark:border-teal-800">
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Karena sistem masih dalam tahap pengembangan, proses reset password belum otomatis melalui email.
              </p>
            </div>

            {/* Steps */}
            <div className="space-y-3">
              <h4 className="font-semibold text-sm text-slate-900 dark:text-white">
                Langkah-langkah:
              </h4>
              <ol className="text-sm space-y-3">
                <li className="flex gap-3">
                  <span className="font-bold flex-shrink-0 w-6 text-teal-600 dark:text-teal-400">
                    1
                  </span>
                  <span className="text-slate-600 dark:text-slate-400">Hubungi HRD atau Super Admin Anda</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-bold flex-shrink-0 w-6 text-teal-600 dark:text-teal-400">
                    2
                  </span>
                  <span className="text-slate-600 dark:text-slate-400">Minta untuk reset password sementara</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-bold flex-shrink-0 w-6 text-teal-600 dark:text-teal-400">
                    3
                  </span>
                  <span className="text-slate-600 dark:text-slate-400">Setelah login dengan password sementara, sistem akan meminta Anda membuat password baru</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-bold flex-shrink-0 w-6 text-teal-600 dark:text-teal-400">
                    4
                  </span>
                  <span className="text-slate-600 dark:text-slate-400">Gunakan password baru untuk login berikutnya</span>
                </li>
              </ol>
            </div>

            {/* Success Message */}
            <div className="rounded-lg p-4 border-l-4 flex gap-3 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Password baru yang Anda buat akan disimpan dengan aman di sistem.
              </p>
            </div>
          </div>

          {/* Close Button */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setShowForgotPasswordDialog(false)}
              className="flex-1 h-10 rounded-lg font-bold text-sm transition-all bg-teal-600 text-white hover:bg-teal-700"
            >
              Mengerti
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
