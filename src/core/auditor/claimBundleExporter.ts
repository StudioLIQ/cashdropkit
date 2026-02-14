/**
 * Claim Bundle Exporter
 *
 * Exports a ClaimBundle from a completed VestingCampaign.
 * The bundle contains all information needed by beneficiaries to unlock
 * their vested tokens without needing an indexer.
 */
import type { VestingCampaign } from '@/core/db/types';
import type { ClaimBundle, ClaimTranche } from '@/core/tx/unlockTxBuilder';

// ============================================================================
// Export Functions
// ============================================================================

/**
 * Build a ClaimBundle from a VestingCampaign.
 * Only includes tranches that have been successfully created (have outpoints).
 */
export function buildClaimBundle(campaign: VestingCampaign): ClaimBundle {
  const tranches: ClaimTranche[] = [];

  for (const beneficiary of campaign.beneficiaries) {
    for (const tranche of beneficiary.tranches) {
      // Only include tranches with outpoints (created on-chain)
      if (
        !tranche.lockbox.outpoint ||
        !tranche.lockbox.redeemScriptHex ||
        !tranche.lockbox.lockAddress
      ) {
        continue;
      }

      tranches.push({
        trancheId: tranche.id,
        beneficiaryAddress: beneficiary.address,
        unlockTime: tranche.unlockTime,
        amountBase: tranche.amountBase,
        tokenCategory: campaign.token.tokenId,
        lockbox: {
          lockAddress: tranche.lockbox.lockAddress,
          redeemScriptHex: tranche.lockbox.redeemScriptHex,
          outpoint: tranche.lockbox.outpoint,
          satoshis: campaign.settings.dustSatPerOutput,
        },
      });
    }
  }

  return {
    version: 1,
    campaignId: campaign.id,
    campaignName: campaign.name,
    network: campaign.network,
    token: {
      tokenId: campaign.token.tokenId,
      symbol: campaign.token.symbol,
      decimals: campaign.token.decimals,
    },
    tranches,
    exportedAt: Date.now(),
  };
}

/**
 * Export claim bundle as a downloadable JSON file.
 */
export function exportClaimBundle(campaign: VestingCampaign): {
  content: string;
  filename: string;
  mimeType: string;
} {
  const bundle = buildClaimBundle(campaign);

  const safeName = campaign.name.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 50);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  return {
    content: JSON.stringify(bundle, null, 2),
    filename: `${safeName}_claim_bundle_${timestamp}.json`,
    mimeType: 'application/json',
  };
}

/**
 * Trigger browser download for a claim bundle export.
 */
export function downloadClaimBundle(campaign: VestingCampaign): void {
  const result = exportClaimBundle(campaign);
  const blob = new Blob([result.content], { type: result.mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
