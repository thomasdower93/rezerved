export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  location: string;
  address: string;
  city?: string;
  postcode?: string;
  country?: string;
  description?: string;
  cuisine?: string;
  business_type?: string;
  is_demo?: boolean;
  opening_hours: OpeningHours;
  feature_flags?: FeatureFlags;
  table_map_enabled?: boolean;
  preorders_enabled?: boolean;
  preorders_plan_enabled?: boolean;
  desserts_enabled?: boolean;
  price_range?: string;
  rating?: number;
  review_count?: number;
  popular_dishes?: string[];
  amenities?: string[];
  tags?: string[];
  recent_bookings?: number;
  minimum_booking_notice_minutes?: number;
  max_online_party_size?: number | null;
  cover_image_url?: string | null;
  gallery_images?: string[];
  google_place_id?: string | null;
  google_rating?: number | null;
  google_review_count?: number | null;
  google_reviews_last_synced_at?: string | null;
  // SumUp integration (credentials never returned to client — use sumup_settings RPC)
  sumup_deposits_enabled?: boolean;
  sumup_pos_enabled?: boolean;
  sumup_pos_test_mode?: boolean;
  created_at: string;
  updated_at?: string;
}

export interface SumUpSettings {
  api_key_set: boolean;
  api_key_preview: string | null;
  merchant_code_set: boolean;
  merchant_code_preview: string | null;
  deposits_enabled: boolean;
  pos_enabled: boolean;
  pos_test_mode: boolean;
}

