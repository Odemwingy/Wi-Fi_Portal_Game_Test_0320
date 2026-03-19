export class AppError extends Error {
  constructor(
    message: string,
    public readonly errorCode: string,
    public readonly traceId?: string,
    public readonly recoverable = true
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class LLMError extends AppError {}
export class LLMTimeoutError extends LLMError {}
export class LLMRateLimitError extends LLMError {}
export class LLMResponseFormatError extends LLMError {}
export class ToolError extends AppError {}
export class ToolValidationError extends ToolError {}
export class ToolExecutionError extends ToolError {}
export class ExternalApiError extends ToolError {}
