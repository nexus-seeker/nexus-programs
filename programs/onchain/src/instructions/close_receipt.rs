use crate::errors::NexusError;
use crate::state::AgentProfile;
use crate::state::ExecutionReceipt;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct CloseReceipt<'info> {
    #[account(
        mut,
        close = owner,
        has_one = agent_profile,
    )]
    pub execution_receipt: Account<'info, ExecutionReceipt>,

    #[account(
        seeds = [b"profile", owner.key().as_ref()],
        bump = agent_profile.bump,
        constraint = agent_profile.owner == owner.key() @ NexusError::Unauthorized,
    )]
    pub agent_profile: Account<'info, AgentProfile>,

    #[account(mut)]
    pub owner: Signer<'info>,
}

pub fn handler(_ctx: Context<CloseReceipt>) -> Result<()> {
    // Account is closed via the `close = owner` constraint.
    // Rent is automatically refunded to the owner.
    Ok(())
}
