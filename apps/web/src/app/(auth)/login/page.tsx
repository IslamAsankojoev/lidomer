import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Вход' };

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
