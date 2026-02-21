use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct PolicyVault {
    /// Must match signer on check_and_record
    pub owner: Pubkey,
    /// Max total spend in a 24h window (lamports)
    pub daily_max_lamports: u64,
    /// Accumulated spend since last_reset_ts
    pub current_spend: u64,
    /// Unix timestamp of last daily reset
    pub last_reset_ts: i64,
    /// e.g. ["jupiter", "spl_transfer"] — MVP has both
    #[max_len(5, 32)]
    pub allowed_protocols: Vec<String>,
    /// Monotonic counter used in receipt PDA seeds
    pub next_receipt_id: u64,
    /// Kill switch — policy can be paused
    pub is_active: bool,
    /// PDA bump seed
    pub bump: u8,
}
