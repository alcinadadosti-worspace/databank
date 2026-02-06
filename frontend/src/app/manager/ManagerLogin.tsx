'use client';

import { useState } from 'react';
import { useManagerAuth } from './ManagerAuthContext';

export default function ManagerLogin() {
  const [email, setEmail] = useState('');
  const { login, loading, error } = useManagerAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (email.trim()) {
      await login(email.trim());
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary">
      <div className="card max-w-md w-full mx-4">
        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold text-text-primary">Painel Gestor</h1>
          <p className="text-sm text-text-tertiary mt-1">
            Digite seu email para acessar
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          {error && (
            <div className="text-sm text-status-danger bg-status-danger/10 px-3 py-2 rounded">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="btn-primary w-full py-2.5"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
