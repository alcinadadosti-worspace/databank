'use client';

export default function AdminRelatorios() {
  function handleOpenReports() {
    window.open('https://relatoriodehours.onrender.com', '_blank');
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Relatorios</h2>
        <p className="text-sm text-text-tertiary mt-1">
          Acesse os relatorios semanais de horas
        </p>
      </div>

      <div className="card flex flex-col items-center justify-center py-12">
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-accent-primary mb-4"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>

        <p className="text-text-secondary mb-6 text-center max-w-md">
          Clique no botao abaixo para acessar o sistema de relatorios de horas
        </p>

        <button
          onClick={handleOpenReports}
          className="btn-primary px-6 py-3 text-base flex items-center gap-2"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          Ir para Relatorios
        </button>
      </div>
    </div>
  );
}
