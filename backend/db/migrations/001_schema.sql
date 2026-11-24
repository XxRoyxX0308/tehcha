-- ============================================================================
-- 得茶 Tehcha · 手搖飲管理系統 (BMS) · PostgreSQL schema
-- Follows SRS section 4.2. Changes against the SRS are marked  [SRS+] (added) or [SRS~] (changed).
-- All money is NT$, stored as NUMERIC; the business time zone is Asia/Taipei.
-- ============================================================================

-- ─── UMS 會員與權限 ──────────────────────────────────────────────────────────

CREATE TABLE users (
  user_id            SERIAL       PRIMARY KEY,
  login_id           VARCHAR(30)  NOT NULL UNIQUE
                     CHECK (login_id ~ '^[A-Za-z0-9_.-]{3,30}$'),
  name               VARCHAR(50)  NOT NULL CHECK (btrim(name) <> ''),
  password_hash      VARCHAR(255) NOT NULL,                       -- bcrypt (UMS-N-001)
  email              VARCHAR(100) NOT NULL CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  address            VARCHAR(200),                                -- staff / admin may leave it empty
  -- [SRS~] 0 正常, 1 停權 (suspended for a violation), 2 停用 (disabled, e.g. staff who left)
  status             SMALLINT     NOT NULL DEFAULT 0 CHECK (status IN (0, 1, 2)),
  email_verified_at  TIMESTAMPTZ,                                 -- [SRS+] UMS-F-003
  failed_login_count SMALLINT     NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),  -- [SRS+] UMS-N-003
  locked_until       TIMESTAMPTZ,                                 -- [SRS+] UMS-N-003
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()          -- [SRS~] TIMESTAMPTZ: servers run in UTC
);

-- Multi-valued attribute "role" (an admin can also be staff).
CREATE TABLE user_role (
  user_id INTEGER     NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  role    VARCHAR(10) NOT NULL CHECK (role IN ('customer', 'staff', 'admin')),
  PRIMARY KEY (user_id, role)
);

-- A customer's points account, 1:1 with USERS.
CREATE TABLE member (
  member_id      SERIAL  PRIMARY KEY,
  user_id        INTEGER NOT NULL UNIQUE REFERENCES users (user_id),
  points_balance INTEGER NOT NULL DEFAULT 0 CHECK (points_balance >= 0)   -- IC-005, kept by trigger
);

