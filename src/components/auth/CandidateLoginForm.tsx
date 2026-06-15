'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useAuth, useFirestore } from '@/firebase';
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
import { Loader2, LogIn, Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { UserProfile, ROLES_INTERNAL } from '@/lib/types';
import Link from 'next/link';


const formSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email.' }),
  password: z.string().min(8, { message: 'Password must be at least 8 characters.' }),
});

export function CandidateLoginForm({ onSwitchToRegister }: { onSwitchToRegister?: () => void } = {}) {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' },
  });

  const handleAuthSuccess = async (user: any) => {
    const userDocRef = doc(firestore, 'users', user.uid);
    const profileDocRef = doc(firestore, 'profiles', user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      const userProfile = userDocSnap.data() as UserProfile;
      if (ROLES_INTERNAL.includes(userProfile.role)) {
        await auth.signOut();
        toast({
          variant: 'destructive',
          title: 'Akun Internal Terdeteksi',
          description: 'Akun ini terdaftar sebagai akun internal. Silakan login di portal karyawan.',
        });
        router.push('/admin/login');
        return;
      }
       // Safety check: if user exists but profile doesn't, create it
      const profileDocSnap = await getDoc(profileDocRef);
      if (!profileDocSnap.exists()) {
        const defaultProfileData = {
            fullName: user.displayName || userProfile.fullName,
            email: user.email!,
            profileStatus: 'draft',
            profileStep: 1,
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
        };
        await setDoc(profileDocRef, defaultProfileData);
      }
    } else {
      // New user (likely from Google Sign-In), create their user and profile docs
      const batch = writeBatch(firestore);

      const newUserProfile: Omit<UserProfile, 'createdAt'> & { createdAt: any } = {
        uid: user.uid,
        email: user.email!,
        fullName: user.displayName || 'Kandidat Baru',
        role: 'kandidat',
        isActive: true,
        isProfileComplete: false,
        createdAt: serverTimestamp(),
      };
      batch.set(userDocRef, newUserProfile);

      const defaultProfileData = {
          fullName: user.displayName || 'Kandidat Baru',
          email: user.email!,
          profileStatus: 'draft',
          profileStep: 1,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
      };
      batch.set(profileDocRef, defaultProfileData);

      await batch.commit();
    }
    // On successful candidate login/creation, layout will redirect to /careers/portal
    toast({ title: 'Success', description: 'Logged in successfully.' });
  };


  async function onSubmit(values: z.infer<typeof formSchema>) {
    setLoading(true);
    try {
      const { user } = await signInWithEmailAndPassword(auth, values.email, values.password);
      await handleAuthSuccess(user);
    } catch (error: any) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Login Gagal',
        description: 'Email atau password salah.',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className='space-y-4'>
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                        <Input placeholder="nama@gmail.com" {...field} autoComplete="email" />
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
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="********"
                            className="pr-10"
                            autoComplete="current-password"
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground"
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

                <div className="text-right -mt-2">
                    <Link
                        href="/careers/forgot-password"
                        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                        Lupa kata sandi?
                    </Link>
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
                Masuk
                </Button>
            </form>
        </Form>

        {/* Register Link */}
        <p className="text-center text-sm text-muted-foreground">
          Belum punya akun?{' '}
          {onSwitchToRegister ? (
            <button
              type="button"
              onClick={onSwitchToRegister}
              className="font-medium text-primary hover:underline underline-offset-4"
            >
              Daftar di sini
            </button>
          ) : (
            <Link
              href="/careers/register"
              className="font-medium text-primary hover:underline underline-offset-4"
            >
              Daftar di sini
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
