import bcrypt from "bcryptjs";

const saltRounds = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  if (!storedHash.startsWith("$2a$") && !storedHash.startsWith("$2b$")) {
    return false;
  }

  return bcrypt.compare(password, storedHash);
}
