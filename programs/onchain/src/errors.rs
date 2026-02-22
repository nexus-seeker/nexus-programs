use anchor_lang::prelude::*;

#[error_code]
pub enum NexusError {
    #[msg("Daily spend limit would be exceeded")]
    DailyLimitExceeded,
    #[msg("Protocol is not on the allowed list")]
    ProtocolNotAllowed,
    #[msg("Policy is currently inactive")]
    PolicyInactive,
    #[msg("Amount overflow")]
    Overflow,
    #[msg("Unauthorized — signer is not the policy owner")]
    Unauthorized,
}
