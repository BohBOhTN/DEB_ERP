import type { Prisma } from "@prisma/client";

/// Human document numbers come from database sequences, so two concurrent
/// postings can never draw the same number. The sequences live in migration
/// SQL (see prisma/protected-objects.json); each helper formats one kind.
async function nextFromSequence(
  client: Prisma.TransactionClient,
  sequence: string,
  prefix: string,
): Promise<string> {
  const rows = await client.$queryRawUnsafe<Array<{ nextval: bigint }>>(
    `SELECT nextval('${sequence}')`,
  );
  const value = rows[0]?.nextval ?? BigInt(1);

  return `${prefix}-${value.toString().padStart(6, "0")}`;
}

export function nextSaleReference(client: Prisma.TransactionClient) {
  return nextFromSequence(client, "sale_reference_seq", "VT");
}

export function nextPurchaseReference(client: Prisma.TransactionClient) {
  return nextFromSequence(client, "purchase_reference_seq", "AC");
}
