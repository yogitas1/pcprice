export interface CatalogItem {
  id: string;
  name: string;
  group_name: string;
  album: string;
  version: string | null;
  print_run: number | null;
  retail_price: number | null;
  rarity_tier: string | null;
  reference_image_url: string | null;
  created_at: string;
}

export interface Item {
  id: string;
  user_id: string;
  catalog_id: string | null;
  condition_grade: number | null;
  authenticity_score: number | null;
  authenticity_status: string | null;
  auth_flags: string[] | null;
  resubmit_count: number;
  photos: string[] | null;
  scan_status: string;
  scan_result: ScanResult | null;
  scan_defects: string[] | null;
  created_at: string;
  // joined from catalog_items
  catalog?: CatalogItem;
}

export interface ScanResult {
  grade: number;
  grade_label: string;
  defects: string[];
  confidence: number;
  notes: string;
}

export interface Listing {
  id: string;
  item_id: string;
  seller_id: string;
  floor_price: number;
  current_price: number;
  sell_by_date: string;
  status: string;
  listing_copy: string | null;
  shipping_from: string | null;
  created_at: string;
}

export interface ListingPriceHistory {
  id: string;
  listing_id: string;
  old_price: number;
  new_price: number;
  reason: string;
  changed_at: string;
}

export interface SellerProfile {
  id: string;
  user_id: string;
  score: number;
  tier: string;
  created_at: string;
}

export interface BuyOrder {
  id: string;
  buyer_id: string;
  catalog_id: string;
  max_price: number;
  min_condition_grade: number;
  min_seller_tier: string;
  execution_mode: 'auto_buy' | 'approve_to_buy';
  spend_cap_mode: 'global' | 'per_tier' | null;
  spend_cap_amount: number | null;
  spend_cap_tiers: Record<string, number> | null;
  stripe_payment_intent_id: string | null;
  last_reauth_at: string | null;
  status: 'active' | 'filled' | 'cancelled' | 'reauth_failed';
  created_at: string;
}

export interface ListingSnapshot {
  catalog_name: string;
  group_name: string | null;
  album: string | null;
  version: string | null;
  condition_grade: number;
  scan_defects: string[];
  authenticity_score: number | null;
  photos: string[];
  seller_tier: string;
  current_price: number;
  fair_value: number | null;
  shipping_from: string | null;
}

export interface MatchLog {
  id: string;
  buy_order_id: string;
  listing_id: string | null;
  matched_at: string;
  outcome: 'no_match' | 'pending_approval' | 'auto_executed' | 'declined';
  outcome_reason: string | null;
  expires_at: string | null;
  listing_snapshot: ListingSnapshot | null;
}

export type ScanStatus =
  | 'pending_scan'
  | 'needs_more_photos'
  | 'pending_auth'
  | 'manual_review'
  | 'verified'
  | 'rejected';
