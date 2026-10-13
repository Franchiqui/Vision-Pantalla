'use client';

import * as React from 'react';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/toaster';
import { useStore } from '@/lib/store';

export function Providers({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    useStore.getState().init();
  }, []);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
      <Toaster />
    </ThemeProvider>
  );
};
