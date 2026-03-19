import { Body, Controller, Get, Inject, Post, Query, Req } from "@nestjs/common";

import type { TraceRequest } from "./http.types";
import { GameEventsService } from "./game-events.service";

@Controller("events")
export class GameEventsController {
  constructor(
    @Inject(GameEventsService)
    private readonly gameEventsService: GameEventsService
  ) {}

  @Post("report")
  reportEvent(@Req() req: TraceRequest, @Body() body: unknown) {
    return this.gameEventsService.reportEvent(req.trace_context!, body);
  }

  @Get()
  listEvents(
    @Req() req: TraceRequest,
    @Query("event_type") eventType?: string,
    @Query("game_id") gameId?: string,
    @Query("limit") limit?: string,
    @Query("passenger_id") passengerId?: string,
    @Query("room_id") roomId?: string,
    @Query("session_id") sessionId?: string
  ) {
    return this.gameEventsService.listEvents(req.trace_context!, {
      event_type: eventType,
      game_id: gameId,
      limit,
      passenger_id: passengerId,
      room_id: roomId,
      session_id: sessionId
    });
  }

  @Get("leaderboard")
  getLeaderboard(
    @Req() req: TraceRequest,
    @Query("game_id") gameId?: string,
    @Query("limit") limit?: string
  ) {
    return this.gameEventsService.getLeaderboard(req.trace_context!, {
      game_id: gameId,
      limit
    });
  }
}
