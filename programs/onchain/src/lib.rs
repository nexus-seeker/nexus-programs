use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("DxV7vXf919YddC74X726PpsrPpHLXNZtdBsk6Lweh3HJ");

#[program]
pub mod onchain {
    use super::*;

    /// One-time initialization. Creates AgentProfile PDA.
    pub fn create_profile(ctx: Context<CreateProfile>) -> Result<()> {
        instructions::create_profile::handler(ctx)
    }

    /// Updates policy settings. Creates PolicyVault if it doesn't exist.
    pub fn update_policy(
        ctx: Context<UpdatePolicy>,
        daily_max_lamports: u64,
        allowed_protocols: Vec<String>,
        is_active: bool,
    ) -> Result<()> {
        instructions::update_policy::handler(ctx, daily_max_lamports, allowed_protocols, is_active)
    }

    /// The critical instruction prepended to every agent-executed transaction.
    /// If it reverts, the entire VersionedTransaction reverts.
    pub fn check_and_record(
        ctx: Context<CheckAndRecord>,
        amount: u64,
        protocol: String,
    ) -> Result<()> {
        instructions::check_and_record::handler(ctx, amount, protocol)
    }

    /// Closes an ExecutionReceipt PDA and refunds rent to the owner.
    pub fn close_receipt(ctx: Context<CloseReceipt>) -> Result<()> {
        instructions::close_receipt::handler(ctx)
    }
}