-- [SRS+] Admin warnings to an account (Scenario 3: 警告或停權), kept as history.
CREATE TABLE user_warning (
  warning_id SERIAL       PRIMARY KEY,
  user_id    INTEGER      NOT NULL REFERENCES users (user_id),
  issued_by  INTEGER      REFERENCES users (user_id),
  reason     VARCHAR(200) NOT NULL CHECK (btrim(reason) <> ''),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ─── PIS 門市、商品與庫存 ──────────────────────────────────────────────────

CREATE TABLE store (
  store_id      SERIAL       PRIMARY KEY,
  name          VARCHAR(50)  NOT NULL UNIQUE,
  address       VARCHAR(200) NOT NULL,
  contact_email VARCHAR(100) NOT NULL CHECK (contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone         VARCHAR(20)  NOT NULL
);

CREATE TABLE store_staff (
  store_id INTEGER NOT NULL REFERENCES store (store_id),
  user_id  INTEGER NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  PRIMARY KEY (store_id, user_id)
);

CREATE TABLE category (
  category_id SERIAL      PRIMARY KEY,
  name        VARCHAR(30) NOT NULL UNIQUE,
  name_en     VARCHAR(40)                                         -- [SRS+] bilingual menu labels
);

CREATE TABLE product (
  product_id  SERIAL        PRIMARY KEY,
  category_id INTEGER       NOT NULL REFERENCES category (category_id),
  name        VARCHAR(50)   NOT NULL CHECK (btrim(name) <> ''),
  name_en     VARCHAR(60),                                        -- [SRS+]
  tagline     VARCHAR(60),                                        -- [SRS+] one-line menu blurb
  description TEXT,
  image_url   VARCHAR(255),
  -- [SRS+] when image_url is empty the menu draws a cup in this liquid colour with this topping
  art_tint    CHAR(7)       NOT NULL DEFAULT '#B98C62' CHECK (art_tint ~ '^#[0-9A-Fa-f]{6}$'),
  art_topping VARCHAR(5)    NOT NULL DEFAULT 'none' CHECK (art_topping IN ('none', 'pearl', 'jelly', 'foam')),
  price       NUMERIC(8, 2) NOT NULL CHECK (price >= 0),          -- IC-003
  is_deleted  BOOLEAN       NOT NULL DEFAULT false,               -- soft delete (PIS-F-001, DBS-F-003)
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX product_category_idx ON product (category_id) WHERE NOT is_deleted;

-- Store × Product: stock per store.
CREATE TABLE store_product (
  store_id   INTEGER NOT NULL REFERENCES store (store_id),
  product_id INTEGER NOT NULL REFERENCES product (product_id),
  stock_qty  INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),   -- IC-003: never negative (TR-003)
  safety_qty INTEGER NOT NULL DEFAULT 0 CHECK (safety_qty >= 0),
  PRIMARY KEY (store_id, product_id)
);

CREATE TABLE custom_option (
  option_id   SERIAL        PRIMARY KEY,
  type        VARCHAR(10)   NOT NULL CHECK (type IN ('sweetness', 'ice', 'topping')),
  name        VARCHAR(30)   NOT NULL CHECK (btrim(name) <> ''),
  extra_price NUMERIC(6, 2) NOT NULL DEFAULT 0 CHECK (extra_price >= 0),  -- IC-003
  is_deleted  BOOLEAN       NOT NULL DEFAULT false,               -- [SRS+] options used by past orders stay
  UNIQUE (type, name)
);

CREATE TABLE product_option (
  product_id INTEGER NOT NULL REFERENCES product (product_id) ON DELETE CASCADE,
  option_id  INTEGER NOT NULL REFERENCES custom_option (option_id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, option_id)
);

-- ─── SCMS 購物車 ────────────────────────────────────────────────────────────

CREATE TABLE cart_item (
  cart_item_id SERIAL      PRIMARY KEY,
  member_id    INTEGER     NOT NULL REFERENCES member (member_id) ON DELETE CASCADE,
  store_id     INTEGER     NOT NULL,
  product_id   INTEGER     NOT NULL,
  quantity     INTEGER     NOT NULL CHECK (quantity > 0),         -- IC-007
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- the store must actually sell the product
  FOREIGN KEY (store_id, product_id) REFERENCES store_product (store_id, product_id)
);
CREATE INDEX cart_item_member_idx ON cart_item (member_id, store_id);

CREATE TABLE cart_item_option (
  cart_item_id INTEGER NOT NULL REFERENCES cart_item (cart_item_id) ON DELETE CASCADE,
  option_id    INTEGER NOT NULL REFERENCES custom_option (option_id),
  PRIMARY KEY (cart_item_id, option_id)
);

-- ─── DIS 折扣政策 ───────────────────────────────────────────────────────────

CREATE TABLE discount (
  discount_code       VARCHAR(20)    PRIMARY KEY,                -- system-assigned (DIS-F-001)
  -- [SRS~] 'seasonings' in the SRS is a typo for 'seasonal'
  type                VARCHAR(15)    NOT NULL CHECK (type IN ('shipping', 'seasonal', 'special_event')),
  description         VARCHAR(200)   NOT NULL CHECK (btrim(description) <> ''),
  start_date          DATE           NOT NULL,
  end_date            DATE           NOT NULL,
  -- fraction taken off: 0.100 = 10% off (9 折)
  discount_rate       NUMERIC(4, 3)  CHECK (discount_rate > 0 AND discount_rate <= 1),
  rule_type           VARCHAR(10)    CHECK (rule_type IN ('rate', 'buy1get1')),
  min_purchase_amount NUMERIC(10, 2) CHECK (min_purchase_amount >= 0),
  is_deleted          BOOLEAN        NOT NULL DEFAULT false,     -- [SRS+] past orders keep their discount
  created_at          TIMESTAMPTZ    NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),                                -- IC-006
  -- the fields each type needs (DIS-F-002..005)
  CHECK (
       (type = 'shipping'      AND min_purchase_amount IS NOT NULL AND discount_rate IS NULL AND rule_type IS NULL)
    OR (type = 'seasonal'      AND discount_rate IS NOT NULL AND rule_type IS NULL)
    OR (type = 'special_event' AND rule_type IS NOT NULL
                               AND (rule_type = 'buy1get1') = (discount_rate IS NULL))
  )
);

-- Products a special-event discount applies to.
CREATE TABLE discount_product (
  discount_code VARCHAR(20) NOT NULL REFERENCES discount (discount_code) ON DELETE CASCADE,
  product_id    INTEGER     NOT NULL REFERENCES product (product_id),
  PRIMARY KEY (discount_code, product_id)
);
CREATE INDEX discount_product_product_idx ON discount_product (product_id);

-- ─── OCS 訂單 ───────────────────────────────────────────────────────────────

CREATE TABLE orders (
  order_id         SERIAL         PRIMARY KEY,
  member_id        INTEGER        NOT NULL REFERENCES member (member_id),
  store_id         INTEGER        NOT NULL REFERENCES store (store_id),
  order_time       TIMESTAMPTZ    NOT NULL DEFAULT now(),
  fulfillment_type VARCHAR(10)    NOT NULL CHECK (fulfillment_type IN ('pickup', 'delivery')),   -- IC-004
  delivery_address VARCHAR(200),
  pickup_no        INTEGER        NOT NULL CHECK (pickup_no > 0),
  -- [SRS~] 'cancelled' added: OCS-F-006 lets a customer cancel, which the four SRS states can't express
  status           VARCHAR(10)    NOT NULL DEFAULT 'received'
                   CHECK (status IN ('received', 'processing', 'shipping', 'closed', 'cancelled')),    -- IC-004
  subtotal         NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0),
  tax              NUMERIC(10, 2) NOT NULL CHECK (tax >= 0),
  shipping_fee     NUMERIC(10, 2) NOT NULL CHECK (shipping_fee >= 0),
  discount_amount  NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  points_used      INTEGER        NOT NULL DEFAULT 0 CHECK (points_used >= 0),
  total_amount     NUMERIC(10, 2) NOT NULL CHECK (total_amount >= 0),
  CHECK (fulfillment_type = 'pickup' OR btrim(coalesce(delivery_address, '')) <> ''),   -- delivery needs an address
  CHECK (fulfillment_type = 'delivery' OR shipping_fee = 0),                            -- pickup ships free
  CHECK (total_amount = subtotal + tax + shipping_fee - discount_amount - points_used) -- BR-002
);
CREATE INDEX orders_store_status_idx ON orders (store_id, status, order_time);
CREATE INDEX orders_member_idx ON orders (member_id, order_time DESC);
CREATE INDEX orders_time_idx ON orders (order_time);
-- Pickup numbers restart every business day per store.
CREATE UNIQUE INDEX orders_pickup_no_uq ON orders (store_id, ((order_time AT TIME ZONE 'Asia/Taipei')::date), pickup_no);

