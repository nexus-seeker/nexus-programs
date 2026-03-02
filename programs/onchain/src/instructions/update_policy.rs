use crate::state::{PolicyVault, ProtocolCap};
use anchor_lang::prelude::*;

fn parse_protocol_specs(protocol_specs: Vec<String>) -> (Vec<String>, Vec<ProtocolCap>) {
    let mut allowed_protocols = Vec::with_capacity(protocol_specs.len());
    let mut protocol_caps = Vec::new();

    for raw_spec in protocol_specs {
        if let Some((protocol, cap_raw)) = raw_spec.split_once(':') {
            let protocol = protocol.trim().to_string();
            let cap_raw = cap_raw.trim();
            if !protocol.is_empty() {
                allowed_protocols.push(protocol.clone());
                if let Ok(max_lamports) = cap_raw.parse::<u64>() {
                    protocol_caps.push(ProtocolCap {
                        protocol,
                        max_lamports,
                        current_spend: 0,
                    });
                }
                continue;
            }
        }

        allowed_protocols.push(raw_spec);
    }

    (allowed_protocols, protocol_caps)
}

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
    protocol_specs: Vec<String>,
    is_active: bool,
) -> Result<()> {
    let vault = &mut ctx.accounts.policy_vault;
    let (allowed_protocols, protocol_caps) = parse_protocol_specs(protocol_specs);

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
    vault.protocol_caps = protocol_caps;
    vault.is_active = is_active;

    Ok(())
}
