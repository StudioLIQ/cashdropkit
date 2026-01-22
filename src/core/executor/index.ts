/**
 * Executor Module
 *
 * Provides execution capabilities for airdrop distribution plans.
 */

export {
  AirdropExecutor,
  createAirdropExecutor,
  resumeExecution,
  type ExecutorConfig,
  type BatchExecutionResult,
  type ExecutionProgress,
  type ExecutionProgressCallback,
  type ExecutorResult,
  type RetryOptions,
  type FailedBatchInfo,
} from './airdropExecutor';
