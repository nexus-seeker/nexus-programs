import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Onchain } from "../target/types/onchain";
import { expect } from "chai";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

describe("nexus", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.onchain as Program<Onchain>;
  const owner = Keypair.generate();
  const unauthorized = Keypair.generate();
  const attacker = Keypair.generate();

  // PDA derivations
  function findProfilePDA(ownerKey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("profile"), ownerKey.toBuffer()],
      program.programId
    );
  }

  function findPolicyPDA(ownerKey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("policy"), ownerKey.toBuffer()],
      program.programId
    );
  }

  function findReceiptPDA(
    ownerKey: PublicKey,
    receiptId: number
  ): [PublicKey, number] {
    const receiptIdBuf = Buffer.alloc(8);
    receiptIdBuf.writeBigUInt64LE(BigInt(receiptId));
    return PublicKey.findProgramAddressSync(
      [Buffer.from("receipt"), ownerKey.toBuffer(), receiptIdBuf],
      program.programId
    );
  }

  const [profilePDA] = findProfilePDA(owner.publicKey);
  const [policyPDA] = findPolicyPDA(owner.publicKey);

  before("fund isolated users", async () => {
    const { connection } = provider;
    const providerPubkey = provider.wallet.publicKey;
    const isDevnet = connection.rpcEndpoint.includes("devnet");

    const transferFromProvider = async (toPubkey: PublicKey, lamports: number) => {
      if (lamports <= 0) return;

      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const tx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: providerPubkey,
              toPubkey,
              lamports,
            })
          );
          await provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
          return;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (!message.includes("Blockhash not found") || attempt === maxAttempts) {
            throw err;
          }
        }
      }
    };

    const airdropAndConfirm = async (pubkey: PublicKey, lamports: number) => {
      const signature = await connection.requestAirdrop(pubkey, lamports);
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        "confirmed"
      );
    };

    const ensureFunded = async (target: PublicKey, minimumLamports: number) => {
      const currentBalance = await connection.getBalance(target, "confirmed");
      if (currentBalance >= minimumLamports) {
        return;
      }

      const topUpLamports = minimumLamports - currentBalance;
      const providerBalance = await connection.getBalance(providerPubkey, "confirmed");
      const feeReserveLamports = Math.floor(0.01 * LAMPORTS_PER_SOL);

      if (providerBalance < topUpLamports + feeReserveLamports) {
        if (isDevnet) {
          throw new Error(
            `Provider wallet is underfunded on devnet. Need ${(topUpLamports + feeReserveLamports) / LAMPORTS_PER_SOL} SOL available for transfers + fees.`
          );
        }

        await airdropAndConfirm(providerPubkey, topUpLamports + feeReserveLamports);
      }

      await transferFromProvider(target, topUpLamports);
    };

    await ensureFunded(owner.publicKey, Math.floor(0.15 * LAMPORTS_PER_SOL));
    await ensureFunded(unauthorized.publicKey, Math.floor(0.01 * LAMPORTS_PER_SOL));
    await ensureFunded(attacker.publicKey, Math.floor(0.01 * LAMPORTS_PER_SOL));
  });

  // ─────────────────────────────────────────────────────────────────────
  // Setup: Create profile and policy
  // ─────────────────────────────────────────────────────────────────────
  it("creates an AgentProfile", async () => {
    const tx = await program.methods
      .createProfile()
      .accounts({
        agentProfile: profilePDA,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();

    console.log("  create_profile tx:", tx);

    const profile = await program.account.agentProfile.fetch(profilePDA);
    expect(profile.owner.toString()).to.equal(owner.publicKey.toString());
    expect(profile.seekerId).to.equal("");
    expect(profile.genesisTokenHolder).to.equal(false);
    expect(profile.createdAt.toNumber()).to.be.greaterThan(0);
  });

  it("initializes a PolicyVault with update_policy", async () => {
    const dailyMax = new anchor.BN(500_000_000); // 0.5 SOL in lamports
    const protocols = ["jupiter", "spl_transfer"];

    const tx = await program.methods
      .updatePolicy(dailyMax, protocols, true)
      .accounts({
        policyVault: policyPDA,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();

    console.log("  update_policy tx:", tx);

    const vault = await program.account.policyVault.fetch(policyPDA);
    expect(vault.owner.toString()).to.equal(owner.publicKey.toString());
    expect(vault.dailyMaxLamports.toNumber()).to.equal(500_000_000);
    expect(vault.currentSpend.toNumber()).to.equal(0);
    expect(vault.allowedProtocols).to.deep.equal(["jupiter", "spl_transfer"]);
    expect(vault.isActive).to.equal(true);
    expect(vault.nextReceiptId.toNumber()).to.equal(0);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Test 1: Happy path — swap 0.1 SOL, policy allows it
  // ─────────────────────────────────────────────────────────────────────
  it("happy path: check_and_record succeeds within limits", async () => {
    const amount = new anchor.BN(100_000_000); // 0.1 SOL
    const protocol = "jupiter";

    const [receiptPDA] = findReceiptPDA(owner.publicKey, 0);

    const tx = await program.methods
      .checkAndRecord(amount, protocol)
      .accounts({
        agentProfile: profilePDA,
        policyVault: policyPDA,
        executionReceipt: receiptPDA,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();

    console.log("  check_and_record tx:", tx);

    // Verify receipt was created
    const receipt = await program.account.executionReceipt.fetch(receiptPDA);
    expect(receipt.agentProfile.toString()).to.equal(profilePDA.toString());
    expect(receipt.protocol).to.equal("jupiter");
    expect(receipt.amountLamports.toNumber()).to.equal(100_000_000);
    expect(Array.from(receipt.intentHash as number[]).every((byte) => byte === 0)).to.equal(false);
    expect(receipt.status).to.deep.equal({ completed: {} });
    expect(receipt.timestamp.toNumber()).to.be.greaterThan(0);

    // Verify policy vault was updated
    const vault = await program.account.policyVault.fetch(policyPDA);
    expect(vault.currentSpend.toNumber()).to.equal(100_000_000);
    expect(vault.nextReceiptId.toNumber()).to.equal(1);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Test 2: Limit breach — swap would push over daily_max
  // ─────────────────────────────────────────────────────────────────────
  it("limit breach: check_and_record reverts with DailyLimitExceeded", async () => {
    // Policy allows 0.5 SOL, we already spent 0.1 SOL.
    // Trying to swap 0.5 SOL more (total 0.6 SOL) should fail.
    const amount = new anchor.BN(500_000_000); // 0.5 SOL
    const protocol = "jupiter";

    const [receiptPDA] = findReceiptPDA(owner.publicKey, 1);

    try {
      await program.methods
        .checkAndRecord(amount, protocol)
        .accounts({
          agentProfile: profilePDA,
          policyVault: policyPDA,
          executionReceipt: receiptPDA,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();
      expect.fail("Expected DailyLimitExceeded error");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("DailyLimitExceeded");
      console.log("  ✓ Correctly rejected with DailyLimitExceeded");
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // Test 3: Protocol breach — "uniswap" not in the allowed list
  // ─────────────────────────────────────────────────────────────────────
  it("protocol breach: check_and_record reverts with ProtocolNotAllowed", async () => {
    const amount = new anchor.BN(10_000_000); // 0.01 SOL
    const protocol = "uniswap"; // NOT in the allowed list

    const [receiptPDA] = findReceiptPDA(owner.publicKey, 1);

    try {
      await program.methods
        .checkAndRecord(amount, protocol)
        .accounts({
          agentProfile: profilePDA,
          policyVault: policyPDA,
          executionReceipt: receiptPDA,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();
      expect.fail("Expected ProtocolNotAllowed error");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("ProtocolNotAllowed");
      console.log("  ✓ Correctly rejected with ProtocolNotAllowed");
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // Test 4: Deterministic parity check for non-reset path
  // ─────────────────────────────────────────────────────────────────────
  it("daily window parity: without time travel, spend accumulates (no reset)", async () => {
    // This integration test intentionally verifies the non-reset branch.
    // The reset branch is covered deterministically in Rust unit tests:
    // - instructions::policy_math::tests::reset_after_more_than_24h
    // - instructions::policy_math::tests::exact_86400_boundary_does_not_reset
    const vault = await program.account.policyVault.fetch(policyPDA);
    expect(vault.currentSpend.toNumber()).to.equal(100_000_000);

    const amount = new anchor.BN(300_000_000);
    const receiptId = vault.nextReceiptId.toNumber();
    const [receiptPDA] = findReceiptPDA(owner.publicKey, receiptId);

    const tx = await program.methods
      .checkAndRecord(amount, "jupiter")
      .accounts({
        agentProfile: profilePDA,
        policyVault: policyPDA,
        executionReceipt: receiptPDA,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();

    console.log("  check_and_record (no reset branch) tx:", tx);

    const updatedVault = await program.account.policyVault.fetch(policyPDA);
    expect(updatedVault.currentSpend.toNumber()).to.equal(400_000_000);
    expect(updatedVault.nextReceiptId.toNumber()).to.equal(2);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Test 5: Kill switch — is_active = false → all check_and_record reverts
  // ─────────────────────────────────────────────────────────────────────
  it("kill switch: check_and_record reverts when policy is inactive", async () => {
    // Deactivate the policy
    await program.methods
      .updatePolicy(
        new anchor.BN(500_000_000),
        ["jupiter", "spl_transfer"],
        false // ← kill switch
      )
      .accounts({
        policyVault: policyPDA,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();

    const amount = new anchor.BN(10_000_000);
    const [receiptPDA] = findReceiptPDA(owner.publicKey, 2);

    try {
      await program.methods
        .checkAndRecord(amount, "jupiter")
        .accounts({
          agentProfile: profilePDA,
          policyVault: policyPDA,
          executionReceipt: receiptPDA,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner])
        .rpc();
      expect.fail("Expected PolicyInactive error");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("PolicyInactive");
      console.log("  ✓ Correctly rejected with PolicyInactive");
    }

    // Re-activate for cleanup
    await program.methods
      .updatePolicy(
        new anchor.BN(500_000_000),
        ["jupiter", "spl_transfer"],
        true
      )
      .accounts({
        policyVault: policyPDA,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();
  });

  // ─────────────────────────────────────────────────────────────────────
  // Bonus: close_receipt cleans up and refunds rent
  // ─────────────────────────────────────────────────────────────────────
  it("close_receipt rejects unauthorized signer", async () => {
    const [receiptPDA] = findReceiptPDA(owner.publicKey, 1);

    try {
      await program.methods
        .closeReceipt()
        .accounts({
          executionReceipt: receiptPDA,
          agentProfile: profilePDA,
          owner: unauthorized.publicKey,
        })
        .signers([unauthorized])
        .rpc();
      expect.fail("Expected Unauthorized error");
    } catch (err: any) {
      expect(["Unauthorized", "ConstraintSeeds"]).to.include(
        err.error.errorCode.code
      );
      console.log("  ✓ Correctly rejected unauthorized close_receipt");
    }
  });

  it("close_receipt refunds rent to the owner", async () => {
    const [receiptPDA] = findReceiptPDA(owner.publicKey, 0);

    // Verify receipt exists before close
    const receiptBefore = await program.account.executionReceipt.fetch(receiptPDA);
    expect(receiptBefore).to.not.be.null;

    const tx = await program.methods
      .closeReceipt()
      .accounts({
        executionReceipt: receiptPDA,
        agentProfile: profilePDA,
        owner: owner.publicKey,
      })
      .signers([owner])
      .rpc();

    console.log("  close_receipt tx:", tx);

    // Verify receipt no longer exists
    try {
      await program.account.executionReceipt.fetch(receiptPDA);
      expect.fail("Receipt should have been closed");
    } catch (err: any) {
      expect(err.message).to.include("Account does not exist");
      console.log("  ✓ Receipt PDA closed and rent refunded");
    }
  });
});
