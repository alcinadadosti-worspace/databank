'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAdminAuth } from './AdminAuthContext';

export default function AdminLogin() {
  const [password, setPassword] = useState('');
  const { login, loading, error } = useAdminAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.trim()) {
      await login(password.trim());
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary">
      <div className="card max-w-md w-full mx-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-primary mb-4"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Voltar
        </Link>
        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold text-text-primary">Painel RH / Admin</h1>
          <p className="text-sm text-text-tertiary mt-1">
            Digite a senha para acessar
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">
              Senha
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Digite a senha"
              className="input w-full"
              disabled={loading}
              autoFocus
            />
          </div>

          {error && (
            <div className="text-sm text-status-danger bg-status-danger/10 px-3 py-2 rounded">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="btn-primary w-full py-2.5"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
