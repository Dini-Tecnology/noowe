-- Gerado por generate-backend-parity-schema.mjs
-- Fonte: backend/tmp/supabase-migration/schema-inventory.json
-- Enums TypeORM como text (podem virar CREATE TYPE depois).
-- Sem FKs aqui — adicionar em migração dedicada quando estáveis.
--
-- Correção manual: entidades Promoter / PromoterSale / PromoterPayment estavam fundidas
-- num único bloco no inventário — aqui são três tabelas: promoters, promoter_sales, promoter_payments.

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  description text not null,
  supplier text,
  category text not null,
  amount numeric not null,
  due_date timestamptz not null,
  paid_date timestamptz,
  status text not null,
  is_recurring boolean not null,
  recurrence text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  restaurant_id uuid,
  label text not null,
  street text not null,
  number text not null,
  complement text,
  neighborhood text not null,
  city text not null,
  state text not null,
  postal_code text not null,
  country text not null,
  latitude numeric,
  longitude numeric,
  is_default boolean not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  type text not null,
  item_name text not null,
  table_id uuid,
  requester_id uuid not null,
  resolver_id uuid,
  reason text not null,
  resolution_note text,
  amount numeric not null,
  status text not null,
  order_id uuid,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  resolved_at timestamptz
);

create table if not exists public.biometric_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  device_id uuid not null,
  token_hash text not null,
  biometric_type text not null,
  public_key text,
  expires_at timestamptz not null,
  platform text,
  is_revoked boolean not null,
  revoked_at timestamptz,
  revoke_reason text,
  last_used_at timestamptz,
  ip_address text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.otp_tokens (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null,
  code_hash text not null,
  channel text not null,
  purpose text not null,
  expires_at timestamptz not null,
  attempts numeric not null,
  is_used boolean not null,
  used_at timestamptz,
  ip_address text,
  created_at timestamptz not null
);

create table if not exists public.service_calls (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  table_id uuid,
  user_id uuid not null,
  call_type text not null,
  status text not null,
  message text,
  called_at timestamptz not null,
  acknowledged_at timestamptz,
  acknowledged_by text,
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.cash_register_movements (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  type text not null,
  amount numeric not null,
  is_cash boolean not null,
  order_id uuid,
  created_by text not null,
  description text,
  created_at timestamptz not null
);

create table if not exists public.cash_register_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  opened_by text not null,
  closed_by text,
  opening_balance numeric not null,
  expected_balance numeric,
  actual_balance numeric,
  difference numeric,
  status text not null,
  opened_at timestamptz not null,
  closed_at timestamptz,
  closing_notes text
);

create table if not exists public.club_birthday_entries (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  user_id uuid not null,
  event_date timestamptz not null,
  birth_date timestamptz not null,
  document_type text not null,
  document_number text not null,
  document_photo_url text,
  companions_allowed numeric not null,
  companions_registered numeric not null,
  free_entry boolean not null,
  discount_percentage numeric,
  credit_amount numeric not null,
  qr_code text not null,
  status text not null,
  rejection_reason text,
  approved_by text,
  approved_at timestamptz,
  used_at timestamptz,
  name text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.club_check_in_outs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  user_id uuid not null,
  entry_id uuid,
  check_in_at timestamptz not null,
  check_out_at timestamptz,
  created_at timestamptz not null
);

