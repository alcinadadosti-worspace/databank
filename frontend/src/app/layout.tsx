import type { Metadata } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'DataBank — Banco de Horas',
  description: 'Sistema de acompanhamento de banco de horas',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  );
}
