import {
  rewardOfferSchema,
  type RewardOffer
} from "@wifi-portal/game-sdk";

export type RewardOfferDefinition = RewardOffer & {
  inventory_total: number | null;
};

const rewardOffersByAirline: Record<
  string,
  Omit<RewardOfferDefinition, "airline_code" | "inventory_remaining">[]
> = {
  MU: [
    {
      description: "兑换机上 Wi-Fi 延时包，适合继续联机或补完单机进度。",
      fulfillment_type: "voucher",
      inventory_status: "available",
      inventory_total: 24,
      points_cost: 30,
      redemption_limit_per_session: 1,
      reward_id: "wifi-boost-30",
      terms: "每位乘客每航段限兑 1 次，兑换后立即生效。",
      title: "30 分钟 Wi-Fi Boost"
    },
    {
      description: "领取东方航空频道专属饮品券，落地前可在客舱兑换。",
      fulfillment_type: "physical",
      inventory_status: "limited",
      inventory_total: 2,
      points_cost: 45,
      redemption_limit_per_session: 1,
      reward_id: "drink-voucher",
      terms: "库存有限，兑完即止。",
      title: "饮品兑换券"
    },
    {
      description: "优先解锁下一季机上频道限定拼图与问答主题包。",
      fulfillment_type: "perk",
      inventory_status: "available",
      inventory_total: null,
      points_cost: 60,
      redemption_limit_per_session: 1,
      reward_id: "season-pass",
      terms: "权益与当前乘客身份绑定，不可转赠。",
      title: "频道季票权益"
    }
  ],
  DEFAULT: [
    {
      description: "领取机上娱乐加速券，用于延长频道体验时长。",
      fulfillment_type: "voucher",
      inventory_status: "available",
      inventory_total: 16,
      points_cost: 25,
      redemption_limit_per_session: 1,
      reward_id: "entertainment-boost",
      terms: "每航段限兑 1 次。",
      title: "娱乐加速券"
    },
    {
      description: "兑换精选小游戏主题包，优先试玩即将上线的新内容。",
      fulfillment_type: "perk",
      inventory_status: "available",
      inventory_total: null,
      points_cost: 55,
      redemption_limit_per_session: 1,
      reward_id: "preview-pack",
      terms: "权益随 session 生效。",
      title: "预览主题包"
    }
  ]
};

export function buildRewardsCatalog(
  airlineCode: string,
  locale: string,
  options: {
    remainingByRewardId?: Record<string, number | null>;
  } = {}
): RewardOffer[] {
  return getRewardOfferDefinitions(airlineCode, locale).map((offer) =>
    rewardOfferSchema.parse({
      ...offer,
      inventory_remaining:
        options.remainingByRewardId?.[offer.reward_id] ?? offer.inventory_total,
      inventory_status: deriveInventoryStatus(
        offer.inventory_total,
        options.remainingByRewardId?.[offer.reward_id] ?? offer.inventory_total,
        offer.inventory_status
      )
    })
  );
}

export function getRewardOfferDefinitions(
  airlineCode: string,
  locale: string
): RewardOfferDefinition[] {
  const offers =
    rewardOffersByAirline[airlineCode.toUpperCase()] ?? rewardOffersByAirline.DEFAULT;

  return offers.map((offer) => ({
    ...offer,
    airline_code: airlineCode.toUpperCase(),
    description:
      locale.startsWith("zh")
        ? offer.description
        : translateOfferDescription(offer.description),
    inventory_remaining: offer.inventory_total,
    terms:
      locale.startsWith("zh") ? offer.terms : translateOfferTerms(offer.terms),
    title: locale.startsWith("zh") ? offer.title : translateOfferTitle(offer.title)
  }));
}

function deriveInventoryStatus(
  inventoryTotal: number | null,
  inventoryRemaining: number | null,
  fallbackStatus: RewardOffer["inventory_status"]
): RewardOffer["inventory_status"] {
  if (inventoryTotal === null || inventoryRemaining === null) {
    return fallbackStatus;
  }

  if (inventoryRemaining <= 0) {
    return "sold_out";
  }

  if (inventoryRemaining <= Math.min(3, inventoryTotal)) {
    return "limited";
  }

  return "available";
}

function translateOfferDescription(value: string) {
  switch (value) {
    case "兑换机上 Wi-Fi 延时包，适合继续联机或补完单机进度。":
      return "Redeem an onboard Wi-Fi extension pack for longer multiplayer or solo sessions.";
    case "领取东方航空频道专属饮品券，落地前可在客舱兑换。":
      return "Claim a channel-exclusive beverage voucher redeemable during the flight.";
    case "优先解锁下一季机上频道限定拼图与问答主题包。":
      return "Unlock the next seasonal puzzle and quiz theme pack early.";
    case "领取机上娱乐加速券，用于延长频道体验时长。":
      return "Claim an entertainment booster voucher to extend channel time.";
    case "兑换精选小游戏主题包，优先试玩即将上线的新内容。":
      return "Redeem a preview theme pack for upcoming game content.";
    default:
      return value;
  }
}

function translateOfferTerms(value: string) {
  switch (value) {
    case "每位乘客每航段限兑 1 次，兑换后立即生效。":
      return "Limited to one redemption per passenger per flight segment. Activates immediately.";
    case "库存有限，兑完即止。":
      return "Limited inventory. Available while supplies last.";
    case "权益与当前乘客身份绑定，不可转赠。":
      return "Benefit is bound to the current passenger identity and is non-transferable.";
    case "每航段限兑 1 次。":
      return "Limited to one redemption per flight segment.";
    case "权益随 session 生效。":
      return "Benefit becomes active for the current session.";
    default:
      return value;
  }
}

function translateOfferTitle(value: string) {
  switch (value) {
    case "30 分钟 Wi-Fi Boost":
      return "30-Minute Wi-Fi Boost";
    case "饮品兑换券":
      return "Beverage Voucher";
    case "频道季票权益":
      return "Channel Season Pass";
    case "娱乐加速券":
      return "Entertainment Booster";
    case "预览主题包":
      return "Preview Theme Pack";
    default:
      return value;
  }
}
