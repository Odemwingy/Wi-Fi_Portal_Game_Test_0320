import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import {
  passengerRewardsWalletSchema,
  rewardRedeemRequestSchema,
  rewardRedeemResponseSchema,
  rewardRedemptionRecordSchema,
  type RewardOffer,
  rewardsCatalogResponseSchema,
  type PassengerRewardsWallet,
  type RewardRedeemRequest,
  type RewardRedeemResponse,
  type RewardsCatalogResponse
} from "@wifi-portal/game-sdk";
import {
  createStructuredLogger,
  startChildSpan,
  type TraceContext
} from "@wifi-portal/shared-observability";

import { buildEmptyPassengerPointsSummary, PointsRepository } from "./repositories/points.repository";
import {
  appendRedemption,
  buildEmptyPassengerRewardsLedger,
  RewardsRepository
} from "./repositories/rewards.repository";
import {
  appendRewardInventoryUsage,
  buildEmptyRewardInventoryRecord,
  RewardInventoryRepository
} from "./repositories/reward-inventory.repository";
import { buildRewardsCatalog, getRewardOfferDefinitions } from "./rewards.data";

const logger = createStructuredLogger("platform-api.rewards");

@Injectable()
export class RewardsService {
  constructor(
    @Inject(PointsRepository)
    private readonly pointsRepository: PointsRepository,
    @Inject(RewardsRepository)
    private readonly rewardsRepository: RewardsRepository,
    @Inject(RewardInventoryRepository)
    private readonly rewardInventoryRepository: RewardInventoryRepository
  ) {}

  async getCatalog(
    traceContext: TraceContext,
    airlineCode: string,
    locale = "en-US"
  ): Promise<RewardsCatalogResponse> {
    const span = startChildSpan(traceContext);
    const offers = await this.loadCatalogWithInventory(airlineCode, locale);
    const response = rewardsCatalogResponseSchema.parse({
      airline_code: airlineCode.toUpperCase(),
      locale,
      offers,
      trace_id: traceContext.trace_id
    });

    logger.info("rewards.catalog.loaded", span, {
      input_summary: JSON.stringify({
        airline_code: airlineCode,
        locale
      }),
      output_summary: `${response.offers.length} reward offers`
    });

    return response;
  }

  async getPassengerWallet(
    traceContext: TraceContext,
    passengerId: string,
    airlineCode: string
  ): Promise<PassengerRewardsWallet> {
    const span = startChildSpan(traceContext);
    const pointsSummary =
      (await this.pointsRepository.get(passengerId)) ??
      buildEmptyPassengerPointsSummary(passengerId);
    const ledger =
      (await this.rewardsRepository.get(passengerId)) ??
      buildEmptyPassengerRewardsLedger(passengerId, airlineCode.toUpperCase());

    const wallet = passengerRewardsWalletSchema.parse({
      airline_code: airlineCode.toUpperCase(),
      available_points: Math.max(
        0,
        pointsSummary.total_points - ledger.redeemed_points
      ),
      earned_points: pointsSummary.total_points,
      passenger_id: passengerId,
      redeemed_points: ledger.redeemed_points,
      redemption_history: ledger.redemption_history,
      updated_at:
        ledger.redemption_history[0]?.redeemed_at ?? pointsSummary.updated_at
    });

    logger.info("rewards.wallet.loaded", span, {
      input_summary: passengerId,
      output_summary: `${wallet.available_points} available points`,
      metadata: {
        redeemed_points: wallet.redeemed_points
      }
    });

    return wallet;
  }

