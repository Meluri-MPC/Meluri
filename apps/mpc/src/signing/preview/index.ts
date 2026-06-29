/**
 * Transaction Preview — simulation before signing.
 *
 * Before signing, the transaction is simulated against the target chain
 * to verify it will succeed. The preview shows the user what will happen.
 *
 * For Stacks: uses a Hiro API dry-run to simulate the transaction.
 * For Ethereum: uses eth_call simulation.
 * For Bitcoin: checks UTXO set and fee estimation.
 *
 * In v1, this returns a preview object. In production, this calls
 * the actual chain node for simulation.
 */

import type { ChainId } from '../../chains/types';
import { getChainConfig } from '../../chains/registry';

// ─── Types ────────────────────────────────────────────────────────────

export interface TransactionPreview {
  /** Human-readable summary */
  summary: string;
  /** Target address / contract */
  to: string;
  /** Amount (in smallest unit) */
  amount: string;
  /** Estimated fee */
  fee: string;
  /** Estimated total cost (amount + fee) */
  estimatedCost: string;
  /** Post-conditions (Stacks-specific) */
  postConditions?: string[];
  /** Whether simulation succeeded */
  simulated: boolean;
  /** Simulation error (if any) */
  simulationError?: string;
  /** Sponsor info */
  sponsored?: boolean;
  /** Chain-specific metadata */
  metadata: Record<string, unknown>;
}

export interface SimulationResult {
  success: boolean;
  preview?: TransactionPreview;
  error?: string;
  errorCode?: string; // 'INSUFFICIENT_BALANCE', 'INVALID_NONCE', 'CONTRACT_ERROR', etc.
}

// ─── Preview Generator ────────────────────────────────────────────────

export class TransactionPreviewService {
  /**
   * Generate a transaction preview.
   * In production, this calls the chain node for actual simulation.
   */
  async preview(
    chain: ChainId,
    params: {
      from: string;
      to: string;
      amount: string;
      fee?: string;
      memo?: string;
      contractCall?: string;
      functionArgs?: unknown[];
    },
  ): Promise<SimulationResult> {
    const config = getChainConfig(chain);

    try {
      const preview = this.buildPreview(chain, params);

      // Simulate: check basic validity
      const simulation = await this.simulate(chain, params);
      if (!simulation.success) {
        return { success: false, error: simulation.error, errorCode: simulation.errorCode };
      }

      return { success: true, preview: { ...preview, simulated: true } };
    } catch (error: any) {
      return {
        success: false,
        error: `Preview failed: ${error.message}`,
        errorCode: 'SIMULATION_ERROR',
      };
    }
  }

  /**
   * Simulate the transaction against the chain.
   * In production, calls the actual RPC endpoint.
   */
  private async simulate(
    chain: ChainId,
    params: { from: string; to: string; amount: string },
  ): Promise<{ success: boolean; error?: string; errorCode?: string }> {
    // Basic validation checks (placeholder for actual RPC calls)
    if (!params.from || params.from.length < 10) {
      return { success: false, error: 'Invalid sender address', errorCode: 'INVALID_ADDRESS' };
    }

    if (!params.to || params.to.length < 10) {
      return { success: false, error: 'Invalid recipient address', errorCode: 'INVALID_ADDRESS' };
    }

    try {
      const amount = BigInt(params.amount);
      if (amount <= 0n) {
        return { success: false, error: 'Amount must be positive', errorCode: 'INVALID_AMOUNT' };
      }
    } catch {
      return { success: false, error: 'Invalid amount format', errorCode: 'INVALID_AMOUNT' };
    }

    return { success: true };
  }

  /**
   * Build a human-readable preview.
   */
  private buildPreview(
    chain: ChainId,
    params: {
      from: string;
      to: string;
      amount: string;
      fee?: string;
      memo?: string;
      contractCall?: string;
      functionArgs?: unknown[];
    },
  ): TransactionPreview {
    const config = getChainConfig(chain);
    let fee = params.fee ?? '100000';
    let amount = params.amount;

    try {
      const totalCost = (BigInt(amount) + BigInt(fee)).toString();
      return {
        summary: this.buildSummary(chain, params),
        to: params.to,
        amount,
        fee,
        estimatedCost: totalCost,
        postConditions: params.memo ? [params.memo] : undefined,
        simulated: false,
        sponsored: false,
        metadata: {
          chain: config.name,
          curve: config.curve,
          coinType: config.coinType,
          memo: params.memo,
          contractCall: params.contractCall,
        },
      };
    } catch {
      return {
        summary: `Send ${amount} to ${params.to.slice(0, 10)}... on ${config.name}`,
        to: params.to,
        amount: params.amount,
        fee,
        estimatedCost: 'unknown',
        simulated: false,
        metadata: { chain: config.name },
      };
    }
  }

  /**
   * Build a user-friendly summary string.
   */
  private buildSummary(
    chain: ChainId,
    params: { to: string; amount: string; contractCall?: string; memo?: string },
  ): string {
    if (params.contractCall) {
      return `Call ${params.contractCall} on ${chain}`;
    }
    if (params.memo) {
      return `Send ${params.amount} to ${params.to.slice(0, 10)}... (${params.memo}) on ${chain}`;
    }
    return `Send ${params.amount} to ${params.to.slice(0, 10)}... on ${chain}`;
  }
}
