import { Body, Controller, Get, Inject, Param, Post, Req } from "@nestjs/common";

import type { TraceRequest } from "./http.types";
import { RoomService } from "./room.service";

@Controller()
export class RoomController {
  constructor(@Inject(RoomService) private readonly roomService: RoomService) {}

  @Post("lobby/create-room")
  async createRoom(@Req() req: TraceRequest, @Body() body: unknown) {
    return this.roomService.createRoom(req.trace_context!, body);
  }

  @Post("lobby/join-room")
  async joinRoom(@Req() req: TraceRequest, @Body() body: unknown) {
    return this.roomService.joinRoom(req.trace_context!, body);
  }

  @Post("lobby/join-by-invite")
  async joinRoomByInvite(@Req() req: TraceRequest, @Body() body: unknown) {
    return this.roomService.joinRoomByInvite(req.trace_context!, body);
  }

  @Post("lobby/leave-room")
  async leaveRoom(@Req() req: TraceRequest, @Body() body: unknown) {
    return this.roomService.leaveRoom(req.trace_context!, body);
  }

  @Post("lobby/set-ready")
  async setReady(@Req() req: TraceRequest, @Body() body: unknown) {
    return this.roomService.setReady(req.trace_context!, body);
  }

  @Post("lobby/reconnect")
  async reconnect(@Req() req: TraceRequest, @Body() body: unknown) {
    return this.roomService.reconnect(req.trace_context!, body);
  }

  @Post("lobby/disconnect")
  async disconnect(@Req() req: TraceRequest, @Body() body: unknown) {
    const payload = body as { room_id: string; player_id: string };
    return this.roomService.disconnect(
      req.trace_context!,
      payload.room_id,
      payload.player_id
    );
  }

  @Get("lobby/rooms/:roomId")
  async getRoom(@Req() req: TraceRequest, @Param("roomId") roomId: string) {
    return this.roomService.getRoom(req.trace_context!, roomId);
  }

  @Get("contracts/realtime")
  getRealtimeContract() {
    return this.roomService.getRealtimeContract();
  }
}
