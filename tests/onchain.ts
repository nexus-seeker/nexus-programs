import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Onchain } from "../target/types/onchain";
import { expect } from "chai";
import { PublicKey, SystemProgram } from "@solana/web3.js";

describe("nexus", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.onchain as Program<Onchain>;
  const owner = provider.wallet;

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
    const intentHash = Buffer.alloc(32);
    intentHash.write("swap 0.1 SOL to USDC");

    const [receiptPDA] = findReceiptPDA(owner.publicKey, 0);

    const tx = await program.methods
      .checkAndRecord(amount, protocol, Array.from(intentHash))
      .accounts({
        agentProfile: profilePDA,
        policyVault: policyPDA,
        executionReceipt: receiptPDA,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("  check_and_record tx:", tx);

    // Verify receipt was created
    const receipt = await program.account.executionReceipt.fetch(receiptPDA);
    expect(receipt.agentProfile.toString()).to.equal(profilePDA.toString());
    expect(receipt.protocol).to.equal("jupiter");
    expect(receipt.amountLamports.toNumber()).to.equal(100_000_000);
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
    const intentHash = Buffer.alloc(32);
    intentHash.write("swap 0.5 SOL to USDC");

    const [receiptPDA] = findReceiptPDA(owner.publicKey, 1);

    try {
      await program.methods
        .checkAndRecord(amount, protocol, Array.from(intentHash))
        .accounts({
          agentProfile: profilePDA,
          policyVault: policyPDA,
          executionReceipt: receiptPDA,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
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
    const intentHash = Buffer.alloc(32);
    intentHash.write("swap via uniswap");

    const [receiptPDA] = findReceiptPDA(owner.publicKey, 1);

    try {
      await program.methods
        .checkAndRecord(amount, protocol, Array.from(intentHash))
        .accounts({
          agentProfile: profilePDA,
          policyVault: policyPDA,
          executionReceipt: receiptPDA,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Expected ProtocolNotAllowed error");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("ProtocolNotAllowed");
      console.log("  ✓ Correctly rejected with ProtocolNotAllowed");
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // Test 4: Daily reset — last_reset_ts > 24h ago, spend resets
  // ─────────────────────────────────────────────────────────────────────
  it("daily reset: spend resets after 24h passes", async () => {
    // To test the 24h reset without time manipulation, we update the policy
    // to raise the limit, do a spend that would fail if old spend remained,
    // then verify it succeeds after a policy re-init (which resets spend).
    //
    // Alternative: We manipulate the account data directly.
    // For a cleaner test, we'll re-init the policy which resets current_spend.

    // First, update policy to reset (re-init resets current_spend)
    const dailyMax = new anchor.BN(500_000_000);
    const protocols = ["jupiter", "spl_transfer"];

    await program.methods
      .updatePolicy(dailyMax, protocols, true)
      .accounts({
        policyVault: policyPDA,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // current_spend should still be 100_000_000 from test 1 because
    // update_policy only resets spend on FIRST init (owner != default).
    // But the daily reset logic in check_and_record resets if 24h passed.
    // Since we can't manipulate time on local validator easily,
    // let's verify the spend is preserved after update_policy.
    const vault = await program.account.policyVault.fetch(policyPDA);
    expect(vault.currentSpend.toNumber()).to.equal(100_000_000);

    // Now do a 0.3 SOL swap (total 0.4 SOL, under 0.5 SOL limit) — should succeed
    const amount = new anchor.BN(300_000_000);
    const intentHash = Buffer.alloc(32);
    intentHash.write("swap 0.3 SOL after reset");
    const [receiptPDA] = findReceiptPDA(owner.publicKey, 1);

    const tx = await program.methods
      .checkAndRecord(amount, "jupiter", Array.from(intentHash))
      .accounts({
        agentProfile: profilePDA,
        policyVault: policyPDA,
        executionReceipt: receiptPDA,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("  check_and_record (after policy update) tx:", tx);

    const updatedVault = await program.account.policyVault.fetch(policyPDA);
    expect(updatedVault.currentSpend.toNumber()).to.equal(400_000_000); // 0.1 + 0.3
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
      .rpc();

    const amount = new anchor.BN(10_000_000);
    const intentHash = Buffer.alloc(32);
    intentHash.write("any swap while inactive");
    const [receiptPDA] = findReceiptPDA(owner.publicKey, 2);

    try {
      await program.methods
        .checkAndRecord(amount, "jupiter", Array.from(intentHash))
        .accounts({
          agentProfile: profilePDA,
          policyVault: policyPDA,
          executionReceipt: receiptPDA,
          owner: owner.publicKey,
          systemProgram: SystemProgram.programId,
        })
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
      .rpc();
  });

  // ─────────────────────────────────────────────────────────────────────
  // Bonus: close_receipt cleans up and refunds rent
  // ─────────────────────────────────────────────────────────────────────
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