create table if not exists public.club_entries (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  user_id uuid not null,
  event_date timestamptz not null,
  variation_id uuid not null,
  variation_name text,
  quantity numeric not null,
  unit_price numeric not null,
  total_price numeric not null,
  credit_amount numeric not null,
  purchase_type text not null,
  qr_code text not null,
  status text not null,
  transaction_id uuid,
  used_at timestamptz,
  metadata jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.guest_list_entries (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  event_date timestamptz not null,
  user_id uuid not null,
  name text not null,
  party_size numeric not null,
  promoter_id uuid,
  status text not null,
  qr_code text not null,
  used_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.lineup_slots (
  id uuid primary key default gen_random_uuid(),
  lineup_id uuid not null,
  artist_name text not null,
  artist_type text not null,
  photo_url text,
  start_time text not null,
  end_time text not null,
  stage text,
  genre text,
  is_headliner boolean not null,
  display_order numeric not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.lineups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  event_date timestamptz not null,
  event_name text,
  description text,
  cover_image_url text,
  is_active boolean not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.promoters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  restaurant_id uuid not null,
  name text not null,
  nickname text,
  phone text,
  email text,
  photo_url text,
  promoter_code text not null,
  commission_type text not null,
  commission_rate numeric not null,
  fixed_commission_amount numeric not null,
  tier numeric,
  status text not null,
  total_entries_sold numeric not null,
  total_tables_sold numeric not null,
  total_revenue_generated numeric not null,
  total_commission_earned numeric not null,
  pending_commission numeric not null,
  pix_key text,
  bank text,
  notes text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.promoter_sales (
  id uuid primary key default gen_random_uuid(),
  promoter_id uuid not null,
  restaurant_id uuid not null,
  event_date timestamptz not null,
  sale_type text not null,
  reference_id text not null,
  customer_name text,
  customer_phone text,
  quantity numeric not null,
  sale_amount numeric not null,
  commission_amount numeric not null,
  commission_status text not null,
  paid_at timestamptz,
  payment_reference text,
  notes text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.promoter_payments (
  id uuid primary key default gen_random_uuid(),
  promoter_id uuid not null,
  restaurant_id uuid not null,
  amount numeric not null,
  payment_method text not null,
  status text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  sales_count numeric not null,
  sale_ids jsonb not null,
  payment_proof_url text,
  transaction_id text,
  processed_by uuid,
  processed_at timestamptz,
  notes text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.queue_entries (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  user_id uuid not null,
  party_size numeric not null,
  priority_level_id uuid not null,
  priority_level_name text,
  position numeric not null,
  estimated_wait_minutes numeric not null,
  status text not null,
  called_at timestamptz,
  entered_at timestamptz,
  left_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.vip_table_guests (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null,
  user_id uuid,
  name text,
  email text,
  phone text,
  invite_token text not null,
  status text not null,
  entry_id uuid,
  credit_contribution numeric not null,
  invited_at timestamptz not null,
  responded_at timestamptz,
  checked_in_at timestamptz,
  updated_at timestamptz not null
);

create table if not exists public.vip_table_reservations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  table_type_id uuid not null,
  table_id uuid,
  host_user_id uuid not null,
  event_date timestamptz not null,
  party_size numeric not null,
  minimum_spend numeric not null,
  deposit_amount numeric not null,
  deposit_credit numeric not null,
  deposit_transaction_id uuid,
  status text not null,
  confirmation_deadline timestamptz,
  confirmed_at timestamptz,
  cancellation_reason text,
  cancelled_at timestamptz,
  invite_token text,
  special_requests text,
  metadata jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.vip_table_tab_items (
  id uuid primary key default gen_random_uuid(),
  table_tab_id uuid not null,
  menu_item_id uuid not null,
  ordered_by_user_id uuid not null,
  quantity numeric not null,
  unit_price numeric not null,
  total_price numeric not null,
  status text not null,
  special_instructions text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.vip_table_tabs (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null,
  status text not null,
  deposit_credit numeric not null,
  entry_credits_total numeric not null,
  subtotal numeric not null,
  total_amount numeric not null,
  amount_paid numeric not null,
  minimum_spend_progress numeric not null,
  created_at timestamptz not null,
  closed_at timestamptz,
  updated_at timestamptz not null
);

create table if not exists public.ingredient_prices (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null,
  price_per_unit numeric not null,
  supplier text,
  effective_date timestamptz not null,
  created_at timestamptz not null
);

create table if not exists public.ingredient_suppliers (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null,
  supplier_id uuid not null,
  is_preferred boolean not null,
  last_price numeric,
  notes text,
  created_at timestamptz not null
);

create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  name text not null,
  unit text not null,
  category text,
  is_active boolean not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null,
  ingredient_id uuid not null,
  quantity numeric not null
);

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null,
  restaurant_id uuid not null,
  calculated_cost numeric,
  calculated_margin_pct numeric,
  last_calculated_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  name text not null,
  cnpj text,
  contact_name text,
  phone text,
  email text,
  address text,
  notes text,
  is_active boolean not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.customer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  restaurant_id uuid not null,
  total_visits numeric not null,
  total_spent numeric not null,
  avg_ticket numeric not null,
  last_visit_at timestamptz,
  favorite_items text not null,
  dietary_preferences text not null,
  segment text not null,
  birthday timestamptz,
  notes text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  restaurant_id uuid not null,
  notes text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  type text not null,
  category text not null,
  amount numeric not null,
  description text,
  reference_id uuid,
  reference_type text,
  metadata jsonb,
  transaction_date timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.fiscal_configs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  cnpj text not null,
  ie text,
  razao_social text not null,
  nome_fantasia text,
  state_code text not null,
  endereco jsonb not null,
  regime_tributario text not null,
  tax_defaults jsonb not null,
  csc_id uuid,
  csc_token text,
  current_series numeric not null,
  next_number numeric not null,
  fiscal_provider text not null,
  focus_nfe_token text,
  certificate_uploaded boolean not null,
  certificate_base64 text,
  certificate_password text,
  auto_emit boolean not null,
  is_active boolean not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.fiscal_documents (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  order_id uuid not null,
  type text not null,
  status text not null,
  provider text not null,
  access_key text,
  number numeric,
  series numeric,
  xml text,
  qr_code_url text,
  danfe_url text,
  protocol text,
  total_amount numeric not null,
  items_snapshot text,
  external_ref text,
  error_message text,
  created_at timestamptz not null
);

create table if not exists public.fraud_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  alert_type text not null,
  severity text not null,
  details jsonb not null,
  status text not null,
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.user_sanctions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  sanction_type text not null,
  reason text not null,
  evidence jsonb not null,
  notice_sent_at timestamptz,
  defense_deadline timestamptz,
  defense_submitted boolean not null,
  defense_text text,
  reviewed_by text,
  reviewed_at timestamptz,
  active boolean not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.attendances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  restaurant_id uuid not null,
  date timestamptz not null,
  check_in text,
  check_out text,
  hours_worked numeric not null,
  status text not null,
  notes text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  restaurant_id uuid not null,
  leave_type text not null,
  start_date timestamptz not null,
  end_date timestamptz not null,
  status text not null,
  reason text,
  rejection_reason text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null,
  restaurant_id uuid not null,
  date timestamptz not null,
  start_time text not null,
  end_time text not null,
  role text,
  status text not null,
  actual_start_time text,
  actual_end_time text,
  break_minutes numeric,
  notes text,
  is_overtime boolean not null,
  hourly_rate numeric,
  total_pay numeric,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text,
  action text not null,
  entity_type text,
  entity_id uuid,
  ip_address text,
  user_agent text,
  success boolean not null,
  failure_reason text,
  metadata jsonb,
  created_at timestamptz not null
);

create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  token text not null,
  expires_at timestamptz not null,
  is_used boolean not null,
  used_at timestamptz,
  ip_address text,
  user_agent text,
  created_at timestamptz not null
);

create table if not exists public.token_blacklist (
  id uuid primary key default gen_random_uuid(),
  token_jti text not null,
  user_id uuid not null,
  token_type text not null,
  expires_at timestamptz not null,
  revoked_reason text,
  revoked_ip text,
  created_at timestamptz not null
);

create table if not exists public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  consent_type text not null,
  version text not null,
  version_hash text,
  ip_address text not null,
  device_id uuid,
  user_agent text,
  accepted_at timestamptz not null,
  revoked_at timestamptz,
  metadata jsonb
);

create table if not exists public.user_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  password_hash text not null,
  failed_login_attempts numeric not null,
  locked_until text,
  last_login_at timestamptz,
  last_login_ip text,
  password_changed_at timestamptz,
  password_history text,
  mfa_enabled boolean not null,
  mfa_secret text,
  mfa_backup_codes text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz not null
);

create table if not exists public.security_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_type text not null,
  severity text not null,
  title text not null,
  description text not null,
  affected_users_count numeric not null,
  affected_data_types text not null,
  status text not null,
  detected_at timestamptz not null,
  contained_at timestamptz,
  resolved_at timestamptz,
  response_deadline timestamptz not null,
  anpd_notified boolean not null,
  anpd_notified_at timestamptz,
  users_notified boolean not null,
  users_notified_at timestamptz,
  root_cause text,
  remediation_steps text,
  reported_by text not null,
  assigned_to text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.external_menu_mappings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  platform text not null,
  external_item_id uuid not null,
  external_item_name text not null,
  internal_menu_item_id uuid not null,
  is_active boolean not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.platform_connections (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  platform text not null,
  credentials jsonb,
  webhook_secret text,
  is_active boolean not null,
  auto_accept boolean not null,
  max_concurrent_orders numeric not null,
  high_load_threshold numeric not null,
  last_sync_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  name text not null,
  category text not null,
  current_level numeric not null,
  unit text not null,
  min_level numeric not null,
  max_level numeric,
  unit_cost numeric,
  supplier text,
  is_active boolean not null,
  notes text,
  last_restocked_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.cook_stations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  name text not null,
  type text not null,
  emoji text,
  late_threshold_minutes numeric not null,
  display_order numeric not null,
  is_active boolean not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.fire_schedules (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  order_item_id uuid not null,
  station_id uuid not null,
  course text,
  fire_at timestamptz,
  expected_ready_at timestamptz,
  actual_ready_at timestamptz,
  fired boolean not null,
  fire_mode text not null,
  created_at timestamptz not null
);

create table if not exists public.kds_brain_configs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  course_gap_mode text not null,
  course_gap_minutes numeric not null,
  delivery_buffer_minutes numeric not null,
  auto_accept_delivery boolean not null,
  sound_enabled boolean not null,
  sound_volume numeric not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.prep_analytics (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  station_id uuid not null,
  menu_item_id uuid not null,
  order_item_id uuid not null,
  expected_prep_minutes numeric not null,
  actual_prep_minutes numeric,
  was_late boolean not null,
  shift text,
  source text,
  day_of_week text,
  recorded_at timestamptz not null
);

create table if not exists public.prep_time_suggestions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  menu_item_id uuid not null,
  station_id uuid,
  menu_item_name text not null,
  current_prep_minutes numeric not null,
  suggested_prep_minutes numeric not null,
  sample_size numeric not null,
  confidence_score numeric not null,
  status text not null,
  decided_at timestamptz,
  decided_by text,
  created_at timestamptz not null
);

create table if not exists public.loyalty_configs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  cashback_enabled boolean not null,
  cashback_percentage numeric not null,
  points_enabled boolean not null,
  points_per_real numeric not null,
  points_redemption_rate numeric not null,
  min_points_for_redemption numeric not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  restaurant_id uuid not null,
  points numeric not null,
  total_visits numeric not null,
  total_spent numeric not null,
  tier text not null,
  last_visit timestamptz,
  rewards_claimed jsonb,
  available_rewards jsonb,
  awarded_order_ids text not null,
  is_active boolean not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.stamp_cards (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  user_id uuid not null,
  service_type text not null,
  current_stamps numeric not null,
  required_stamps numeric not null,
  reward_description text not null,
  completed_cycles numeric not null,
  completed boolean not null,
  completed_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.menu_item_customization_groups (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null,
  name text not null,
  min_select numeric not null,
  max_select numeric not null,
  is_required boolean not null,
  sort_order numeric not null,
  options text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.order_guests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  guest_user_id uuid,
  guest_name text,
  is_host boolean not null,
  status text not null,
  amount_due numeric not null,
  amount_paid numeric not null,
  payment_completed boolean not null,
  payment_completed_at timestamptz,
  joined_at timestamptz not null,
  left_at timestamptz,
  updated_at timestamptz not null
);

create table if not exists public.gateway_configs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  provider text not null,
  credentials jsonb,
  is_active boolean not null,
  settings jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.gateway_transactions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  order_id uuid,
  provider text not null,
  external_id uuid,
  payment_method text not null,
  amount_cents numeric not null,
  status text not null,
  idempotency_key text not null,
  correlation_id uuid,
  metadata jsonb,
  error_code text,
  error_message text,
  refunded_amount_cents numeric not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  method_type text not null,
  card_last_four text,
  card_brand text,
  card_exp_month text,
  card_exp_year text,
  pix_key text,
  external_payment_method_id uuid,
  is_default boolean not null,
  is_active boolean not null,
  metadata jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.payment_splits (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  guest_user_id uuid not null,
  split_mode text not null,
  amount_due numeric not null,
  amount_paid numeric not null,
  status text not null,
  payment_id uuid,
  payment_transaction_id uuid,
  selected_items text,
  custom_amount numeric,
  service_charge numeric not null,
  tip_amount numeric not null,
  notes text,
  created_at timestamptz not null,
  paid_at timestamptz,
  updated_at timestamptz not null
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null,
  transaction_type text not null,
  amount numeric not null,
  balance_before numeric not null,
  balance_after numeric not null,
  description text,
  order_id uuid,
  payment_method_id uuid,
  external_transaction_id uuid,
  metadata jsonb,
  idempotency_key text,
  created_at timestamptz not null
);

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  restaurant_id uuid,
  wallet_type text not null,
  balance numeric not null,
  max_balance numeric not null,
  daily_limit numeric not null,
  monthly_limit numeric not null,
  is_active boolean not null,
  metadata jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  code text not null,
  title text not null,
  description text,
  type text not null,
  status text not null,
  discount_value numeric,
  free_item_id uuid,
  min_order_value numeric,
  max_uses numeric,
  current_uses numeric not null,
  max_uses_per_user numeric not null,
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  days_of_week numeric,
  hours_from text,
  hours_until text,
  applicable_categories text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.purchase_records (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  supplier_name text not null,
  invoice_number text,
  invoice_date timestamptz not null,
  total_amount numeric not null,
  items jsonb not null,
  import_method text not null,
  status text not null,
  created_at timestamptz not null,
  created_by text
);

create table if not exists public.supplier_item_mappings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  supplier_cnpj text not null,
  external_item_description text not null,
  external_ncm text,
  ingredient_id uuid not null,
  conversion_factor numeric,
  created_at timestamptz not null
);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  payment_id uuid,
  user_id uuid not null,
  restaurant_id uuid not null,
  table_id uuid,
  items_snapshot text not null,
  subtotal numeric not null,
  service_fee numeric not null,
  tip numeric not null,
  total numeric not null,
  payment_method text not null,
  generated_at timestamptz not null,
  created_at timestamptz not null
);

create table if not exists public.drink_recipes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid,
  name text not null,
  category text not null,
  description text,
  difficulty text not null,
  preparation_time_minutes numeric not null,
  glass_type text not null,
  garnish text,
  base_spirit text,
  serving_temp text not null,
  ingredients text not null,
  estimated_cost numeric,
  margin_percentage numeric,
  steps text not null,
  tags text,
  price numeric not null,
  image_url text,
  is_active boolean not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.delivery_settlements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  platform text not null,
  settlement_date timestamptz not null,
  gross_amount numeric not null,
  commission_amount numeric not null,
  expected_net numeric not null,
  actual_received numeric,
  difference numeric,
  status text not null,
  order_count numeric not null,
  created_at timestamptz not null
);

