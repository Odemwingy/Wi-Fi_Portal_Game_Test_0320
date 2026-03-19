import { describe, expect, it } from "vitest";

import { startTrace } from "@wifi-portal/shared-observability";

import { PointsRepository, StateStorePointsRepository } from "./repositories/points.repository";
import { InMemoryJsonStateStore } from "./repositories/json-state-store";
import {
  RewardInventoryRepository,
  StateStoreRewardInventoryRepository
} from "./repositories/reward-inventory.repository";
import {
  RewardsRepository,
  StateStoreRewardsRepository
} from "./repositories/rewards.repository";
import { PointsService } from "./points.service";
import { RewardsService } from "./rewards.service";

describe("RewardsService", () => {
  it("builds a wallet from earned points and successful redemptions", async () => {
    const stateStore = new InMemoryJsonStateStore();
    const pointsRepository: PointsRepository = new StateStorePointsRepository(
      stateStore
    );
    const rewardsRepository: RewardsRepository = new StateStoreRewardsRepository(
      stateStore
    );
    const rewardInventoryRepository: RewardInventoryRepository =
      new StateStoreRewardInventoryRepository(stateStore);
    const pointsService = new PointsService(pointsRepository);
    const rewardsService = new RewardsService(
      pointsRepository,
      rewardsRepository,
      rewardInventoryRepository
    );
    const trace = startTrace();

    await pointsService.reportPoints(trace, {
      game_id: "quiz-duel",
      metadata: {},
      passenger_id: "passenger-1",
      points: 70,
      reason: "quiz duel completed",
      report_id: "report-1",
      session_id: "sess-1"
    });

    const redemption = await rewardsService.redeem(trace, {
      airline_code: "MU",
      locale: "zh-CN",
      passenger_id: "passenger-1",
      redemption_id: "redeem-1",
      reward_id: "wifi-boost-30",
      session_id: "sess-1"
    });

    expect(redemption.wallet.earned_points).toBe(70);
    expect(redemption.wallet.redeemed_points).toBe(30);
    expect(redemption.wallet.available_points).toBe(40);
    expect(redemption.redemption).toMatchObject({
      fulfillment_code: "WIFIBO-EDEEM1",
      fulfillment_type: "voucher",
      reward_id: "wifi-boost-30",
      status: "ready_to_use",
      title: "30 分钟 Wi-Fi Boost"
    });

    const duplicate = await rewardsService.redeem(trace, {
      airline_code: "MU",
      locale: "zh-CN",
      passenger_id: "passenger-1",
      redemption_id: "redeem-1",
      reward_id: "wifi-boost-30",
      session_id: "sess-1"
    });

    expect(duplicate.wallet.redeemed_points).toBe(30);
    expect(duplicate.wallet.redemption_history).toHaveLength(1);

    const wallet = await rewardsService.getPassengerWallet(
      trace,
      "passenger-1",
      "MU"
    );
    expect(wallet.available_points).toBe(40);
    expect(wallet.redemption_history[0]).toMatchObject({
      reward_id: "wifi-boost-30"
    });
  });

  it("enforces inventory and one redemption per session for limited rewards", async () => {
    const stateStore = new InMemoryJsonStateStore();
    const pointsRepository: PointsRepository = new StateStorePointsRepository(
      stateStore
    );
    const rewardsRepository: RewardsRepository = new StateStoreRewardsRepository(
      stateStore
    );
    const rewardInventoryRepository: RewardInventoryRepository =
      new StateStoreRewardInventoryRepository(stateStore);
    const pointsService = new PointsService(pointsRepository);
    const rewardsService = new RewardsService(
      pointsRepository,
      rewardsRepository,
      rewardInventoryRepository
    );
    const trace = startTrace();

    await pointsService.reportPoints(trace, {
      game_id: "quiz-duel",
      metadata: {},
      passenger_id: "passenger-a",
      points: 80,
      reason: "quiz duel completed",
      report_id: "report-a",
      session_id: "sess-a"
    });
    await pointsService.reportPoints(trace, {
      game_id: "quiz-duel",
      metadata: {},
      passenger_id: "passenger-b",
      points: 80,
      reason: "quiz duel completed",
      report_id: "report-b",
      session_id: "sess-b"
    });
    await pointsService.reportPoints(trace, {
      game_id: "quiz-duel",
      metadata: {},
      passenger_id: "passenger-c",
      points: 80,
      reason: "quiz duel completed",
      report_id: "report-c",
      session_id: "sess-c"
    });

    await rewardsService.redeem(trace, {
      airline_code: "MU",
      locale: "zh-CN",
      passenger_id: "passenger-a",
      redemption_id: "redeem-a",
      reward_id: "drink-voucher",
      session_id: "segment-1"
    });

    await expect(
      rewardsService.redeem(trace, {
        airline_code: "MU",
        locale: "zh-CN",
        passenger_id: "passenger-a",
        redemption_id: "redeem-a-2",
        reward_id: "drink-voucher",
        session_id: "segment-1"
      })
    ).rejects.toMatchObject({
      response: {
        message: "Reward redemption limit reached for this session"
      }
    });

    await rewardsService.redeem(trace, {
      airline_code: "MU",
      locale: "zh-CN",
      passenger_id: "passenger-b",
      redemption_id: "redeem-b",
      reward_id: "drink-voucher",
      session_id: "segment-2"
    });

    const catalog = await rewardsService.getCatalog(trace, "MU", "zh-CN");
    const drinkVoucher = catalog.offers.find((offer) => offer.reward_id === "drink-voucher");
    expect(drinkVoucher).toMatchObject({
      inventory_remaining: 0,
      inventory_status: "sold_out",
      redemption_limit_per_session: 1
    });

    await expect(
      rewardsService.redeem(trace, {
        airline_code: "MU",
        locale: "zh-CN",
        passenger_id: "passenger-c",
        redemption_id: "redeem-c",
        reward_id: "drink-voucher",
        session_id: "segment-3"
      })
    ).rejects.toMatchObject({
      response: {
        message: "Reward offer sold out"
      }
    });
  });
});
