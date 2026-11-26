// Only the event type and timestamp are visible in the management feed.
export function auditQuery(postgres = false) {
  const schema = postgres ? 'fhdod.' : '';
  return `SELECT created_at AS "createdAt", event FROM ${schema}account_audit
    UNION ALL SELECT created_at, 'question_changed' FROM ${schema}question_audit
    UNION ALL SELECT created_at, 'schedule_changed' FROM ${schema}schedule_audit
    UNION ALL SELECT created_at, 'contact_updated' FROM ${schema}contact_status_audit
    ORDER BY "createdAt" DESC, event LIMIT 100`;
}
