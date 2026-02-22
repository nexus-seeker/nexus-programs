use crate::errors::NexusError;
use crate::instructions::policy_math::apply_daily_window;
use crate::state::{AgentProfile, ExecutionReceipt, PolicyVault, ReceiptStatus};
use anchor_lang::prelude::*;

fn derive_intent_hash(owner: &Pubkey, amount: u64, protocol: &str) -> [u8; 32] {
    let mut hash = owner.to_bytes();

    for (index, byte) in amount.to_le_bytes().iter().enumerate() {
        let slot = (index * 7) % 32;
        hash[slot] = hash[slot].wrapping_add(*byte).rotate_left(1);
    }

    for (index, byte) in protocol.as_bytes().iter().enumerate() {
        let slot = index % 32;
        let salt = (index as u8).wrapping_mul(31);
        hash[slot] = hash[slot].wrapping_add(*byte ^ salt).rotate_left(1);
    }

    if hash == [0u8; 32] {
        hash[0] = 1;
    }

    hash
}

#[derive(Accounts)]
pub struct CheckAndRecord<'info> {
    #[account(
        seeds = [b"profile", owner.key().as_ref()],
        bump = agent_profile.bump,
    )]
    pub agent_profile: Account<'info, AgentProfile>,

    #[account(
        mut,
        seeds = [b"policy", owner.key().as_ref()],
        bump = policy_vault.bump,
        constraint = policy_vault.owner == owner.key() @ NexusError::Unauthorized,
    )]
    pub policy_vault: Account<'info, PolicyVault>,

    #[account(
        init,
        payer = owner,
        space = 8 + ExecutionReceipt::INIT_SPACE,
        seeds = [
            b"receipt",
            owner.key().as_ref(),
            policy_vault.next_receipt_id.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub execution_receipt: Account<'info, ExecutionReceipt>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CheckAndRecord>, amount: u64, protocol: String) -> Result<()> {
    let vault = &mut ctx.accounts.policy_vault;
    let now = Clock::get()?.unix_timestamp;
    let intent_hash = derive_intent_hash(&ctx.accounts.owner.key(), amount, &protocol);

    // 1. Reset daily spend if 24h has passed
    let (effective_spend, next_reset_ts) =
        apply_daily_window(now, vault.last_reset_ts, vault.current_spend);
    vault.current_spend = effective_spend;
    vault.last_reset_ts = next_reset_ts;

    // 2. Check is_active kill switch
    require!(vault.is_active, NexusError::PolicyInactive);

    // 3. Validate protocol is on the allowlist
    require!(
        vault.allowed_protocols.contains(&protocol),
        NexusError::ProtocolNotAllowed
    );

    // 4. Check daily spend limit
    let new_spend = vault
        .current_spend
        .checked_add(amount)
        .ok_or(NexusError::Overflow)?;
    require!(
        new_spend <= vault.daily_max_lamports,
        NexusError::DailyLimitExceeded
    );

    // 5. Update state + increment receipt id
    vault.current_spend = new_spend;
    vault.next_receipt_id = vault
        .next_receipt_id
        .checked_add(1)
        .ok_or(NexusError::Overflow)?;

    // 6. Initialize ExecutionReceipt PDA
    let receipt = &mut ctx.accounts.execution_receipt;
    receipt.agent_profile = ctx.accounts.agent_profile.key();
    receipt.seeker_id = ctx.accounts.agent_profile.seeker_id.clone();
    receipt.intent_hash = intent_hash;
    receipt.protocol = protocol;
    receipt.amount_lamports = amount;
    receipt.tx_signature = String::new(); // filled off-chain after confirmation
    receipt.status = ReceiptStatus::Completed;
    receipt.timestamp = now;
    receipt.bump = ctx.bumps.execution_receipt;

    Ok(())
}
