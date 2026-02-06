'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary">
      <div className="text-center max-w-md animate-fade-in">
        <h1 className="text-3xl font-bold text-text-primary tracking-tight">DataBank</h1>
        <p className="text-sm text-text-secondary mt-2">Sistema de Acompanhamento de Banco de Horas</p>

        <div className="mt-10 space-y-3">
          <Link href="/admin" className="btn-primary w-full block">
            Painel RH / Admin
          </Link>
          <Link href="/manager" className="btn-secondary w-full block">
            Painel Gestor
          </Link>
        </div>

        <p className="text-2xs text-text-muted mt-8">
          Dados read-only da Solides Tangerino
        </p>
      </div>
    </div>
  );
}
