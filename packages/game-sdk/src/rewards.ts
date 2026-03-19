import { z } from "zod";

export const rewardOfferSchema = z.object({
  airline_code: z.string().min(2),
  description: z.string().min(1),
  fulfillment_type: z.enum(["voucher", "perk", "physical"]),
  inventory_remaining: z.number().int().nonnegative().nullable(),
  inventory_status: z.enum(["available", "limited", "sold_out"]),
  points_cost: z.number().int().positive(),
  redemption_limit_per_session: z.number().int().positive().nullable(),
  reward_id: z.string().min(1),
  terms: z.string().min(1),
  title: z.string().min(1)
});

export const rewardsCatalogResponseSchema = z.object({
  airline_code: z.string().min(2),
  locale: z.string().min(2),
  offers: z.array(rewardOfferSchema),
  trace_id: z.string().min(1)
});

export const rewardRedemptionRecordSchema = z.object({
  airline_code: z.string().min(2),
  fulfillment_code: z.string().min(1).nullable(),
  fulfillment_instructions: z.string().min(1),
  fulfillment_type: z.enum(["voucher", "perk", "physical"]),
  passenger_id: z.string().min(1),
  points_cost: z.number().int().positive(),
  redeemed_at: z.string().min(1),
  redemption_id: z.string().min(1),
  reward_id: z.string().min(1),
  session_id: z.string().min(1),
  status: z.enum(["confirmed", "ready_to_use", "fulfilled"]),
  title: z.string().min(1)
});

export const passengerRewardsWalletSchema = z.object({
  airline_code: z.string().min(2),
  available_points: z.number().int().nonnegative(),
  earned_points: z.number().int().nonnegative(),
  passenger_id: z.string().min(1),
  redeemed_points: z.number().int().nonnegative(),
  redemption_history: z.array(rewardRedemptionRecordSchema),
  updated_at: z.string().min(1)
});

export const rewardRedeemRequestSchema = z.object({
  airline_code: z.string().min(2),
  locale: z.string().min(2).default("en-US"),
  passenger_id: z.string().min(1),
  redemption_id: z.string().min(1),
  reward_id: z.string().min(1),
  session_id: z.string().min(1)
});

export const rewardRedeemResponseSchema = z.object({
  redemption: rewardRedemptionRecordSchema,
  trace_id: z.string().min(1),
  wallet: passengerRewardsWalletSchema
});

export type RewardOffer = z.infer<typeof rewardOfferSchema>;
export type RewardsCatalogResponse = z.infer<typeof rewardsCatalogResponseSchema>;
export type RewardRedemptionRecord = z.infer<typeof rewardRedemptionRecordSchema>;
export type PassengerRewardsWallet = z.infer<typeof passengerRewardsWalletSchema>;
export type RewardRedeemRequest = z.infer<typeof rewardRedeemRequestSchema>;
export type RewardRedeemResponse = z.infer<typeof rewardRedeemResponseSchema>;
