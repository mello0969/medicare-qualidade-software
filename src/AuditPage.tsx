import { useEffect, useState } from 'react';
import { getAudit, auditLabels, type AuditEvent } from './api';
export default function AuditPage() {
  const [rows, setRows] = useState<AuditEvent[] | null>(null),
    [error, setError] = useState(''),
    [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    setRows(null);
    getAudit()
      .then((data) => {
        if (active) setRows(data.events);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [reload]);
  return (
    <section className="surface dash-section">
      <h1>Auditoria</h1>
      <p>Até 100 eventos recentes de contas, perguntas, escalas e ouvidoria.</p>
      <button className="text-button" onClick={() => setReload((n) => n + 1)}>
        Atualizar eventos
      </button>
      {error ? (
        <p role="alert">{error}</p>
      ) : rows === null ? (
        <p role="status">Carregando eventos…</p>
      ) : rows.length ? (
        <table>
          <thead>
            <tr>
              <th>Data e hora</th>
              <th>Evento</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.createdAt + r.event + i}>
                <td>{new Date(r.createdAt).toLocaleString('pt-BR')}</td>
                <td>{auditLabels[r.event]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>Nenhum evento registrado.</p>
      )}
    </section>
  );
}
