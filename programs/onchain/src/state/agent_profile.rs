use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct AgentProfile {
    /// Wallet that owns this profile
    pub owner: Pubkey,
    /// .skr display name (user-editable, not resolved yet)
    #[max_len(64)]
    pub seeker_id: String,
    /// Flag for advanced feature gating post-MVP
    pub genesis_token_holder: bool,
    /// Unix timestamp of initialization
    pub created_at: i64,
    /// PDA bump seed
    pub bump: u8,
}
