export type PackageLaunchContext = {
  airlineCode: string;
  cabinClass: string;
  locale: string;
  passengerId: string;
  roomId: string | null;
  seatNumber: string | null;
  sessionId: string;
  traceId: string;
};

export function readPackageLaunchContext(search: string): PackageLaunchContext {
  const params = new URLSearchParams(search);

  return {
    airlineCode: params.get("airline_code") ?? "MU",
    cabinClass: params.get("cabin_class") ?? "economy",
    locale: params.get("locale") ?? "zh-CN",
    passengerId: params.get("passenger_id") ?? "unknown-passenger",
    roomId: params.get("room_id"),
    seatNumber: params.get("seat_number"),
    sessionId: params.get("session_id") ?? createClientId("package-session"),
    traceId: params.get("trace_id") ?? createClientId("package-trace")
  };
}

function createClientId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
