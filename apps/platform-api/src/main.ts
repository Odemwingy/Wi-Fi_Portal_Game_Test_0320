import "reflect-metadata";

import type { Server as HttpServer } from "node:http";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { GameRuntimeService } from "./game-runtime.service";
import { PlatformMetricsService } from "./platform-metrics.service";
import { RealtimeServer } from "./realtime.server";
import { RoomService } from "./room.service";

const defaultAllowedOrigins = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:8080",
  "http://localhost:8080"
];

function parseAllowedOrigins() {
  const raw = process.env.CORS_ALLOWED_ORIGINS;

  if (!raw) {
    return defaultAllowedOrigins;
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: false
  });

  app.enableCors({
    credentials: false,
    origin: parseAllowedOrigins()
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
