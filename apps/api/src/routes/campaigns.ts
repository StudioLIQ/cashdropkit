/**
 * Campaign API routes
 *
 * Endpoints for airdrop and vesting campaign CRUD.
 * All routes require authentication and enforce tenant isolation.
 */

import { and, desc, eq } from 'drizzle-orm';

import { getDb } from '../db/index.js';
import { airdropCampaigns, vestingCampaigns } from '../db/schema.js';

import type { RouteContext } from './router.js';
import { json, parsePagination } from './router.js';

const SUPPORTED_NETWORK = 'testnet' as const;

function isSupportedNetwork(network: unknown): network is typeof SUPPORTED_NETWORK {
  return network === SUPPORTED_NETWORK;
}

// ============================================================================
// Airdrop Campaigns
// ============================================================================

/** GET /api/v1/campaigns — List airdrop campaigns for current user */
export async function listCampaigns(ctx: RouteContext): Promise<void> {
  const db = getDb();
  const { page, pageSize } = parsePagination(ctx.query);
  const network = ctx.query.get('network');

  if (network && !isSupportedNetwork(network)) {
    json(ctx.res, 400, {
      success: false,
      error: { code: 'UNSUPPORTED_NETWORK', message: 'Only testnet is currently supported' },
    });
    return;
  }

  const conditions = [
    eq(airdropCampaigns.userId, ctx.user.userId),
    eq(airdropCampaigns.network, SUPPORTED_NETWORK),
  ];

  const rows = await db
    .select()
    .from(airdropCampaigns)
    .where(and(...conditions))
    .orderBy(desc(airdropCampaigns.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  json(ctx.res, 200, {
    success: true,
    data: {
      items: rows,
      page,
      pageSize,
      hasMore: rows.length === pageSize,
    },
  });
}

/** GET /api/v1/campaigns/:id — Get single campaign */
export async function getCampaign(ctx: RouteContext): Promise<void> {
  const db = getDb();
  const rows = await db
    .select()
    .from(airdropCampaigns)
    .where(and(eq(airdropCampaigns.id, ctx.params.id), eq(airdropCampaigns.userId, ctx.user.userId)));

  if (rows.length === 0) {
    json(ctx.res, 404, { success: false, error: { code: 'NOT_FOUND', message: 'Campaign not found' } });
    return;
  }

  json(ctx.res, 200, { success: true, data: rows[0] });
}

/** POST /api/v1/campaigns — Create campaign */
export async function createCampaign(ctx: RouteContext): Promise<void> {
  const db = getDb();
  const body = ctx.body as Record<string, unknown>;

  if (!body || !body.id || !body.name || !body.network || !body.tokenId) {
    json(ctx.res, 400, {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Required fields: id, name, network, tokenId' },
    });
    return;
  }

  if (!isSupportedNetwork(body.network)) {
    json(ctx.res, 400, {
      success: false,
      error: { code: 'UNSUPPORTED_NETWORK', message: 'Only testnet is currently supported' },
    });
    return;
  }

  await db.insert(airdropCampaigns).values({
    id: body.id as string,
    userId: ctx.user.userId,
    name: body.name as string,
    network: SUPPORTED_NETWORK,
    tokenId: body.tokenId as string,
    tokenSymbol: (body.tokenSymbol as string) || null,
    tokenName: (body.tokenName as string) || null,
    tokenDecimals: (body.tokenDecimals as number) || null,
    mode: (body.mode as 'FT' | 'NFT') || 'FT',
    amountUnit: (body.amountUnit as 'base' | 'display') || 'base',
    recipients: (body.recipients as unknown[]) || [],
  });

  json(ctx.res, 201, { success: true, data: { id: body.id } });
}

/** PATCH /api/v1/campaigns/:id — Update campaign */
export async function updateCampaign(ctx: RouteContext): Promise<void> {
  const db = getDb();
  const body = ctx.body as Record<string, unknown>;

  // Verify ownership
  const existing = await db
    .select({ id: airdropCampaigns.id })
    .from(airdropCampaigns)
    .where(and(eq(airdropCampaigns.id, ctx.params.id), eq(airdropCampaigns.userId, ctx.user.userId)));

  if (existing.length === 0) {
    json(ctx.res, 404, { success: false, error: { code: 'NOT_FOUND', message: 'Campaign not found' } });
    return;
  }

  // Build update set (only allowed fields)
  const updateSet: Record<string, unknown> = { updatedAt: new Date() };
  const allowedFields = [
    'name',
    'recipients',
    'feeRateSatPerByte',
    'dustSatPerOutput',
    'maxOutputsPerTx',
    'maxInputsPerTx',
    'allowMergeDuplicates',
    'sourceWalletId',
    'plan',
    'execution',
    'tags',
    'notes',
  ];

  for (const field of allowedFields) {
    if (field in (body || {})) {
      // Map camelCase to snake_case for Drizzle
      const snakeField = field.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
      updateSet[snakeField] = (body as Record<string, unknown>)[field];
    }
  }

  await db
    .update(airdropCampaigns)
    .set(updateSet)
    .where(eq(airdropCampaigns.id, ctx.params.id));

  json(ctx.res, 200, { success: true });
}

/** DELETE /api/v1/campaigns/:id — Delete campaign */
export async function deleteCampaign(ctx: RouteContext): Promise<void> {
  const db = getDb();

  const result = await db
    .delete(airdropCampaigns)
    .where(and(eq(airdropCampaigns.id, ctx.params.id), eq(airdropCampaigns.userId, ctx.user.userId)));

  if (result.rowCount === 0) {
    json(ctx.res, 404, { success: false, error: { code: 'NOT_FOUND', message: 'Campaign not found' } });
    return;
  }

  json(ctx.res, 200, { success: true });
}

// ============================================================================
// Vesting Campaigns
// ============================================================================

/** GET /api/v1/vesting — List vesting campaigns */
export async function listVestingCampaigns(ctx: RouteContext): Promise<void> {
  const db = getDb();
  const { page, pageSize } = parsePagination(ctx.query);

  const rows = await db
    .select()
    .from(vestingCampaigns)
    .where(
      and(
        eq(vestingCampaigns.userId, ctx.user.userId),
        eq(vestingCampaigns.network, SUPPORTED_NETWORK),
      ),
    )
    .orderBy(desc(vestingCampaigns.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  json(ctx.res, 200, {
    success: true,
    data: { items: rows, page, pageSize, hasMore: rows.length === pageSize },
  });
}

/** GET /api/v1/vesting/:id — Get single vesting campaign */
export async function getVestingCampaign(ctx: RouteContext): Promise<void> {
  const db = getDb();
  const rows = await db
    .select()
    .from(vestingCampaigns)
    .where(and(eq(vestingCampaigns.id, ctx.params.id), eq(vestingCampaigns.userId, ctx.user.userId)));

  if (rows.length === 0) {
    json(ctx.res, 404, { success: false, error: { code: 'NOT_FOUND', message: 'Vesting campaign not found' } });
    return;
  }

  json(ctx.res, 200, { success: true, data: rows[0] });
}

/** POST /api/v1/vesting — Create vesting campaign */
export async function createVestingCampaign(ctx: RouteContext): Promise<void> {
  const db = getDb();
  const body = ctx.body as Record<string, unknown>;

  if (!body || !body.id || !body.name || !body.network || !body.tokenId || !body.template || !body.schedule) {
    json(ctx.res, 400, {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Required fields: id, name, network, tokenId, template, schedule',
      },
    });
    return;
  }

  if (!isSupportedNetwork(body.network)) {
    json(ctx.res, 400, {
      success: false,
      error: { code: 'UNSUPPORTED_NETWORK', message: 'Only testnet is currently supported' },
    });
    return;
  }

  await db.insert(vestingCampaigns).values({
    id: body.id as string,
    userId: ctx.user.userId,
    name: body.name as string,
    network: SUPPORTED_NETWORK,
    tokenId: body.tokenId as string,
    template: body.template as 'CLIFF_ONLY' | 'MONTHLY_TRANCHES' | 'CUSTOM_TRANCHES',
    schedule: body.schedule as Record<string, unknown>,
    beneficiaries: (body.beneficiaries as unknown[]) || [],
  });

  json(ctx.res, 201, { success: true, data: { id: body.id } });
}