create table if not exists public.reservation_guests (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null,
  guest_user_id uuid,
  guest_name text,
  guest_phone text,
  guest_email text,
  status text not null,
  is_host boolean not null,
  invited_by text,
  invite_method text,
  invite_token text,
  invited_at timestamptz not null,
  responded_at timestamptz,
  has_arrived boolean not null,
  arrived_at timestamptz,
  requires_host_approval boolean not null,
  updated_at timestamptz not null
);

create table if not exists public.restaurant_service_configs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  service_type text not null,
  is_active boolean not null,
  sommelier_available boolean,
  dress_code text,
  reservation_required boolean,
  average_meal_duration numeric,
  skip_the_line_enabled boolean,
  pickup_zones text,
  avg_preparation_time numeric,
  build_your_own_enabled boolean,
  customization_options jsonb,
  work_friendly boolean,
  wifi_available boolean,
  power_outlets_available boolean,
  noise_level text,
  price_per_kg numeric,
  fixed_price numeric,
  payment_mode text,
  smart_scales_enabled boolean,
  drive_thru_lanes numeric,
  geofencing_enabled boolean,
  geofencing_radius numeric,
  license_plate_recognition boolean,
  current_location jsonb,
  schedule jsonb,
  offline_mode_enabled boolean,
  seats_available numeric,
  experience_duration numeric,
  pre_booking_required boolean,
  tasting_menu_only boolean,
  reservations_optional boolean,
  reservation_grace_period numeric,
  waitlist_enabled boolean,
  waitlist_advance_drinks boolean,
  estimated_wait_display boolean,
  table_service boolean,
  order_at_table boolean,
  call_waiter_button boolean,
  partial_order_enabled boolean,
  group_friendly boolean,
  max_group_size numeric,
  group_reservation_required numeric,
  suggested_tip_percentage numeric,
  service_charge_included boolean,
  split_bill_promoted boolean,
  table_turnover_target numeric,
  special_instructions text,
  experience_highlights text,
  config_metadata jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  restaurant_id uuid not null,
  order_id uuid,
  rating numeric not null,
  food_rating numeric,
  service_rating numeric,
  ambiance_rating numeric,
  value_rating numeric,
  comment text,
  images text,
  sentiment text,
  sentiment_analysis jsonb,
  is_verified boolean not null,
  is_visible boolean not null,
  helpful_count numeric not null,
  owner_response text,
  owner_responded_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz not null
);

