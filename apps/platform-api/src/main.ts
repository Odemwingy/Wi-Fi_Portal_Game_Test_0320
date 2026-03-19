import "reflect-metadata";

import type { Server as HttpServer } from "node:http";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { GameRuntimeService } from "./game-runtime.service";
import { PlatformMetricsService } from "./platform-metrics.service";
import { RealtimeServer } from "./realtime.server";
import { RoomService } from "./room.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: false
  });

  app.setGlobalPrefix("api");
  const realtimeServer = new RealtimeServer(
    app.getHttpServer() as HttpServer,
    app.get(RoomService),
    app.get(GameRuntimeService),
    app.get(PlatformMetricsService)
  );

  app.getHttpServer().once("close", () => {
    realtimeServer.close();
  });
  await app.listen(3000);
}

void bootstrap();
