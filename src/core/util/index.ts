/**
 * Core utility modules
 */

export {
  bigintReplacer,
  bigintReviver,
  bigintToString,
  formatBaseToDisplay,
  parseDisplayToBase,
  parseWithBigInt,
  stringifyWithBigInt,
  stringToBigint,
  tryStringToBigint,
} from './bigintJson';

export {
  formatValidationErrors,
  getAddressNetwork,
  isNetworkMatch,
  isValidAddress,
  normalizeAddress,
  validateAddress,
  validateAmount,
  validateRecipient,
  validateRecipientBatch,
  type AddressValidationError,
  type AddressValidationResult,
  type AmountValidationError,
  type AmountValidationResult,
  type BatchValidationSummary,
  type RecipientInput,
  type RecipientValidationResult,
} from './validate';
