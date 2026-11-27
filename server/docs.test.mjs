import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import SwaggerParser from '@apidevtools/swagger-parser';
import { openapi } from './openapi.mjs';

test('OpenAPI é válido e documenta todas as rotas HTTP implementadas', async () => {
  const spec = openapi;
  await SwaggerParser.validate(structuredClone(spec));
  const source = readFileSync(new URL('./app.mjs', import.meta.url), 'utf8');
  const routes = [
    ...source.matchAll(/method === '(GET|POST|PUT|PATCH)' && path === '([^']+)'/g),
  ].map((match) => `${match[1].toLowerCase()} ${match[2]}`);
  routes.push('patch /api/admin/contacts/{id}');
  const documented = Object.entries(spec.paths).flatMap(([path, operations]) =>
    Object.keys(operations).map((method) => `${method} ${path}`),
  );
  assert.deepEqual(documented.sort(), routes.sort());
  assert.deepEqual(
    spec.servers.map((server) => server.url),
    ['/'],
  );
  assert.equal(spec.components.securitySchemes.session.name, 'medicare_session');
  assert.equal(spec.paths['/api/admin/contacts'].get.security[0].session.length, 0);
});

test('Contrato preserva metadados opcionais e não publica contato no resumo da TV', () => {
  const submission = openapi.components.schemas.Submission;
  for (const field of ['feedback', 'origin', 'questionnaire']) {
    assert.ok(submission.properties[field]);
    assert.ok(!submission.required.includes(field));
  }
  assert.equal(submission.properties.nps.minimum, 0);
  assert.equal(submission.properties.nps.maximum, 10);
  const wall = openapi.components.schemas.Wall;
  for (const field of ['name', 'phone', 'email', 'message', 'comment', 'contactRequest']) {
    assert.ok(!Object.hasOwn(wall.properties, field));
  }
});
