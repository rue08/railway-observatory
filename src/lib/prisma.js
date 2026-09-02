const { PrismaClient } = require("@prisma/client");

// Singleton — one client for the whole process, reused across requests/modules
// instead of instantiating a new one (and its own connection pool) per import.
const prisma = new PrismaClient();

module.exports = prisma;
