import { PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";

const U64_MIN = 0n;
const U64_MAX = (1n << 64n) - 1n;

export function encodeProtocolCap(protocol: string, maxLamports: bigint): string {
  if (!protocol.trim()) {
    throw new Error("protocol must be non-empty");
  }

  if (typeof maxLamports !== "bigint") {
    throw new TypeError("maxLamports must be a bigint");
  }

  if (maxLamports < U64_MIN || maxLamports > U64_MAX) {
    throw new RangeError(
      "maxLamports must be between 0 and 18446744073709551615 inclusive"
    );
  }

  return `${protocol}:${maxLamports.toString(10)}`;
}

export function getAgentProfilePDA(
  owner: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("profile"), owner.toBuffer()],
    programId
  );
}

export function getPolicyVaultPDA(
  owner: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("policy"), owner.toBuffer()],
    programId
  );
}

export function getExecutionReceiptPDA(
  owner: PublicKey,
  receiptId: bigint,
  programId: PublicKey
): [PublicKey, number] {
  if (typeof receiptId !== "bigint") {
    throw new TypeError("receiptId must be a bigint");
  }

  if (receiptId < U64_MIN || receiptId > U64_MAX) {
    throw new RangeError(
      "receiptId must be between 0 and 18446744073709551615 inclusive"
    );
  }

  const receiptIdBuffer = Buffer.alloc(8);
  receiptIdBuffer.writeBigUInt64LE(receiptId);

  return PublicKey.findProgramAddressSync(
    [Buffer.from("receipt"), owner.toBuffer(), receiptIdBuffer],
    programId
  );
}
