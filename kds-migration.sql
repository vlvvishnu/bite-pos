-- ╔══════════════════════════════════════════════════════════════╗
-- ║  BITE. POS — KDS Migration                                  ║
-- ║  Run in Supabase → SQL Editor                               ║
-- ╚══════════════════════════════════════════════════════════════╝

-- 1. Add KDS status columns to orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_type    text    DEFAULT 'take',
  ADD COLUMN IF NOT EXISTS table_number  text,
  ADD COLUMN IF NOT EXISTS preparing_at  timestamptz,
  ADD COLUMN IF NOT EXISTS ready_at      timestamptz,
  ADD COLUMN IF NOT EXISTS served_at     timestamptz;

-- Update status check to allow new KDS statuses
-- (pending → preparing → ready → paid/served)

-- 2. Create kot_rejections table (audit log)
CREATE TABLE IF NOT EXISTS kot_rejections (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    uuid REFERENCES tenants(id) ON DELETE CASCADE,
  order_id     uuid REFERENCES orders(id)  ON DELETE CASCADE,
  item_id      uuid,
  item_name    text NOT NULL,
  reason       text DEFAULT 'unavailable',
  rejected_at  timestamptz DEFAULT now(),
  resolved_at  timestamptz,
  resolved_by  text
);

CREATE INDEX IF NOT EXISTS idx_kot_rejections_order
  ON kot_rejections(order_id);

CREATE INDEX IF NOT EXISTS idx_kot_rejections_tenant
  ON kot_rejections(tenant_id, rejected_at DESC);

-- 3. RLS for kot_rejections
ALTER TABLE kot_rejections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read own tenant rejections"
  ON kot_rejections FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Staff insert own tenant rejections"
  ON kot_rejections FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

-- 4. Enable realtime for orders (for KDS live updates)
-- Run this in Supabase Dashboard → Database → Replication
-- or via SQL:
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

-- 5. Indexes for KDS queries
CREATE INDEX IF NOT EXISTS idx_orders_kds
  ON orders(tenant_id, status, created_at)
  WHERE status IN ('pending','preparing','ready');

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'orders'
  AND column_name IN ('order_type','table_number','preparing_at','ready_at','served_at');
