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

const createAdminHeaders = (sessionToken) => ({
  authorization: `Bearer ${sessionToken}`
})

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

const runAirlinePointsSmoke = async ({ hostBootstrap }) => {
  logStep("logging in as admin for airline points smoke")
  const adminSession = await requestJson("/api/admin/auth/login", {
    body: {
      password: "portal-super-123",
      username: "super-admin"
    },
    method: "POST"
  })

  const configPayload = {
    airline_code: "MU",
    api_base_url: "https://demo-airline.invalid/points",
    auth_credential: "demo-token",
    auth_type: "bearer",
    enabled: true,
    field_mapping: {
      activity_code: "game_id",
      member_id: "passenger_id",
      request_id: "report_id",
      session_ref: "session_id"
    },
    points_multiplier: 1,
    provider: "mock-http",
    retry_policy: {
      base_backoff_seconds: 1,
      max_attempts: 3
    },
    simulation_mode: "retryable_failure",
    sync_mode: "realtime"
  }

  try {
    await requestJson("/api/admin/airline-points/config", {
      body: configPayload,
      headers: createAdminHeaders(adminSession.session_token),
      method: "PUT"
    })

    logStep("reporting points with retryable airline sync failure")
    const reportResponse = await requestJson("/api/points/report", {
      body: {
        airline_code: "MU",
        game_id: "quiz-duel",
        metadata: {
          smoke: true
        },
        passenger_id: hostBootstrap.session.passengerId,
        points: 15,
        reason: "smoke airline sync validation",
        report_id: `smoke-airline-${uniqueSuffix}`,
        session_id: hostBootstrap.session.sessionId
      },
      method: "POST"
    })

    assert.equal(reportResponse.airline_sync.status, "failed")
    assert.ok(reportResponse.airline_sync.next_retry_at)

    const retried = await requestJson(
      `/api/admin/airline-points/sync-records/${reportResponse.airline_sync.sync_id}/retry`,
      {
        headers: createAdminHeaders(adminSession.session_token),
        method: "POST"
      }
    )
    assert.equal(retried.status, "synced")

    const syncRecords = await requestJson(
      "/api/admin/airline-points/sync-records?airline_code=MU&limit=5",
      {
        headers: createAdminHeaders(adminSession.session_token)
      }
    )
    assert.ok(
      syncRecords.entries.some(
        (entry) =>
          entry.sync_id === reportResponse.airline_sync.sync_id
          && entry.status === "synced"
      ),
      "expected retried airline sync record to be listed as synced"
    )
    logStep("airline points retry flow passed")
  } finally {
    await requestJson("/api/admin/airline-points/config", {
      body: {
        ...configPayload,
        simulation_mode: "success"
      },
      headers: createAdminHeaders(adminSession.session_token),
      method: "PUT"
    })
    await requestJson("/api/admin/auth/logout", {
      headers: createAdminHeaders(adminSession.session_token),
      method: "POST"
    })
  }
}

