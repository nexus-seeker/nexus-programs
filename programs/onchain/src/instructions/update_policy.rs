use anchor_lang::prelude::*;
use crate::state::PolicyVault;

#[derive(Accounts)]
pub struct UpdatePolicy<'info> {
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + PolicyVault::INIT_SPACE,
        seeds = [b"policy", owner.key().as_ref()],
        bump,
    )]
    pub policy_vault: Account<'info, PolicyVault>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<UpdatePolicy>,
    daily_max_lamports: u64,
    allowed_protocols: Vec<String>,
    is_active: bool,
) -> Result<()> {
    let vault = &mut ctx.accounts.policy_vault;

    // If this is a fresh init (owner is default/unset), set initial values
    if vault.owner == Pubkey::default() {
        vault.owner = ctx.accounts.owner.key();
        vault.current_spend = 0;
        vault.last_reset_ts = Clock::get()?.unix_timestamp;
        vault.next_receipt_id = 0;
        vault.bump = ctx.bumps.policy_vault;
    }

    vault.daily_max_lamports = daily_max_lamports;
    vault.allowed_protocols = allowed_protocols;
    vault.is_active = is_active;

    Ok(())
}
