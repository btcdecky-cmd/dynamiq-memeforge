//! On-chain campaign registry for DYNamiQ MemeForge.
//!
//! This program is source-ready and is **not deployed**. The running app records
//! a devnet proof with the SPL Memo program (`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`)
//! and verifies that signature against devnet RPC. Replace `declare_id!` after
//! `anchor keys list` and deploy to devnet before pointing the app at it.
//!
//! The account stores identifiers and a creative hash. Media stays off-chain.

use anchor_lang::prelude::*;

declare_id!("7GzvmTJXsQjbqbjgtFma9dFAxQUmhtAyfgy8mWsmxVEp");

const MAX_ID: usize = 40;

#[program]
pub mod memeforge_registry {
    use super::*;

    pub fn register(
        ctx: Context<Register>,
        campaign_id: String,
        mint: Pubkey,
        creative_hash: [u8; 32],
    ) -> Result<()> {
        require!(campaign_id.len() > 0 && campaign_id.len() <= MAX_ID, RegistryError::BadId);
        let record = &mut ctx.accounts.record;
        record.advertiser = ctx.accounts.advertiser.key();
        record.campaign_id = campaign_id;
        record.mint = mint;
        record.creative_hash = creative_hash;
        record.status = CampaignStatus::Active as u8;
        record.bump = ctx.bumps.record;
        Ok(())
    }

    pub fn set_status(ctx: Context<Update>, status: u8) -> Result<()> {
        require!(status <= CampaignStatus::Closed as u8, RegistryError::BadStatus);
        ctx.accounts.record.status = status;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(campaign_id: String)]
pub struct Register<'info> {
    #[account(mut)]
    pub advertiser: Signer<'info>,
    #[account(
        init,
        payer = advertiser,
        space = 8 + CampaignRecord::SPACE,
        seeds = [b"campaign", advertiser.key().as_ref(), campaign_id.as_bytes()],
        bump
    )]
    pub record: Account<'info, CampaignRecord>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Update<'info> {
    pub advertiser: Signer<'info>,
    #[account(mut, has_one = advertiser)]
    pub record: Account<'info, CampaignRecord>,
}

#[account]
pub struct CampaignRecord {
    pub advertiser: Pubkey,
    pub campaign_id: String,
    pub mint: Pubkey,
    pub creative_hash: [u8; 32],
    pub status: u8,
    pub bump: u8,
}

impl CampaignRecord {
    pub const SPACE: usize = 32 + 4 + MAX_ID + 32 + 32 + 1 + 1;
}

#[repr(u8)]
pub enum CampaignStatus {
    Draft = 0,
    Active = 1,
    Paused = 2,
    Closed = 3,
}

#[error_code]
pub enum RegistryError {
    #[msg("campaign id is empty or longer than 40 bytes")]
    BadId,
    #[msg("unknown status")]
    BadStatus,
}