const runPointsRulesSmoke = async ({ hostBootstrap }) => {
  logStep("logging in as admin for points rules smoke")
  const adminSession = await requestJson("/api/admin/auth/login", {
    body: {
      password: "portal-super-123",
      username: "super-admin"
    },
    method: "POST"
  })

  const pointsRulesConfig = {
    airline_code: "MU",
    game_id: "quiz-duel",
    max_points_per_report: 30,
    rules: [
      {
        applies_to_events: ["any"],
        enabled: true,
        id: "requested-points",
        kind: "requested_points_multiplier",
        label: "Requested points passthrough",
        multiplier: 1
      },
      {
        applies_to_events: ["result"],
        enabled: true,
        id: "winner-bonus",
        kind: "metadata_boolean_bonus",
        label: "Winner bonus",
        metadata_key: "is_winner",
        boolean_match: true,
        points: 7
      },
      {
        applies_to_events: ["result"],
        enabled: true,
        id: "multiplayer-bonus",
        kind: "flat_bonus",
        label: "Multiplayer room bonus",
        points: 5,
        require_room: true
      }
    ]
  }

  try {
    await requestJson("/api/admin/points-rules/config", {
      body: pointsRulesConfig,
      headers: createAdminHeaders(adminSession.session_token),
      method: "PUT"
    })

    const reportResponse = await requestJson("/api/points/report", {
      body: {
        airline_code: "MU",
        game_id: "quiz-duel",
        metadata: {
          event_type: "result",
          is_winner: true
        },
        passenger_id: hostBootstrap.session.passengerId,
        points: 20,
        reason: "smoke points rules validation",
        report_id: `smoke-points-rules-${uniqueSuffix}`,
        room_id: "smoke-room-rules",
        session_id: hostBootstrap.session.sessionId
      },
      method: "POST"
    })

    assert.equal(reportResponse.audit_entry.awarded_points, 30)
    assert.deepEqual(reportResponse.audit_entry.applied_rule_ids, [
      "requested-points",
      "winner-bonus",
      "multiplayer-bonus"
    ])

    const auditResponse = await requestJson(
      `/api/points/audit?passenger_id=${encodeURIComponent(hostBootstrap.session.passengerId)}&limit=5`
    )
    assert.ok(
      auditResponse.entries.some(
        (entry) =>
          entry.report_id === `smoke-points-rules-${uniqueSuffix}`
          && entry.awarded_points === 30
      ),
      "expected points audit entry with capped awarded points"
    )
    logStep("points rules config and audit flow passed")
  } finally {
    await requestJson("/api/admin/auth/logout", {
      headers: createAdminHeaders(adminSession.session_token),
      method: "POST"
    })
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

const runSpotTheDifferenceSmoke = async ({
  guestBootstrap,
  hostBootstrap
}) => {
  logStep("creating spot-the-difference-race room")
  const created = await requestJson("/api/lobby/create-room", {
    body: {
      game_id: "spot-the-difference-race",
      host_player_id: hostBootstrap.session.passengerId,
      host_session_id: hostBootstrap.session.sessionId,
      max_players: 2,
      room_name: `Spot Race Room ${uniqueSuffix}`
    },
    method: "POST"
  })

  await requestJson("/api/lobby/join-by-invite", {
    body: {
      invite_code: created.room.invite_code,
      player_id: guestBootstrap.session.passengerId,
      session_id: guestBootstrap.session.sessionId
    },
    method: "POST"
  })

  const hostClient = createRealtimeClient({
    playerId: hostBootstrap.session.passengerId,
    roomId: created.room.room_id,
    sessionId: hostBootstrap.session.sessionId,
    traceId: `trace-spot-host-${uniqueSuffix}`
  })
  const guestClient = createRealtimeClient({
    playerId: guestBootstrap.session.passengerId,
    roomId: created.room.room_id,
    sessionId: guestBootstrap.session.sessionId,
    traceId: `trace-spot-guest-${uniqueSuffix}`
  })

  try {
    await Promise.all([waitForOpen(hostClient.socket), waitForOpen(guestClient.socket)])
    await Promise.all([
      waitForMessage(hostClient, (message) => message.type === "room_snapshot"),
      waitForMessage(guestClient, (message) => message.type === "room_snapshot"),
      waitForMessage(
        hostClient,
        (message) =>
          message.type === "game_state"
          && message.payload.gameId === "spot-the-difference-race"
      ),
      waitForMessage(
        guestClient,
        (message) =>
          message.type === "game_state"
          && message.payload.gameId === "spot-the-difference-race"
      )
    ])
    logStep("spot-the-difference-race initial websocket snapshots passed")

    hostClient.socket.send(
      JSON.stringify({
        message_id: `spot-race-msg-${uniqueSuffix}`,
        payload: {
          gameId: "spot-the-difference-race",
          payload: {
            spotId: "window-shade-01"
          },
          playerId: hostBootstrap.session.passengerId,
          roomId: created.room.room_id,
          seq: 1,
          type: "game_event"
        },
        type: "game_event"
      })
    )

    await Promise.all([
      waitForMessage(
        hostClient,
        (message) =>
          message.type === "ack"
          && message.correlation_id === `spot-race-msg-${uniqueSuffix}`
          && message.payload.acked_type === "game_event"
      ),
      waitForMessage(
        guestClient,
        (message) =>
          message.type === "game_state"
          && message.correlation_id === `spot-race-msg-${uniqueSuffix}`
          && message.payload.state.found_spots["window-shade-01"]?.playerId
            === hostBootstrap.session.passengerId
      )
    ])
    logStep("spot-the-difference-race claim relay passed")

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
    logStep("spot-the-difference-race disconnect snapshot passed")

    await requestJson("/api/lobby/reconnect", {
      body: {
        player_id: guestBootstrap.session.passengerId,
        room_id: created.room.room_id,
        session_id: guestBootstrap.session.sessionId
      },
      method: "POST"
    })

    const guestReconnectClient = createRealtimeClient({
      playerId: guestBootstrap.session.passengerId,
      roomId: created.room.room_id,
      sessionId: guestBootstrap.session.sessionId,
      traceId: `trace-spot-guest-reconnect-${uniqueSuffix}`
    })

    try {
      await waitForOpen(guestReconnectClient.socket)
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
      await waitForMessage(
        guestReconnectClient,
        (message) =>
          message.type === "game_state"
          && message.payload.gameId === "spot-the-difference-race"
          && message.payload.state.found_spots["window-shade-01"]?.playerId
            === hostBootstrap.session.passengerId
          && message.payload.state.claimed_spot_count === 1
      )
      logStep("spot-the-difference-race reconnect state restore passed")
    } finally {
      await closeSocket(guestReconnectClient.socket)
    }
  } finally {
    await Promise.allSettled([
      closeSocket(hostClient.socket),
      closeSocket(guestClient.socket)
    ])
  }
}

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
    await runPointsRulesSmoke({
      hostBootstrap
    })
    await runAirlinePointsSmoke({
      hostBootstrap
    })
    await runSpotTheDifferenceSmoke({
      guestBootstrap,
      hostBootstrap
    })
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
