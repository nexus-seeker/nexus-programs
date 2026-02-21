use anchor_lang::prelude::*;
use crate::state::AgentProfile;

#[derive(Accounts)]
pub struct CreateProfile<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + AgentProfile::INIT_SPACE,
        seeds = [b"profile", owner.key().as_ref()],
        bump,
    )]
    pub agent_profile: Account<'info, AgentProfile>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CreateProfile>) -> Result<()> {
    let profile = &mut ctx.accounts.agent_profile;
    profile.owner = ctx.accounts.owner.key();
    profile.seeker_id = String::new();
    profile.genesis_token_holder = false;
    profile.created_at = Clock::get()?.unix_timestamp;
    profile.bump = ctx.bumps.agent_profile;
    Ok(())
}