  async redeem(
    traceContext: TraceContext,
    payload: unknown
  ): Promise<RewardRedeemResponse> {
    const span = startChildSpan(traceContext);
    const parsedPayload = this.parseRedeemPayload(payload, span);
    const airlineCode = parsedPayload.airline_code.toUpperCase();
    const offer = getRewardOfferDefinitions(airlineCode, parsedPayload.locale).find(
      (entry) => entry.reward_id === parsedPayload.reward_id
    );

    if (!offer) {
      throw new NotFoundException({
        message: "Reward offer not found",
        reward_id: parsedPayload.reward_id
      });
    }
    const inventoryRecord =
      (await this.rewardInventoryRepository.get(
        airlineCode,
        parsedPayload.reward_id
      )) ?? buildEmptyRewardInventoryRecord(airlineCode, parsedPayload.reward_id);
    const inventoryRemaining =
      offer.inventory_total === null
        ? null
        : Math.max(0, offer.inventory_total - inventoryRecord.redeemed_count);

    const pointsSummary =
      (await this.pointsRepository.get(parsedPayload.passenger_id)) ??
      buildEmptyPassengerPointsSummary(parsedPayload.passenger_id);
    const currentLedger =
      (await this.rewardsRepository.get(parsedPayload.passenger_id)) ??
      buildEmptyPassengerRewardsLedger(parsedPayload.passenger_id, airlineCode);

    const existingRecord = currentLedger.redemption_history.find(
      (record) => record.redemption_id === parsedPayload.redemption_id
    );

    if (existingRecord) {
      return rewardRedeemResponseSchema.parse({
        redemption: existingRecord,
        trace_id: traceContext.trace_id,
        wallet: await this.getPassengerWallet(
          span,
          parsedPayload.passenger_id,
          airlineCode
        )
      });
    }

    const availablePoints =
      pointsSummary.total_points - currentLedger.redeemed_points;

    if (offer.inventory_total !== null && inventoryRemaining !== null && inventoryRemaining <= 0) {
      throw new BadRequestException({
        message: "Reward offer sold out",
        reward_id: parsedPayload.reward_id
      });
    }

    if (
      offer.redemption_limit_per_session !== null &&
      (inventoryRecord.redemptions_by_session[parsedPayload.session_id] ?? 0) >=
        offer.redemption_limit_per_session
    ) {
      throw new BadRequestException({
        message: "Reward redemption limit reached for this session",
        reward_id: parsedPayload.reward_id,
        session_id: parsedPayload.session_id
      });
    }

    if (availablePoints < offer.points_cost) {
      throw new BadRequestException({
        available_points: Math.max(0, availablePoints),
        message: "Insufficient available points",
        reward_id: offer.reward_id
      });
    }

    const redemption = rewardRedemptionRecordSchema.parse({
      airline_code: airlineCode,
      ...buildFulfillmentDetails(offer, parsedPayload.redemption_id),
      passenger_id: parsedPayload.passenger_id,
      points_cost: offer.points_cost,
      redeemed_at: new Date().toISOString(),
      redemption_id: parsedPayload.redemption_id,
      reward_id: offer.reward_id,
      session_id: parsedPayload.session_id,
      title: offer.title
    });

    const ledger = await this.rewardsRepository.set(
      parsedPayload.passenger_id,
      appendRedemption(currentLedger, redemption)
    );
    await this.rewardInventoryRepository.set(
      airlineCode,
      parsedPayload.reward_id,
      appendRewardInventoryUsage(inventoryRecord, parsedPayload.session_id)
    );

    const wallet = passengerRewardsWalletSchema.parse({
      airline_code: airlineCode,
      available_points: Math.max(
        0,
        pointsSummary.total_points - ledger.redeemed_points
      ),
      earned_points: pointsSummary.total_points,
      passenger_id: parsedPayload.passenger_id,
      redeemed_points: ledger.redeemed_points,
      redemption_history: ledger.redemption_history,
      updated_at: ledger.updated_at
    });

    const response = rewardRedeemResponseSchema.parse({
      redemption,
      trace_id: traceContext.trace_id,
      wallet
    });

    logger.info("rewards.redeemed", span, {
      input_summary: JSON.stringify({
        passenger_id: parsedPayload.passenger_id,
        reward_id: offer.reward_id,
        redemption_id: parsedPayload.redemption_id
      }),
      output_summary: `${wallet.available_points} available points`,
      metadata: {
        earned_points: wallet.earned_points,
        redeemed_points: wallet.redeemed_points
      }
    });

    return response;
  }

  private parseRedeemPayload(
    payload: unknown,
    traceContext: TraceContext
  ): RewardRedeemRequest {
    const parsed = rewardRedeemRequestSchema.safeParse(payload);
    if (parsed.success) {
      return parsed.data;
    }

    logger.warn("rewards.redeem.invalid_payload", traceContext, {
      input_summary: JSON.stringify(payload ?? {}),
      error_detail: parsed.error.message,
      status: "error"
    });

    throw new BadRequestException({
      message: "Invalid reward redemption payload",
      issues: parsed.error.flatten()
    });
  }

  private async loadCatalogWithInventory(airlineCode: string, locale: string) {
    const definitions = getRewardOfferDefinitions(airlineCode, locale);
    const remainingByRewardId = Object.fromEntries(
      await Promise.all(
        definitions.map(async (offer) => {
          if (offer.inventory_total === null) {
            return [offer.reward_id, null] as const;
          }

          const inventoryRecord =
            (await this.rewardInventoryRepository.get(
              airlineCode,
              offer.reward_id
            )) ?? buildEmptyRewardInventoryRecord(airlineCode, offer.reward_id);

          return [
            offer.reward_id,
            Math.max(0, offer.inventory_total - inventoryRecord.redeemed_count)
          ] as const;
        })
      )
    );

    return buildRewardsCatalog(airlineCode, locale, {
      remainingByRewardId
    });
  }
}

function buildFulfillmentDetails(offer: RewardOffer, redemptionId: string) {
  if (offer.fulfillment_type === "voucher") {
    return {
      fulfillment_code: buildFulfillmentCode(offer.reward_id, redemptionId),
      fulfillment_instructions:
        "请在 Portal 或客舱服务页出示兑换码，权益可立即使用。",
      fulfillment_type: offer.fulfillment_type,
      status: "ready_to_use" as const
    };
  }

  if (offer.fulfillment_type === "perk") {
    return {
      fulfillment_code: null,
      fulfillment_instructions:
        "权益已即时生效，刷新频道或重新进入 package 后即可看到新增内容。",
      fulfillment_type: offer.fulfillment_type,
      status: "fulfilled" as const
    };
  }

  return {
    fulfillment_code: buildFulfillmentCode(offer.reward_id, redemptionId),
    fulfillment_instructions:
      "请向乘务员出示该编号，客舱服务会在本航段内完成发放。",
    fulfillment_type: offer.fulfillment_type,
    status: "confirmed" as const
  };
}

function buildFulfillmentCode(rewardId: string, redemptionId: string) {
  const rewardToken = rewardId.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase();
  const redemptionToken =
    redemptionId.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase() || "000000";
  return `${rewardToken}-${redemptionToken}`;
}
