import assert from "node:assert/strict"
import process from "node:process"

import WebSocket from "ws"

const platformBaseUrl = process.env.PLATFORM_API_BASE_URL ?? "http://127.0.0.1:3000"
const wsBaseUrl =
  process.env.PLATFORM_WS_BASE_URL
  ?? platformBaseUrl.replace(/^http/, "ws")

const uniqueSuffix = Date.now().toString(36)

const logStep = (message) => {
  console.log(`[smoke] ${message}`)
}

const requestJson = async (path, options = {}) => {
  const response = await fetch(new URL(path, platformBaseUrl), {
    method: options.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  const raw = await response.text()
  const data = raw ? JSON.parse(raw) : null

  if (!response.ok) {
    throw new Error(
      `${options.method ?? "GET"} ${path} failed with ${response.status}: ${raw}`
    )
  }

  return data
}

const waitForOpen = (socket) =>
  new Promise((resolve, reject) => {
    socket.once("open", resolve)
    socket.once("error", reject)
  })

const waitForMessage = (client, predicate, timeoutMs = 4_000) =>
  new Promise((resolve, reject) => {
    const existing = client.messages.find(predicate)
    if (existing) {
      resolve(existing)
      return
    }

    const timer = setTimeout(() => {
      client.socket.off("message", onMessage)
      reject(new Error(dumpRealtimeMessages(client.messages)))
    }, timeoutMs)

    const onMessage = (raw) => {
      const message = JSON.parse(raw.toString())

      if (!predicate(message)) {
        return
      }

      clearTimeout(timer)
      client.socket.off("message", onMessage)
      resolve(message)
    }

    client.socket.on("message", onMessage)
  })

const dumpRealtimeMessages = (messages) => {
  const snapshot = messages.slice(-8)

  return `Timed out waiting for realtime message. Recent messages: ${JSON.stringify(snapshot, null, 2)}`
}

const createRealtimeClient = ({
  playerId,
  roomId,
  sessionId,
  traceId
}) => {
  const messages = []
  const url = new URL("/ws/game-room", wsBaseUrl)
  url.searchParams.set("trace_id", traceId)
  url.searchParams.set("room_id", roomId)
  url.searchParams.set("player_id", playerId)
  url.searchParams.set("session_id", sessionId)

  const socket = new WebSocket(url)
  socket.on("message", (raw) => {
    messages.push(JSON.parse(raw.toString()))
  })

  return {
    messages,
    socket
  }
}

const closeSocket = (socket) =>
  new Promise((resolve) => {
    if (
      socket.readyState === WebSocket.CLOSED
      || socket.readyState === WebSocket.CLOSING
    ) {
      resolve()
      return
    }

    socket.once("close", resolve)
    socket.close()
  })

const run = async () => {
  logStep(`target ${platformBaseUrl}`)

  const health = await requestJson("/api/health")
  assert.equal(health.status, "ok")

  const readiness = await requestJson("/api/health/ready")
  assert.equal(readiness.status, "ready")
  logStep("health and readiness passed")

  const hostBootstrap = await requestJson("/api/session/bootstrap", {
    body: {
      airline_code: "MU",
      cabin_class: "economy",
      locale: "zh-CN",
      passenger_id: `smoke-host-${uniqueSuffix}`,
      session_id: `sess-smoke-host-${uniqueSuffix}`,
      seat_number: "32A"
    },
    method: "POST"
  })

  const guestBootstrap = await requestJson("/api/session/bootstrap", {
    body: {
      airline_code: "MU",
      cabin_class: "economy",
      locale: "zh-CN",
      passenger_id: `smoke-guest-${uniqueSuffix}`,
      session_id: `sess-smoke-guest-${uniqueSuffix}`,
      seat_number: "32B"
    },
    method: "POST"
  })

  const catalog = await requestJson("/api/channel/catalog")
  assert.ok(
    catalog.some((entry) => entry.game_id === "quiz-duel"),
    "quiz-duel should be present in channel catalog"
  )
  logStep("bootstrap and catalog passed")

  const created = await requestJson("/api/lobby/create-room", {
    body: {
      game_id: "quiz-duel",
      host_player_id: hostBootstrap.session.passengerId,
      host_session_id: hostBootstrap.session.sessionId,
      max_players: 2,
      room_name: `Smoke Room ${uniqueSuffix}`
    },
    method: "POST"
  })

  const joined = await requestJson("/api/lobby/join-by-invite", {
    body: {
      invite_code: created.room.invite_code,
      player_id: guestBootstrap.session.passengerId,
      session_id: guestBootstrap.session.sessionId
    },
    method: "POST"
  })

  await requestJson("/api/lobby/set-ready", {
    body: {
      player_id: guestBootstrap.session.passengerId,
      ready: true,
      room_id: created.room.room_id
    },
    method: "POST"
  })

  assert.equal(joined.room.players.length, 2)
  logStep("room creation and invite join passed")

  const hostClient = createRealtimeClient({
    playerId: hostBootstrap.session.passengerId,
    roomId: created.room.room_id,
    sessionId: hostBootstrap.session.sessionId,
    traceId: `trace-host-${uniqueSuffix}`
  })
  const guestClient = createRealtimeClient({
    playerId: guestBootstrap.session.passengerId,
    roomId: created.room.room_id,
    sessionId: guestBootstrap.session.sessionId,
    traceId: `trace-guest-${uniqueSuffix}`
  })

  try {
    await Promise.all([waitForOpen(hostClient.socket), waitForOpen(guestClient.socket)])
    await Promise.all([
      waitForMessage(hostClient, (message) => message.type === "room_snapshot"),
      waitForMessage(guestClient, (message) => message.type === "room_snapshot"),
      waitForMessage(hostClient, (message) => message.type === "game_state"),
      waitForMessage(guestClient, (message) => message.type === "game_state")
    ])
    logStep("initial websocket snapshots passed")

    const metricsWithSockets = await requestJson("/api/metrics")
    assert.ok(
      metricsWithSockets.websocket.active_connections >= 2,
      "expected at least 2 active websocket connections"
    )
    logStep("metrics with active websocket connections passed")

    logStep("sending quiz-duel game event")
    hostClient.socket.send(
      JSON.stringify({
        message_id: `smoke-msg-${uniqueSuffix}`,
        payload: {
          gameId: "quiz-duel",
          payload: {
            answer: "A"
          },
          playerId: hostBootstrap.session.passengerId,
          roomId: created.room.room_id,
          seq: 1,
          type: "game_event"
        },
        type: "game_event"
      })
    )

    logStep("waiting for ack, relay, and updated game state")
    await Promise.all([
      waitForMessage(
        hostClient,
        (message) =>
          message.type === "ack"
          && message.payload.acked_type === "game_event"
      ),
      waitForMessage(
        guestClient,
        (message) =>
          message.type === "game_event"
          && message.payload.playerId === hostBootstrap.session.passengerId
      ),
      waitForMessage(
        guestClient,
        (message) =>
          message.type === "game_state"
          && message.payload.state.scores[hostBootstrap.session.passengerId] === 10
      )
    ])
    logStep("game event relay passed")

    logStep("closing guest websocket to verify disconnect snapshot")
    guestClient.socket.close()

    await waitForMessage(
      hostClient,
      (message) =>
        message.type === "room_snapshot"
        && message.payload.players.some(
          (player) =>
            player.player_id === guestBootstrap.session.passengerId
            && player.connection_status === "disconnected"
        )
    )
    logStep("disconnect snapshot passed")

    logStep("calling reconnect API")
    const reconnected = await requestJson("/api/lobby/reconnect", {
      body: {
        player_id: guestBootstrap.session.passengerId,
        room_id: created.room.room_id,
        session_id: guestBootstrap.session.sessionId
      },
      method: "POST"
    })
    assert.equal(reconnected.room.room_id, created.room.room_id)

    const guestReconnectClient = createRealtimeClient({
      playerId: guestBootstrap.session.passengerId,
      roomId: created.room.room_id,
      sessionId: guestBootstrap.session.sessionId,
      traceId: `trace-guest-reconnect-${uniqueSuffix}`
    })

    try {
      await waitForOpen(guestReconnectClient.socket)
      logStep("waiting for reconnect room snapshot")
      await waitForMessage(
        guestReconnectClient,
        (message) =>
          message.type === "room_snapshot"
          && message.payload.players.some(
            (player) =>
              player.player_id === guestBootstrap.session.passengerId
              && player.connection_status === "connected"
          )
      )
      logStep("reconnect flow passed")
    } finally {
      await closeSocket(guestReconnectClient.socket)
    }

    const finalMetrics = await requestJson("/api/metrics")
    assert.ok(finalMetrics.http.requests_total >= 8)
    assert.ok(finalMetrics.http.path_counts["GET /api/health"] >= 1)

    logStep("final metrics passed")
    console.log("Smoke checks passed.")
  } finally {
    await Promise.allSettled([
      closeSocket(hostClient.socket),
      closeSocket(guestClient.socket)
    ])
  }
}

run().catch((error) => {
  console.error("Smoke checks failed.")
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
