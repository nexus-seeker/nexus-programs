use anchor_lang::prelude::*;

declare_id!("DxV7vXf919YddC74X726PpsrPpHLXNZtdBsk6Lweh3HJ");

#[program]
pub mod onchain {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
