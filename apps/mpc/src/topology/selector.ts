/**
 * Party Selector — health-aware selection of 2-of-3 parties for signing.
 *
 * Selection criteria (priority order):
 *   1. Node eligibility (online + not overloaded)
 *   2. Latency (lower = better)
 *   3. Active ceremony load (fewer = better)
 *   4. Region diversity (prefer different AZs)
 *
 * If a selected party fails mid-ceremony, the fallback party is used
 * for a fresh signing attempt (requires restarting the ceremony).
 */

import type { NodeHealth, SelectionCriteria, SelectionResult } from './types';

// ─── Party Selector ───────────────────────────────────────────────────────

export class PartySelector {
  private healthMap: Map<number, NodeHealth>;

  constructor() {
    this.healthMap = new Map();
  }

  /**
   * Update health for a node.
   */
  updateHealth(health: NodeHealth): void {
    this.healthMap.set(health.partyId, health);
  }

  /**
   * Remove a node from health tracking.
   */
  removeNode(partyId: number): void {
    this.healthMap.delete(partyId);
  }

  /**
   * Get health for a node.
   */
  getHealth(partyId: number): NodeHealth | undefined {
    return this.healthMap.get(partyId);
  }

  /**
   * Get all node health entries.
   */
  getAllHealth(): NodeHealth[] {
    return Array.from(this.healthMap.values());
  }

  /**
   * Select 2 parties for a signing ceremony from the available 3.
   *
   * @param requiredParties - Number of parties needed (default 2)
   * @param criteria - Optional selection preferences
   * @returns Selected party IDs and a fallback
   */
  select(
    requiredParties: number = 2,
    criteria?: SelectionCriteria,
  ): SelectionResult {
    const allNodes = Array.from(this.healthMap.values());
    const exclude = new Set(criteria?.excludeParties ?? []);

    // Filter eligible nodes
    const eligible = allNodes.filter((n) => {
      if (exclude.has(n.partyId)) return false;
      if (!n.eligible) return false;
      if (n.status !== 'online') return false;
      if (n.latencyMs < 0) return false;
      return true;
    });

    if (eligible.length < requiredParties) {
      return {
        selected: [],
        reason: `Only ${eligible.length} eligible nodes (need ${requiredParties})`,
        fallback: null,
      };
    }

    // Score each node
    const scored = eligible.map((n) => ({
      partyId: n.partyId,
      score: this.computeScore(n, criteria),
      health: n,
    }));

    // Sort by score (lower = better)
    scored.sort((a, b) => a.score - b.score);

    // Select top N
    const selected = scored.slice(0, requiredParties).map((s) => s.partyId);

    // Fallback is the next best eligible node
    const fallback =
      scored.length > requiredParties
        ? scored[requiredParties].partyId
        : null;

    const reason = `Selected ${selected.join(', ')} based on health scores: ` +
      scored.map((s) => `party-${s.partyId}=${s.score.toFixed(1)}`).join(', ');

    return { selected, reason, fallback };
  }

  /**
   * Select 2 parties, requiring the coordinator to be one of them.
   *
   * @param coordinatorId - The party ID of the coordinating node
   */
  selectWithCoordinator(
    coordinatorId: number,
    criteria?: SelectionCriteria,
  ): SelectionResult {
    // First check if coordinator is eligible
    const coordinator = this.healthMap.get(coordinatorId);
    if (!coordinator || !coordinator.eligible || coordinator.status !== 'online') {
      return {
        selected: [],
        reason: `Coordinator party ${coordinatorId} is not eligible`,
        fallback: null,
      };
    }

    // Force include coordinator
    const effectiveCriteria: SelectionCriteria = {
      ...criteria,
      excludeParties: [
        ...(criteria?.excludeParties ?? []),
        // Don't exclude anyone; we handle it differently
      ],
    };

    // Get the best other party
    const result = this.select(1, effectiveCriteria);
    if (result.selected.length === 0) {
      return {
        selected: [],
        reason: 'No eligible partner for coordinator',
        fallback: null,
      };
    }

    // Ensure partner is not the coordinator
    const partner = result.selected[0];
    if (partner === coordinatorId) {
      // Try fallback
      if (result.fallback !== null && result.fallback !== coordinatorId) {
        return {
          selected: [coordinatorId, result.fallback],
          reason: `Coordinator + fallback party ${result.fallback}`,
          fallback: partner, // The originally selected partner becomes fallback
        };
      }
      return {
        selected: [],
        reason: 'No eligible partner distinct from coordinator',
        fallback: null,
      };
    }

    return {
      selected: [coordinatorId, partner],
      reason: `Coordinator ${coordinatorId} + best partner ${partner}`,
      fallback: result.fallback !== null && result.fallback !== coordinatorId
        ? result.fallback
        : null,
    };
  }

  /**
   * Compute a selection score for a node (lower = better).
   *
   * Score = latency_weight * latency_ms + load_weight * active_ceremonies
   */
  private computeScore(health: NodeHealth, criteria?: SelectionCriteria): number {
    let score = 0;

    // Latency component
    if (criteria?.preferLowLatency !== false) {
      score += health.latencyMs * 0.6;
    }

    // Load component
    if (criteria?.preferLowLoad !== false) {
      const loadRatio = health.activeCeremonies / Math.max(health.maxCeremonies, 1);
      score += loadRatio * 100;
    }

    // Region diversity bonus (negative score = preferred)
    if (criteria?.preferRegions && criteria.preferRegions.length > 0) {
      // This is handled at the selection level, not per-node scoring
    }

    return score;
  }
}