create table if not exists public.restaurant_configs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  profile text,
  service_types text,
  experience_flags text,
  floor_layout text,
  kitchen_stations text,
  payment_config text,
  enabled_features text,
  team_config text,
  setup_complete boolean not null,
  setup_completed_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

-- Correção manual: inventário fundiu sessão de contagem e linhas — duas tabelas (sem FK aqui, ver cabeçalho).
create table if not exists public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  status text not null default 'in_progress',
  started_by uuid not null,
  completed_by uuid,
  started_at timestamptz not null,
  completed_at timestamptz,
  total_deviation_value numeric,
  notes text
);

create table if not exists public.inventory_count_items (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null,
  stock_item_id uuid not null,
  ingredient_id uuid not null,
  ingredient_name text not null,
  unit text not null,
  system_quantity numeric not null,
  counted_quantity numeric,
  deviation numeric,
  deviation_value numeric,
  is_counted boolean not null
);

create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null,
  restaurant_id uuid not null,
  current_quantity numeric not null,
  unit text not null,
  min_quantity numeric,
  max_quantity numeric,
  last_purchase_price numeric,
  last_purchase_date timestamptz,
  updated_at timestamptz not null
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null,
  restaurant_id uuid not null,
  ingredient_id uuid not null,
  type text not null,
  quantity numeric not null,
  quantity_before numeric not null,
  quantity_after numeric not null,
  unit_cost numeric,
  reference_id uuid,
  reference_type text,
  created_by text,
  notes text,
  created_at timestamptz not null
);

