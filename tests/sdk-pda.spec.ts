import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  getAgentProfilePDA,
  getExecutionReceiptPDA,
  getPolicyVaultPDA,
} from "../packages/sdk";

describe("sdk pda helpers", () => {
  const owner = Keypair.generate().publicKey;
  const programId = new PublicKey("DxV7vXf919YddC74X726PpsrPpHLXNZtdBsk6Lweh3HJ");

  it("derives agent profile PDA", () => {
    const expected = PublicKey.findProgramAddressSync(
      [Buffer.from("profile"), owner.toBuffer()],
      programId
    );

    const actual = getAgentProfilePDA(owner, programId);

    expect(actual[0].toBase58()).to.equal(expected[0].toBase58());
    expect(actual[1]).to.equal(expected[1]);
  });

  it("derives policy vault PDA", () => {
    const expected = PublicKey.findProgramAddressSync(
      [Buffer.from("policy"), owner.toBuffer()],
      programId
    );

    const actual = getPolicyVaultPDA(owner, programId);

    expect(actual[0].toBase58()).to.equal(expected[0].toBase58());
    expect(actual[1]).to.equal(expected[1]);
  });

  it("derives execution receipt PDA with 8-byte little-endian receipt id", () => {
    const receiptId = 1_234_567_890n;
    const receiptIdLE = Buffer.alloc(8);
    receiptIdLE.writeBigUInt64LE(receiptId);

    const expected = PublicKey.findProgramAddressSync(
      [Buffer.from("receipt"), owner.toBuffer(), receiptIdLE],
      programId
    );

    const actual = getExecutionReceiptPDA(owner, receiptId, programId);

    const receiptIdBE = Buffer.alloc(8);
    receiptIdBE.writeBigUInt64BE(receiptId);
    const bigEndianDerived = PublicKey.findProgramAddressSync(
      [Buffer.from("receipt"), owner.toBuffer(), receiptIdBE],
      programId
    );

    expect(actual[0].toBase58()).to.equal(expected[0].toBase58());
    expect(actual[1]).to.equal(expected[1]);
    expect(actual[0].toBase58()).to.not.equal(bigEndianDerived[0].toBase58());
  });

  it("supports minimum receipt id of 0n", () => {
    const receiptId = 0n;
    const receiptIdLE = Buffer.alloc(8);
    receiptIdLE.writeBigUInt64LE(receiptId);

    const expected = PublicKey.findProgramAddressSync(
      [Buffer.from("receipt"), owner.toBuffer(), receiptIdLE],
      programId
    );

    const actual = getExecutionReceiptPDA(owner, receiptId, programId);

    expect(actual[0].toBase58()).to.equal(expected[0].toBase58());
    expect(actual[1]).to.equal(expected[1]);
  });

  it("supports maximum u64 receipt id", () => {
    const receiptId = (1n << 64n) - 1n;
    const receiptIdLE = Buffer.alloc(8);
    receiptIdLE.writeBigUInt64LE(receiptId);

    const expected = PublicKey.findProgramAddressSync(
      [Buffer.from("receipt"), owner.toBuffer(), receiptIdLE],
      programId
    );

    const actual = getExecutionReceiptPDA(owner, receiptId, programId);

    expect(actual[0].toBase58()).to.equal(expected[0].toBase58());
    expect(actual[1]).to.equal(expected[1]);
  });

  it("rejects negative bigint receipt id", () => {
    expect(() => getExecutionReceiptPDA(owner, -1n, programId)).to.throw(
      "receiptId must be between 0 and 18446744073709551615 inclusive"
    );
  });

  it("rejects receipt id larger than u64", () => {
    expect(() => getExecutionReceiptPDA(owner, 1n << 64n, programId)).to.throw(
      "receiptId must be between 0 and 18446744073709551615 inclusive"
    );
  });

  it("rejects non-bigint receipt id input", () => {
    expect(() => getExecutionReceiptPDA(owner, 1 as any, programId)).to.throw(
      "receiptId must be a bigint"
    );
  });
});
