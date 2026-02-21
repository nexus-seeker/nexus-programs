use anchor_lang::prelude::*;
use crate::state::ExecutionReceipt;

#[derive(Accounts)]
pub struct CloseReceipt<'info> {
    #[account(
        mut,
        close = owner,
        has_one = agent_profile,
    )]
    pub execution_receipt: Account<'info, ExecutionReceipt>,

    /// CHECK: Only used to verify has_one relationship
    pub agent_profile: UncheckedAccount<'info>,

    #[account(mut)]
    pub owner: Signer<'info>,
}

pub fn handler(_ctx: Context<CloseReceipt>) -> Result<()> {
    // Account is closed via the `close = owner` constraint.
    // Rent is automatically refunded to the owner.
    Ok(())
}
