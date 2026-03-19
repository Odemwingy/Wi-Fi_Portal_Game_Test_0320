import { Injectable } from "@nestjs/common";

import type {
  AirlinePointsAdapterProvider,
  AirlinePointsConfig,
  AirlinePointsSyncRecord
} from "@wifi-portal/game-sdk";

export type AirlinePointsAdapterInput = {
  config: AirlinePointsConfig;
  record: AirlinePointsSyncRecord;
};

export type AirlinePointsAdapterResult = {
  external_reference: string;
};

export class RetryableAirlinePointsSyncError extends Error {}
export class PermanentAirlinePointsSyncError extends Error {}

export abstract class AirlinePointsAdapter {
  abstract supports(provider: AirlinePointsAdapterProvider): boolean;
  abstract sync(
    input: AirlinePointsAdapterInput
  ): Promise<AirlinePointsAdapterResult>;
}

@Injectable()
export class MockHttpAirlinePointsAdapter extends AirlinePointsAdapter {
  supports(provider: AirlinePointsAdapterProvider) {
    return provider === "mock-http";
  }

  async sync(input: AirlinePointsAdapterInput) {
    const simulationMode = input.config.simulation_mode;
    if (simulationMode === "permanent_failure") {
      throw new PermanentAirlinePointsSyncError(
        `Mock HTTP airline rejected report ${input.record.report_id}`
      );
    }

    if (
      simulationMode === "retryable_failure" &&
      input.record.attempt_count === 0
    ) {
      throw new RetryableAirlinePointsSyncError(
        `Mock HTTP airline timed out for report ${input.record.report_id}`
      );
    }

    return {
      external_reference: [
        "mock",
        input.record.airline_code.toLowerCase(),
        input.record.report_id
      ].join("-")
    };
  }
}

@Injectable()
export class LegacyBatchAirlinePointsAdapter extends AirlinePointsAdapter {
  supports(provider: AirlinePointsAdapterProvider) {
    return provider === "legacy-batch";
  }

  async sync(input: AirlinePointsAdapterInput) {
    const simulationMode = input.config.simulation_mode;
    if (simulationMode === "permanent_failure") {
      throw new PermanentAirlinePointsSyncError(
        `Legacy batch airline rejected report ${input.record.report_id}`
      );
    }

    if (
      simulationMode === "retryable_failure" &&
      input.record.attempt_count === 0
    ) {
      throw new RetryableAirlinePointsSyncError(
        `Legacy batch airline queue busy for report ${input.record.report_id}`
      );
    }

    return {
      external_reference: [
        "legacy",
        input.record.airline_code.toLowerCase(),
        input.record.session_id,
        input.record.report_id
      ].join("-")
    };
  }
}
