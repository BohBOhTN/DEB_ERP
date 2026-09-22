import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";
import { AccessService } from "../modules/access/access.service.js";
import { PrismaAuthRepository } from "../modules/auth/auth.repository.js";
import { AuthService } from "../modules/auth/auth.service.js";

const [email, displayName, password] = process.argv.slice(2);

if (!email || !displayName || !password) {
  console.error(
    "Usage: npm run users:create --workspace backend -- <email> <displayName> <password>",
  );
  process.exit(1);
}

const prisma = new PrismaClient();
const accessService = new AccessService(prisma);
const authService = new AuthService(
  new PrismaAuthRepository(prisma),
  env.SESSION_TTL_MINUTES,
);

try {
  await accessService.bootstrapSystemAccess();

  const user = await authService.createUser({
    email,
    displayName,
    password,
  });

  await accessService.bootstrapSystemAccess();

  console.log(`Created user ${user.email}`);
} finally {
  await prisma.$disconnect();
}
