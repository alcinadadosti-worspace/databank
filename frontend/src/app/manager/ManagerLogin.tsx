'use client';

import { useState } from 'react';
import { useManagerAuth } from './ManagerAuthContext';

type LoginMode = 'email' | 'password';

export default function ManagerLogin() {
  const [mode, setMode] = useState<LoginMode>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, loading, error } = useManagerAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === 'email' && email.trim()) {
      await login(email.trim(), undefined);
    } else if (mode === 'password' && password.trim()) {
      await login(undefined, password.trim());
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary">
      <div className="card max-w-md w-full mx-4">
        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold text-text-primary">Painel Gestor</h1>
          <p className="text-sm text-text-tertiary mt-1">
            Acesse com seu email ou senha
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex mb-6 bg-bg-tertiary rounded-lg p-1">
          <button
            type="button"
            onClick={() => setMode('email')}
            className={`flex-1 py-2 text-sm rounded-md transition-colors ${
              mode === 'email'
                ? 'bg-bg-primary text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Email
          </button>
          <button
            type="button"
            onClick={() => setMode('password')}
            className={`flex-1 py-2 text-sm rounded-md transition-colors ${
              mode === 'password'
                ? 'bg-bg-primary text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Senha Master
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'email' ? (
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.email@exemplo.com"
                className="input w-full"
                disabled={loading}
                autoFocus
              />
            </div>
          ) : (
            <div>
              <label htmlFor="password" className="block text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">
                Senha
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite a senha master"
                className="input w-full"
                disabled={loading}
                autoFocus
              />
            </div>
          )}

          {error && (
            <div className="text-sm text-status-danger bg-status-danger/10 px-3 py-2 rounded">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (mode === 'email' ? !email.trim() : !password.trim())}
            className="btn-primary w-full py-2.5"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
