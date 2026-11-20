// Imported first by tests of modules that load the database client: it only needs a URL to load, and the tests never connect.
process.env.DATABASE_URL ??= "postgres://test/test";