export interface SumUpPosSession {
  id: string;
  reservation_id: string;
  restaurant_id: string;
  table_id: string | null;
  sumup_table_session_id: string | null;
  status: 'pending' | 'open' | 'closed' | 'failed';
  opened_at: string | null;
  closed_at: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface OpeningHours {
  [key: string]: DayHours;
}

export interface DayHours {
  open: string;
  close: string;
  closed?: boolean;
  last_booking?: string;
}

export interface FeatureFlags {
  features: {
    preorders: boolean;
    taxi_ordering: boolean;
    [key: string]: boolean;
  };
}

export interface User {
  id: string;
  auth_user_id?: string;
  name: string;
  email: string;
  password_hash: string;
  role: 'staff' | 'admin' | 'customer';
  restaurant_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Area {
  id: string;
  restaurant_id: string;
  name: string;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface Wall {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface DoorWindowWC {
  x: number;
  y: number;
  rotation: number;
  doorDirection?: number;
}

export interface StructuralElement {
  id: string;
  area_id: string;
  type: 'wall' | 'door' | 'window' | 'wc';
  properties: Wall | DoorWindowWC;
  created_at: string;
  updated_at: string;
}

export interface Table {
  id: string;
  restaurant_id: string;
  area_id: string;
  name: string;
  capacity: number;
  pos_x: number;
  pos_y: number;
  shape: 'circle' | 'square' | 'rectangle';
  scale_x?: number;
  scale_y?: number;
  rotation?: number;
  default_pos_x: number;
  default_pos_y: number;
  can_be_joined?: boolean;
  created_at: string;
  updated_at: string;
}

export interface TableCombinationTemplate {
  id: string;
  restaurant_id: string;
  name: string;
  combined_capacity: number;
  allow_online_booking: boolean;
  active: boolean;
  internal_note?: string | null;
  created_at: string;
  updated_at: string;
  // Populated by joins
  tables?: Table[];
}

export interface ReservationTableAssignment {
  id: string;
  reservation_id: string;
  restaurant_id: string;
  table_id: string;
  role: 'primary' | 'joined';
  created_at: string;
}

export interface PreOrderItem {
  name: string;
  price: number;
  quantity: number;
}

export type ReservationJourneyStage =
  | 'seated'
  | 'drinks_taken'
  | 'drinks_served'
  | 'food_order_taken'
  | 'starters_served'
  | 'mains_served'
  | 'desserts_served'
  | 'bill_requested'
  | 'bill_paid'
  | 'table_cleared';

export interface ReservationJourneyEvent {
  id: string;
  reservation_id: string;
  stage: ReservationJourneyStage;
  entered_at: string;
  exited_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Reservation {
  id: string;
  restaurant_id: string;
  table_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  party_size: number;
  start_time: string;
  end_time: string;
  status: 'booked' | 'pending_acceptance' | 'declined' | 'cancelled' | 'pending_payment' | 'payment_failed';
  notes: string;
  manage_token: string;
  manage_token_expires_at: string;
  reservation_code?: string | null;
  reservation_duration_minutes?: number;
  preorder_items?: PreOrderItem[];
  preorder_total?: number;
  source?: 'online' | 'walk_in' | 'phone' | 'quick_visit';
  journey_stage?: ReservationJourneyStage | null;
  journey_started_at?: string | null;
  journey_completed_at?: string | null;
  modification_count?: number;
  modified_at?: string | null;
  previous_reservation_snapshot?: Record<string, unknown> | null;
  // Contact preferences
  marketing_opt_in?: boolean;
  marketing_opt_in_at?: string | null;
  marketing_opt_in_source?: string | null;
  service_email_notifications_allowed?: boolean;
  service_sms_notifications_allowed?: boolean;
  // Reconfirmation flow
  reconfirmation_required?: boolean;
  confirmation_status?: 'not_required' | 'pending' | 'confirmed' | 'cancelled_by_customer' | 'overdue' | 'auto_cancelled';
  first_reconfirmation_sent_at?: string | null;
  second_reconfirmation_sent_at?: string | null;
  customer_confirmed_at?: string | null;
  customer_cancelled_at?: string | null;
  confirmation_deadline_at?: string | null;
  auto_cancelled_at?: string | null;
  staff_confirmed_at?: string | null;
  staff_confirmed_by?: string | null;
  reconfirmation_disabled_at?: string | null;
  // Payment / deposit fields
  payment_required?: boolean;
  payment_status?: 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled' | null;
  deposit_amount_pence?: number | null;
  pending_expires_at?: string | null;
  // Initial reservation acceptance flow
  acceptance_mode_snapshot?: 'auto' | 'manual';
  acceptance_deadline_at?: string | null;
  accepted_at?: string | null;
  accepted_by?: string | null;
  declined_at?: string | null;
  declined_by?: string | null;
  decline_reason?: string | null;
  // Joined table support — IDs of all assigned tables (primary + joined).
  // Populated by client-side joins; not a DB column.
  joined_table_ids?: string[];
  joined_table_names?: string[];
  is_joined_booking?: boolean;
  combination_name?: string;
  created_at: string;
  updated_at: string;
}

export interface RestaurantDepositSettings {
  id?: string;
  restaurant_id: string;
  enabled: boolean;
  minimum_party_size: number;
  deposit_type: 'fixed' | 'per_person';
  amount_pence: number;
  currency: string;
  refund_cutoff_hours: number;
  policy_text: string;
  applies_to_online_bookings: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ReservationPayment {
  id: string;
  reservation_id: string;
  restaurant_id: string;
  provider: 'stripe' | 'sumup';
  provider_checkout_id?: string | null;
  provider_payment_intent_id?: string | null;
  amount_pence: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';
  paid_at?: string | null;
  refunded_at?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AlternativeTimeOption {
  time: string;
  distance: number;
}

export interface JoinedCombinationAvailability {
  template: TableCombinationTemplate;
  available: boolean;
  unavailableTableName?: string;
  /** Earliest time today when all tables in the combo are free, if unavailable now */
  nextAvailableTime?: string | null;
}

export interface TableAvailability extends Table {
  status: 'green' | 'yellow' | 'red';
  // Joined-table combination data (set when this table belongs to combinations)
  joinedCombinations?: JoinedCombinationAvailability[];
  // Set when customer explicitly selects a joined-table combination
  selectedCombination?: TableCombinationTemplate;
  suggested_start?: string;
  suggested_end?: string;
  alternative_times?: AlternativeTimeOption[];
  alternativeTime?: string;
  alternativeDirection?: 'before' | 'after';
  reason?: string;
  detailed_reason?: 'held_by_other' | 'held_by_me' | 'booked_conflict' | 'capacity_mismatch' | 'past_time' | 'no_alternatives';
  holdToken?: string;
  holdExpiresAt?: string;
  holdGroupToken?: string;
  hold_expires_at?: string;
  bestBeforeTime?: string;
  bestAfterTime?: string;
  bestBeforeDeltaMins?: number;
  bestAfterDeltaMins?: number;
  amberReason?: 'reserved' | 'held' | 'other';
}

export interface BookingFormData {
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  notes?: string;
}

export interface AvailabilityQuery {
  date: string;
  time: string;
  party_size: number;
}

export interface V1LayoutData {
  tables: Table[];
  areas: Area[];
  structural_elements: StructuralElement[];
}

export interface V2WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface V2Camera {
  panX: number;
  panY: number;
  zoom: number;
}

/** A single decorative chair attached to a table. Coordinates are relative to the table centre. */
export interface ChairData {
  id: string;
  /** X offset from table centre (world px) */
  x: number;
  /** Y offset from table centre (world px) */
  y: number;
  /** Local rotation of the chair in degrees (0 = seat-back points upward) */
  rotation: number;
  /** Visual width of the chair (world px) */
  width: number;
  /** Visual depth of the chair (world px — radial direction) */
  height: number;
  /** Chair shape variant */
  shape: 'rounded-rect' | 'circle' | 'stool' | 'bench';
}

export interface V2LayoutObject {
  id: string;
  type: 'table' | 'wall' | 'door' | 'window' | 'wc' | 'fixture' | 'bar_counter' | 'bar_stool' | 'booth' | 'host_stand' | 'stairs' | 'plant' | 'kitchen';
  worldX: number;
  worldY: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  locked?: boolean;
  properties?: Record<string, any>;
  name?: string;
  capacity?: number;
  shape?: 'circle' | 'square' | 'rectangle';
  areaId?: string;
  /** Decorative chair layout attached to this table. Coords relative to table centre. */
  chairs?: ChairData[];
}

export interface RoomPolygon {
  id: string;
  vertices: Array<{ x: number; y: number }>;
  floorStyle: 'wood' | 'herringbone' | 'solid_wood' | 'tile' | 'carpet' | 'concrete' | 'gravel' | 'grass' | 'car_park' | 'decking' | 'paving';
  name?: string;
  areaId?: string;
  exterior?: boolean;
}

export interface V2LayoutData {
  version: 2;
  world: {
    bounds: V2WorldBounds;
  };
  camera: V2Camera;
  objects: V2LayoutObject[];
  rooms?: RoomPolygon[];
  customerViewportBounds?: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface Floorplan {
  id: string;
  restaurant_id: string;
  version: 1 | 2;
  engine: 'legacy' | 'v2';
  layout_data: V1LayoutData | V2LayoutData;
  upgraded_from: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type InteractionMode = 'pan' | 'edit';
export type EditorMode = 'service' | 'layout';
