const { PrismaClient } = require('@prisma/client');

// One shared client for the whole API
module.exports = new PrismaClient();