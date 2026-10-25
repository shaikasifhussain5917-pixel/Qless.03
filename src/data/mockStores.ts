import { SupermarketStore } from "../types";
import { LAUNCH_STORE } from "../config/storeConfig";

/**
 * Phase 11: Single Launch Supermarket Configuration
 * Requirement 1: Only ONE active supermarket for initial launch: QLess Mart (STORE001 / QLM001).
 * Multi-store list selection is disabled for public customer journeys.
 */
export const MOCK_STORES: SupermarketStore[] = [LAUNCH_STORE];

