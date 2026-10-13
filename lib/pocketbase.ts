import PocketBase from 'pocketbase';

/** URL de PocketBase. En otra app: .env con NEXT_PUBLIC_POCKETBASE_URL */
export function getPocketBaseUrl(): string {
  return process.env.NEXT_PUBLIC_POCKETBASE_URL ?? 'http://127.0.0.1:8090';
}

const pb = new PocketBase(getPocketBaseUrl());

/** Opciones por defecto para la cookie de sesión (reutilizable) */
export const authCookieOptions = {
  httpOnly: false,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'Lax' as const,
  path: '/',
  maxAge: 30 * 24 * 60 * 60, // 30 días
};

export default pb;