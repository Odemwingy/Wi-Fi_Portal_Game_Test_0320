export type TraceContext = {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
};

const randomId = (length: number) =>
  Math.random()
    .toString(36)
    .slice(2, 2 + length)
    .padEnd(length, "0");

export const createTraceId = () => randomId(12);
export const createSpanId = () => randomId(8);

export const startTrace = (): TraceContext => ({
  trace_id: createTraceId(),
  span_id: createSpanId(),
  parent_span_id: null
});

export const startChildSpan = (parent: TraceContext): TraceContext => ({
  trace_id: parent.trace_id,
  span_id: createSpanId(),
  parent_span_id: parent.span_id
});

export const summarizeValue = (value: unknown, maxLength = 500) => {
  const raw =
    typeof value === "string" ? value : JSON.stringify(value, null, 0) ?? "";
  return raw.length > maxLength ? `${raw.slice(0, maxLength)}...` : raw;
};
