use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum ReceiptStatus {
    Pending,
    Completed,
    Rejected,
}

#[account]
#[derive(InitSpace)]
pub struct ExecutionReceipt {
    /// Reference back to the agent profile
    pub agent_profile: Pubkey,
    /// Copied from AgentProfile at receipt creation time
    #[max_len(64)]
    pub seeker_id: String,
    /// SHA-256 of the original intent string
    pub intent_hash: [u8; 32],
    /// "jupiter" or "spl_transfer"
    #[max_len(32)]
    pub protocol: String,
    /// Amount processed (lamports)
    pub amount_lamports: u64,
    /// On-chain tx sig for Solscan link
    #[max_len(88)]
    pub tx_signature: String,
    /// Enum: Pending | Completed | Rejected
    pub status: ReceiptStatus,
    /// Unix timestamp
    pub timestamp: i64,
    /// PDA bump seed
    pub bump: u8,
}