create table if not exists public.unit_conversions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid,
  ingredient_id uuid,
  from_unit text not null,
  to_unit text not null,
  factor numeric not null,
  created_at timestamptz not null
);

create table if not exists public.qr_scan_logs (
  id uuid primary key default gen_random_uuid(),
  qr_code_id uuid not null,
  restaurant_id uuid not null,
  table_id uuid not null,
  scanned_by text,
  device_info jsonb,
  ip_address text,
  scan_result text not null,
  session_id uuid,
  scanned_at timestamptz not null
);

create table if not exists public.tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  table_number text not null,
  seats numeric not null,
  status text not null,
  section text,
  assigned_waiter_id uuid,
  position_x numeric,
  position_y numeric,
  qr_code text,
  shape text not null,
  width numeric not null,
  height numeric not null,
  occupied_since timestamptz,
  notes text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.table_qr_codes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  table_id uuid not null,
  qr_code_data text not null,
  qr_code_image text,
  signature text not null,
  style text not null,
  color_primary text not null,
  color_secondary text,
  logo_included boolean not null,
  version numeric not null,
  is_active boolean not null,
  expires_at timestamptz,
  generated_by text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.table_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  table_id uuid not null,
  qr_code_id uuid,
  customer_id uuid,
  primary_user_id uuid,
  guest_user_ids text not null,
  guest_name text,
  guest_count numeric not null,
  status text not null,
  started_at timestamptz not null,
  last_activity timestamptz not null,
  ended_at timestamptz,
  total_orders numeric not null,
  total_spent numeric not null,
  total_amount numeric,
  notes text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.happy_hour_schedules (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  name text not null,
  description text,
  days text not null,
  start_time text not null,
  end_time text not null,
  discount_type text not null,
  discount_value numeric not null,
  applies_to text not null,
  category_ids text,
  item_ids text,
  is_active boolean not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.tab_items (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null,
  menu_item_id uuid not null,
  ordered_by_user_id uuid not null,
  quantity numeric not null,
  unit_price numeric not null,
  discount_amount numeric not null,
  discount_reason text,
  total_price numeric not null,
  status text not null,
  customizations jsonb,
  special_instructions text,
  is_round_repeat boolean not null,
  prepared_by text,
  prepared_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.tab_members (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null,
  user_id uuid not null,
  role text not null,
  status text not null,
  amount_consumed numeric not null,
  amount_paid numeric not null,
  credit_contribution numeric not null,
  joined_at timestamptz not null,
  left_at timestamptz,
  updated_at timestamptz not null
);

create table if not exists public.tab_payments (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null,
  user_id uuid not null,
  amount numeric not null,
  tip_amount numeric not null,
  payment_method text not null,
  transaction_id uuid,
  status text not null,
  payment_details jsonb,
  idempotency_key text,
  created_at timestamptz not null
);

create table if not exists public.tabs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  table_id uuid,
  host_user_id uuid not null,
  status text not null,
  type text not null,
  preauth_transaction_id uuid,
  preauth_amount numeric,
  cover_charge_credit numeric not null,
  deposit_credit numeric not null,
  subtotal numeric not null,
  discount_amount numeric not null,
  tip_amount numeric not null,
  total_amount numeric not null,
  amount_paid numeric not null,
  invite_token text,
  metadata jsonb,
  created_at timestamptz not null,
  closed_at timestamptz,
  updated_at timestamptz not null
);

create table if not exists public.waiter_calls (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  table_id uuid,
  user_id uuid not null,
  tab_id uuid,
  reason text not null,
  notes text,
  status text not null,
  acknowledged_by text,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null
);

create table if not exists public.tips (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  restaurant_id uuid not null,
  staff_id uuid,
  order_id uuid,
  amount numeric not null,
  tip_type text not null,
  status text not null,
  distributed_at timestamptz,
  distribution_details jsonb,
  message text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null,
  event_type text not null,
  payload jsonb not null,
  status text not null,
  response_code numeric,
  response_body text,
  retry_count numeric not null,
  max_retries numeric not null,
  next_retry_at timestamptz,
  delivered_at timestamptz,
  error_message text,
  created_at timestamptz not null
);

create table if not exists public.webhook_subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  url text not null,
  events text not null,
  secret text,
  is_active boolean not null,
  description text,
  failure_count numeric not null,
  last_triggered_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  headers jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

