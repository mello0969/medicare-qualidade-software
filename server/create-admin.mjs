import { createUser, openDatabase } from './store.mjs';

const email = process.env.MEDICARE_ADMIN_EMAIL;
const password = process.env.MEDICARE_ADMIN_PASSWORD;
const name = process.env.MEDICARE_ADMIN_NAME;
if (!email || !password || !name) {
  console.error(
    'Defina MEDICARE_ADMIN_EMAIL, MEDICARE_ADMIN_PASSWORD e MEDICARE_ADMIN_NAME antes de criar o gestor.',
  );
  process.exitCode = 1;
} else {
  const db = openDatabase(process.env.MEDICARE_DB_PATH ?? 'data/medicare.sqlite');
  try {
    const user = await createUser(db, { name, email, password, role: 'manager', sectorId: null });
    console.log(`Gestor criado: ${user.email}. Nenhuma senha foi gravada em texto simples.`);
  } catch (error) {
    console.error(
      error.message === 'DUPLICATE_USER'
        ? 'Já existe uma conta com este e-mail.'
        : error.message === 'INVALID_USER'
          ? 'Dados inválidos. Use um nome de 2 a 80 caracteres, e-mail válido e senha de 12 a 128 caracteres.'
          : 'Não foi possível criar o gestor. Verifique a configuração do banco.',
    );
    process.exitCode = 1;
  } finally {
    db.close();
  }
}