CREATE TABLE order_item (
  order_item_id SERIAL        PRIMARY KEY,
  order_id      INTEGER       NOT NULL REFERENCES orders (order_id) ON DELETE CASCADE,
  product_id    INTEGER       NOT NULL REFERENCES product (product_id),   -- products are soft-deleted only (IC-002)
  product_name  VARCHAR(50)   NOT NULL,                                   -- name at order time
  unit_price    NUMERIC(8, 2) NOT NULL CHECK (unit_price >= 0),           -- base price at order time
  quantity      INTEGER       NOT NULL CHECK (quantity > 0)               -- IC-007
);
CREATE INDEX order_item_order_idx ON order_item (order_id);
CREATE INDEX order_item_product_idx ON order_item (product_id);

CREATE TABLE order_item_option (
  order_item_id INTEGER       NOT NULL REFERENCES order_item (order_item_id) ON DELETE CASCADE,
  option_id     INTEGER       NOT NULL REFERENCES custom_option (option_id),
  option_name   VARCHAR(30)   NOT NULL,
  extra_price   NUMERIC(6, 2) NOT NULL CHECK (extra_price >= 0),
  PRIMARY KEY (order_item_id, option_id)
);

CREATE TABLE order_discount (
  order_id      INTEGER        NOT NULL REFERENCES orders (order_id) ON DELETE CASCADE,
  discount_code VARCHAR(20)    NOT NULL REFERENCES discount (discount_code),
  amount        NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  PRIMARY KEY (order_id, discount_code)
);

