'use client';

import React from 'react';

// Stub de estado de sesión: aún no hay UI de perfil. Se muestra nada.
export type AuthStatusPaths = {
  login?: string;
  register?: string;
  profile?: string;
  logout?: string;
};

export default function AuthStatus(_: { paths?: AuthStatusPaths }) {
  return null;
}