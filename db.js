// Conexión a la base de datos PostgreSQL.
// Todos los datos de conexión salen de variables de entorno (ver .env.example).
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Error inesperado en la conexión a la base de datos:', err);
});

module.exports = pool;