-- [SRS+] When each step was reached and by whom (drives the customer's tracker and audits the board).
CREATE TABLE order_status_log (
  order_id   INTEGER     NOT NULL REFERENCES orders (order_id) ON DELETE CASCADE,
  status     VARCHAR(10) NOT NULL CHECK (status IN ('received', 'processing', 'shipping', 'closed', 'cancelled')),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by INTEGER     REFERENCES users (user_id),
  PRIMARY KEY (order_id, status)
);

-- ─── DIS 點數 ───────────────────────────────────────────────────────────────

CREATE TABLE point_log (
  log_id        SERIAL      PRIMARY KEY,
  member_id     INTEGER     NOT NULL REFERENCES member (member_id),
  order_id      INTEGER     REFERENCES orders (order_id),          -- null for manual adjustments
  points_change INTEGER     NOT NULL CHECK (points_change <> 0),
  reason        VARCHAR(20) NOT NULL CHECK (reason IN ('earn', 'redeem', 'refund', 'adjust')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (   (reason IN ('earn', 'refund') AND points_change > 0)
         OR (reason = 'redeem' AND points_change < 0)
         OR  reason = 'adjust')
);
CREATE INDEX point_log_member_idx ON point_log (member_id, created_at DESC);
-- An order earns, redeems and refunds at most once each (a double click can't double-credit).
CREATE UNIQUE INDEX point_log_once_per_order_uq ON point_log (order_id, reason) WHERE order_id IS NOT NULL AND reason <> 'adjust';

-- ─── SRMS 門市評論 ──────────────────────────────────────────────────────────

CREATE TABLE review (
  review_id  SERIAL      PRIMARY KEY,
  order_id   INTEGER     NOT NULL UNIQUE REFERENCES orders (order_id),   -- one review per order (IC-008)
  rating     SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),        -- IC-008
  comment    TEXT        CHECK (char_length(comment) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── DBS 備份與系統設定 ─────────────────────────────────────────────────────

-- [SRS+] Logical backups (DBS-F-002, DBS-N-002). No foreign keys, so a restore never touches them.
CREATE TABLE backup_snapshot (
  backup_id  SERIAL      PRIMARY KEY,
  kind       VARCHAR(12) NOT NULL CHECK (kind IN ('auto', 'manual', 'pre-restore')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by VARCHAR(30),                       -- login_id, kept as text on purpose
  size_bytes INTEGER     NOT NULL,
  row_counts JSONB       NOT NULL,
  payload    BYTEA       NOT NULL               -- gzip of the JSON dump
);

-- [SRS+] Maintenance switch (BMS-N-005) and similar flags.
CREATE TABLE app_setting (
  key        VARCHAR(40) PRIMARY KEY,
  value      JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- Triggers: rules the database enforces on its own, whatever client writes.
-- ============================================================================

-- BR-001: received → processing → shipping → closed, no skipping or going back.
-- BR-006: only a 'received' order can be cancelled.
CREATE FUNCTION orders_status_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF    (OLD.status = 'received'   AND NEW.status IN ('processing', 'cancelled'))
     OR (OLD.status = 'processing' AND NEW.status = 'shipping')
     OR (OLD.status = 'shipping'   AND NEW.status = 'closed') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'order % cannot go from % to %', OLD.order_id, OLD.status, NEW.status
    USING ERRCODE = 'check_violation', HINT = 'status_transition';
END $$;
CREATE TRIGGER orders_status_guard BEFORE UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_status_guard();

-- The money columns of an order are a receipt: they never change after it is placed.
CREATE FUNCTION orders_amounts_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.subtotal, NEW.tax, NEW.shipping_fee, NEW.discount_amount, NEW.points_used, NEW.total_amount,
      NEW.member_id, NEW.store_id)
     IS DISTINCT FROM
     (OLD.subtotal, OLD.tax, OLD.shipping_fee, OLD.discount_amount, OLD.points_used, OLD.total_amount,
      OLD.member_id, OLD.store_id) THEN
    RAISE EXCEPTION 'order % amounts are final', OLD.order_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orders_amounts_frozen BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_amounts_frozen();

-- IC-005: points_balance always equals the sum of the member's POINT_LOG.
-- The ledger is append-only; the balance CHECK (>= 0) stops overspending, even under concurrency.
CREATE FUNCTION point_log_apply() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE member SET points_balance = points_balance + NEW.points_change WHERE member_id = NEW.member_id;
  RETURN NEW;
END $$;
CREATE TRIGGER point_log_apply AFTER INSERT ON point_log
  FOR EACH ROW EXECUTE FUNCTION point_log_apply();

CREATE FUNCTION point_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'point_log is append-only; insert an adjust row instead' USING ERRCODE = 'restrict_violation';
END $$;
CREATE TRIGGER point_log_immutable BEFORE UPDATE OR DELETE ON point_log
  FOR EACH ROW EXECUTE FUNCTION point_log_immutable();

-- BR-012: a review only for a closed order.
CREATE FUNCTION review_requires_closed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM orders WHERE order_id = NEW.order_id AND status = 'closed') THEN
    RAISE EXCEPTION 'order % is not closed', NEW.order_id USING ERRCODE = 'check_violation', HINT = 'review_not_closed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER review_requires_closed BEFORE INSERT ON review
  FOR EACH ROW EXECUTE FUNCTION review_requires_closed();

-- DIS-F-007 / BR-010 / BR-011: a product has at most one special event at any time,
-- and only special events list products. Checked when a product is linked and when a
-- discount's dates change or it is restored.
CREATE FUNCTION special_event_conflict(p_code VARCHAR, p_product INTEGER) RETURNS VARCHAR
LANGUAGE sql STABLE AS $$
  SELECT d2.discount_code
  FROM discount d1
  JOIN discount_product dp2 ON dp2.product_id = p_product AND dp2.discount_code <> d1.discount_code
  JOIN discount d2 ON d2.discount_code = dp2.discount_code
  WHERE d1.discount_code = p_code
    AND NOT d1.is_deleted AND NOT d2.is_deleted
    AND d2.type = 'special_event'
    AND d1.start_date <= d2.end_date AND d2.start_date <= d1.end_date
  LIMIT 1
$$;

CREATE FUNCTION discount_product_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  clash VARCHAR;
BEGIN
  IF (SELECT type FROM discount WHERE discount_code = NEW.discount_code) <> 'special_event' THEN
    RAISE EXCEPTION 'only special-event discounts list products' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM pg_advisory_xact_lock(7311, NEW.product_id);   -- serialise concurrent links of one product
  clash := special_event_conflict(NEW.discount_code, NEW.product_id);
  IF clash IS NOT NULL THEN
    RAISE EXCEPTION 'product % already has special event % in that period', NEW.product_id, clash
      USING ERRCODE = 'exclusion_violation', HINT = 'special_event_overlap', DETAIL = clash;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER discount_product_guard BEFORE INSERT OR UPDATE ON discount_product
  FOR EACH ROW EXECUTE FUNCTION discount_product_guard();

CREATE FUNCTION discount_period_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  p     INTEGER;
  clash VARCHAR;
BEGIN
  IF NEW.type <> 'special_event' OR NEW.is_deleted THEN
    RETURN NEW;
  END IF;
  FOR p IN SELECT product_id FROM discount_product WHERE discount_code = NEW.discount_code LOOP
    PERFORM pg_advisory_xact_lock(7311, p);
    clash := special_event_conflict(NEW.discount_code, p);
    IF clash IS NOT NULL THEN
      RAISE EXCEPTION 'product % already has special event % in that period', p, clash
        USING ERRCODE = 'exclusion_violation', HINT = 'special_event_overlap', DETAIL = clash;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER discount_period_guard AFTER UPDATE OF start_date, end_date, is_deleted ON discount
  FOR EACH ROW EXECUTE FUNCTION discount_period_guard();

-- ============================================================================
-- Views used by search and reports.
-- ============================================================================

-- Orders that count as sales (not cancelled), with the local business time.
CREATE VIEW sales_order AS
SELECT o.*, (o.order_time AT TIME ZONE 'Asia/Taipei') AS local_time
FROM orders o
WHERE o.status <> 'cancelled';

-- Cups sold per product (drives "popular", SRMS-F-003).
CREATE VIEW product_sales AS
SELECT oi.product_id, SUM(oi.quantity)::INTEGER AS qty
FROM order_item oi
JOIN orders o ON o.order_id = oi.order_id AND o.status <> 'cancelled'
GROUP BY oi.product_id;

-- Average rating per store (SRMS-F-007).
CREATE VIEW store_rating AS
SELECT s.store_id, ROUND(AVG(r.rating)::NUMERIC, 2) AS avg_rating, COUNT(r.review_id)::INTEGER AS review_count
FROM store s
LEFT JOIN orders o ON o.store_id = s.store_id
LEFT JOIN review r ON r.order_id = o.order_id
GROUP BY s.store_id;

-- Each order line with its option surcharges: (base price + options) × quantity, before discounts.
CREATE VIEW order_line AS
SELECT oi.order_item_id, oi.order_id, oi.product_id, oi.product_name, oi.unit_price, oi.quantity,
       COALESCE(x.options_extra, 0) AS options_extra,
       (oi.unit_price + COALESCE(x.options_extra, 0)) * oi.quantity AS line_total
FROM order_item oi
LEFT JOIN (SELECT order_item_id, SUM(extra_price) AS options_extra FROM order_item_option GROUP BY order_item_id) x
  ON x.order_item_id = oi.order_item_id;
