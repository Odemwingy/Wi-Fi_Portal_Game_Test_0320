import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req
} from "@nestjs/common";

import type { TraceRequest } from "./http.types";
import { RewardsService } from "./rewards.service";

@Controller("rewards")
export class RewardsController {
  constructor(
    @Inject(RewardsService) private readonly rewardsService: RewardsService
  ) {}

  @Get("catalog")
  getCatalog(
    @Req() req: TraceRequest,
    @Query("airline_code") airlineCode = "DEMO",
    @Query("locale") locale = "en-US"
  ) {
    return this.rewardsService.getCatalog(req.trace_context!, airlineCode, locale);
  }

  @Get("passengers/:passengerId/wallet")
  getPassengerWallet(
    @Req() req: TraceRequest,
    @Param("passengerId") passengerId: string,
    @Query("airline_code") airlineCode = "DEMO"
  ) {
    return this.rewardsService.getPassengerWallet(
      req.trace_context!,
      passengerId,
      airlineCode
    );
  }

  @Post("redeem")
  redeem(@Req() req: TraceRequest, @Body() body: unknown) {
    return this.rewardsService.redeem(req.trace_context!, body);
  }
}
