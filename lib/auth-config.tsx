'use client';

export interface AuthPaths {
  home: string;
  login: string;
  register: string;
  forgotPassword: string;
  resetPassword: string;
  logout: string;
  verifyEmail: string;
  verifyPhone: string;
  dashboard: string;
  profile: string;
  settings: string;
}

export const authPaths: AuthPaths = {
  home: '/',
  login: '/auth/login',
  register: '/auth/register',
  forgotPassword: '/auth/forgot-password',
  resetPassword: '/auth/reset-password',
  logout: '/auth/logout',
  verifyEmail: '/auth/verify-email',
  verifyPhone: '/auth/verify-phone',
  dashboard: '/dashboard',
  profile: '/profile',
  settings: '/settings',
};

export const isAuthProtectedPath = (path: string): boolean => {
  return path.startsWith('/dashboard') || path.startsWith('/profile') || path.startsWith('/settings');
};
