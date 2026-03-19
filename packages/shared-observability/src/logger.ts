import type { TraceContext } from "./tracer";
import { summarizeValue } from "./tracer";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "CRITICAL";
export type LogStatus = "success" | "error" | "timeout" | "skipped";

export type StructuredLogEntry = {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  component: string;
  action: string;
  timestamp: string;
  level: LogLevel;
  status: LogStatus;
  duration_ms: number;
  input_summary: string;
  output_summary: string;
  error_detail: string | null;
  metadata: Record<string, unknown>;
};

type LogOptions = {
  duration_ms?: number;
  error_detail?: string | null;
  input_summary?: string;
  metadata?: Record<string, unknown>;
  output_summary?: string;
  status?: LogStatus;
};

export type LogSink = (entry: StructuredLogEntry) => void;

const defaultSink: LogSink = (entry) => {
  console.log(JSON.stringify(entry));
};

export const createStructuredLogger = (
  component: string,
  sink: LogSink = defaultSink
) => {
  const write = (
    level: LogLevel,
    action: string,
    context: TraceContext,
    options: LogOptions = {}
  ) => {
    sink({
      trace_id: context.trace_id,
      span_id: context.span_id,
      parent_span_id: context.parent_span_id,
      component,
      action,
      timestamp: new Date().toISOString(),
      level,
      status: options.status ?? "success",
      duration_ms: options.duration_ms ?? 0,
      input_summary: summarizeValue(options.input_summary ?? ""),
      output_summary: summarizeValue(options.output_summary ?? ""),
      error_detail: options.error_detail ?? null,
      metadata: options.metadata ?? {}
    });
  };

  return {
    debug: (action: string, context: TraceContext, options?: LogOptions) =>
      write("DEBUG", action, context, options),
    info: (action: string, context: TraceContext, options?: LogOptions) =>
      write("INFO", action, context, options),
    warn: (action: string, context: TraceContext, options?: LogOptions) =>
      write("WARN", action, context, options),
    error: (action: string, context: TraceContext, options?: LogOptions) =>
      write("ERROR", action, context, options)
  };
};
