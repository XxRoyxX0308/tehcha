-- ============================================================================
-- 得茶 Tehcha · sample data (IR-001). Loaded by `npm run db:seed` or automatically on the
-- first Vercel deploy into an empty database.
--
-- Accounts (UMS-F-007: staff and admin accounts are initial data):
--   admin        / admin1234   系統管理員, also staff of every store
--   staff_ntut   / staff1234   北科店
--   staff_xinyi  / staff1234   信義店
--   staff_dadao  / staff1234   大稻埕店
--   demo         / demo1234    顧客 (has order history and points)
--   cust01..24   / demo1234    顧客 (used to generate sales history)
-- Dates are relative to the day the seed runs, so the campaigns and reports always look current.
-- ============================================================================

BEGIN;

-- ─── Users and roles ───────────────────────────────────────────────────────
INSERT INTO users (login_id, name, password_hash, email, address, email_verified_at) VALUES
  ('admin',       '林經理', '$2b$10$WyxkSPezCdD46ihX6g9A5.ChhZGb15tQtACvEz8d6W0joj.1YIX.a', 'admin@tehcha.example',  NULL, now()),
  ('staff_ntut',  '陳店長', '$2b$10$rDzc4q6wKDBvVnKD2.b34u.PNQETNxGpi0YiKrMNypJa.0P8d2kjC', 'ntut@tehcha.example',   NULL, now()),
  ('staff_xinyi', '張店員', '$2b$10$rDzc4q6wKDBvVnKD2.b34u.PNQETNxGpi0YiKrMNypJa.0P8d2kjC', 'xinyi@tehcha.example',  NULL, now()),
  ('staff_dadao', '黃店員', '$2b$10$rDzc4q6wKDBvVnKD2.b34u.PNQETNxGpi0YiKrMNypJa.0P8d2kjC', 'dadao@tehcha.example',  NULL, now()),
  ('demo',        '王小明', '$2b$10$6Frt5fIKW.r2XkseziT77uq.8PzS61aZRSl6JseGSqQJloMKN9Weq', 'demo@tehcha.example',   '台北市大安區忠孝東路三段', now());

INSERT INTO users (login_id, name, password_hash, email, address, email_verified_at, created_at)
SELECT 'cust' || lpad(i::text, 2, '0'),
       (ARRAY['李佳穎','吳承恩','周子瑜','鄭宇翔','許雅婷','謝東霖','郭品妤','洪志明','曾怡君','廖子豪',
              '賴佩珊','蔡家豪','劉欣怡','楊冠廷','徐詩涵','蕭博文','何宜蓁','羅子傑','葉思妤','邱建宏',
              '潘佳蓉','簡志偉','游心怡','傅俊宇'])[i],
       '$2b$10$6Frt5fIKW.r2XkseziT77uq.8PzS61aZRSl6JseGSqQJloMKN9Weq',
       'cust' || lpad(i::text, 2, '0') || '@mail.example',
       (ARRAY['台北市大安區','台北市信義區','台北市大同區','台北市中山區','台北市松山區','台北市萬華區'])[1 + i % 6],
       now(), now() - make_interval(days => 70 + i)
FROM generate_series(1, 24) AS i;

INSERT INTO user_role (user_id, role)
SELECT user_id, 'admin' FROM users WHERE login_id = 'admin'
UNION ALL SELECT user_id, 'staff' FROM users WHERE login_id IN ('admin', 'staff_ntut', 'staff_xinyi', 'staff_dadao')
UNION ALL SELECT user_id, 'customer' FROM users WHERE login_id = 'demo' OR login_id LIKE 'cust%';

INSERT INTO member (user_id)
SELECT user_id FROM user_role WHERE role = 'customer' ORDER BY user_id;

-- ─── Stores (street and district only; contact details are stand-ins) ─────
INSERT INTO store (name, address, contact_email, phone) VALUES
  ('北科店',   '台北市大安區忠孝東路三段', 'ntut@tehcha.example',  '02-0000-0101'),
  ('信義店',   '台北市信義區松仁路',       'xinyi@tehcha.example', '02-0000-0202'),
  ('大稻埕店', '台北市大同區迪化街一段',   'dadao@tehcha.example', '02-0000-0303');

INSERT INTO store_staff (store_id, user_id)
SELECT s.store_id, u.user_id FROM store s CROSS JOIN users u WHERE u.login_id = 'admin'
UNION ALL SELECT 1, user_id FROM users WHERE login_id = 'staff_ntut'
UNION ALL SELECT 2, user_id FROM users WHERE login_id = 'staff_xinyi'
UNION ALL SELECT 3, user_id FROM users WHERE login_id = 'staff_dadao';

-- ─── Catalogue ──────────────────────────────────────────────────────────────
INSERT INTO category (name, name_en) VALUES
  ('原葉茶', 'Whole Leaf'), ('鮮奶茶', 'Milk Tea'), ('果茶', 'Fruit Tea'), ('本草', 'Herbal');

-- 1-5 sweetness, 6-10 ice, 11-14 toppings
INSERT INTO custom_option (type, name, extra_price) VALUES
  ('sweetness', '全糖', 0), ('sweetness', '少糖', 0), ('sweetness', '半糖', 0), ('sweetness', '微糖', 0), ('sweetness', '無糖', 0),
  ('ice', '正常冰', 0), ('ice', '少冰', 0), ('ice', '微冰', 0), ('ice', '去冰', 0), ('ice', '熱飲', 0),
  ('topping', '黑糖珍珠', 10), ('topping', '椰果', 10), ('topping', '仙草凍', 10), ('topping', '奶蓋', 20);

INSERT INTO product (category_id, name, name_en, tagline, description, price, art_tint, art_topping) VALUES
  (1, '阿里山烏龍',   'Alishan Oolong',          '山霧入盞，回甘綿長', '高山烏龍輕焙，花香清雅，尾韻回甘。',   55, '#C9A24A', 'none'),
  (1, '炭焙鐵觀音',   'Charcoal Tieguanyin',     '焙火沉香，一飲生津', '傳統炭焙，果香與焙香交織，口感厚實。', 55, '#9A6B34', 'none'),
  (1, '錫蘭紅茶',     'Ceylon Black',            '琥珀色裡，一抹澀甜', '濃郁紅茶，適合搭配任何配料。',         45, '#8A4B2A', 'none'),
  (1, '茉莉綠茶',     'Jasmine Green',           '茉莉初綻，雲淡風輕', '窨製茉莉花香，清爽不澀。',             45, '#B9B66A', 'none'),
  (2, '珍珠鮮奶茶',   'Pearl Milk Tea',          '茶入牛乳，珠沉杯底', '手工黑糖珍珠，搭配鮮奶與紅茶。',       70, '#B98C62', 'pearl'),
  (2, '桂花烏龍拿鐵', 'Osmanthus Oolong Latte',  '桂香滿袖，奶韻悠長', '桂花蜜與烏龍的溫柔組合。',             75, '#D9B66F', 'foam'),
  (2, '黑糖薑母鮮奶', 'Brown Sugar Ginger Milk', '暖薑入喉，冬日有光', '老薑熬製黑糖，搭配鮮奶。',             80, '#7A4A33', 'pearl'),
  (3, '金桔檸檬',     'Kumquat Lemon',           '酸甜如初見',         '手壓金桔與檸檬，清爽解膩。',           60, '#E0B93E', 'none'),
  (3, '蜜桃烏龍',     'Peach Oolong',            '桃影映茶，輕甜入夏', '白桃果醬與烏龍茶湯。',                 65, '#E3A58A', 'none'),
  (4, '枸杞紅棗茶',   'Goji & Red Date',         '紅果如珠，暖身安神', '紅棗與枸杞慢火熬煮，天然甘甜。',       65, '#A8452F', 'none'),
  (4, '仙草蜜',       'Grass Jelly Honey',       '清涼一盞，消暑解燥', '古法仙草凍搭配蜂蜜茶湯。',             55, '#4A3B2E', 'jelly'),
  (4, '洛神花茶',     'Roselle Tea',             '一抹胭脂，酸中帶甜', '洛神花與冰糖慢煮，色澤如胭脂。',       60, '#9C2F45', 'none');

-- Every drink offers all sweetness and ice levels; toppings differ.
INSERT INTO product_option (product_id, option_id)
SELECT p.product_id, o.option_id FROM product p CROSS JOIN custom_option o WHERE o.type IN ('sweetness', 'ice')
UNION ALL SELECT p, o FROM unnest(ARRAY[1, 2]) AS p, unnest(ARRAY[14]) AS o
UNION ALL SELECT p, o FROM unnest(ARRAY[3, 4, 5, 6]) AS p, unnest(ARRAY[11, 12, 13, 14]) AS o
UNION ALL SELECT 7, o FROM unnest(ARRAY[11, 14]) AS o
UNION ALL SELECT p, 12 FROM unnest(ARRAY[8, 9]) AS p
UNION ALL SELECT p, o FROM unnest(ARRAY[10, 11, 12]) AS p, unnest(ARRAY[12, 13]) AS o;

-- Stock: 金桔檸檬 is sold out at 信義店 and 桂花烏龍拿鐵 is below its safety level at 北科店.
INSERT INTO store_product (store_id, product_id, stock_qty, safety_qty)
SELECT s.store_id, p.product_id,
       CASE WHEN s.store_id = 2 AND p.product_id = 8 THEN 0
            WHEN s.store_id = 1 AND p.product_id = 6 THEN 4
            ELSE 40 + (s.store_id * 7 + p.product_id * 3) % 25 END,
       10
FROM store s CROSS JOIN product p;

-- ─── Discount policies (DIS-F-002) ──────────────────────────────────────────
INSERT INTO discount (discount_code, type, description, start_date, end_date, discount_rate, rule_type, min_purchase_amount)
SELECT code, type, descr, d0 + s, d0 + e, rate, rule, minp
FROM (VALUES
  ('SHP-FREE500', 'shipping',      '外送滿 NT$500 免運費',        -90, 365, NULL::numeric, NULL,       500::numeric),
  ('SEA-WINTER5', 'seasonal',      '冬日暖茶季 全單 95 折',        -7,  60,  0.05,          NULL,       NULL),
  ('SEA-AUTUMN',  'seasonal',      '秋茗季 全單 9 折（已結束）',   -80, -20, 0.10,          NULL,       NULL),
  ('EVT-OSMAN11', 'special_event', '桂花烏龍拿鐵 買一送一',       -3,  30,  NULL,          'buy1get1', NULL),
  ('EVT-PEACH15', 'special_event', '蜜桃烏龍 85 折',              0,   45,  0.15,          'rate',     NULL)
) AS v(code, type, descr, s, e, rate, rule, minp),
LATERAL (SELECT (now() AT TIME ZONE 'Asia/Taipei')::date AS d0) AS t;

INSERT INTO discount_product (discount_code, product_id) VALUES ('EVT-OSMAN11', 6), ('EVT-PEACH15', 9);

INSERT INTO app_setting (key, value) VALUES ('maintenance', '{"enabled": false, "message": ""}');

-- ─── 60 days of sales history (drives popular items, reports and the demo account) ───
DO $$
DECLARE
  today      DATE := (now() AT TIME ZONE 'Asia/Taipei')::date;
  d          DATE;
  st         RECORD;
  times      TIMESTAMPTZ[];
  t          TIMESTAMPTZ;
  n          INT;
  k          INT;
  lines      INT;
  members    INT[];
  demo_mid   INT;
  staff_uid  INT;
  v_member   INT;
  v_order    INT;
  v_item     INT;
  v_status   TEXT;
  v_ful      TEXT;
  v_sub      NUMERIC;
  v_tax      NUMERIC;
  v_ship     NUMERIC;
  v_disc     NUMERIC;
  v_total    NUMERIC;
  v_pid      INT;
  v_qty      INT;
  v_price    NUMERIC;
  l_pid      INT[];
  l_qty      INT[];
  l_sweet    INT[];
  l_ice      INT[];
  l_top      INT[];
  v_top      INT;
  age_min    NUMERIC;
  hours      INT[] := ARRAY[10,11,11,12,12,12,13,13,14,15,15,15,16,16,17,17,17,18,18,19,19,20,21];
  pool       INT[] := ARRAY[1,1,1,2,2,3,3,4,4,5,5,5,5,5,5,6,6,6,6,7,7,8,8,8,9,9,9,10,11,12,12];
  comments   TEXT[] := ARRAY['茶香很足，甜度剛好', '出餐很快，取餐順利', '珍珠Q彈，會再來', '店員很親切',
                             '冰塊有照指示調整，很貼心', '這次等比較久', NULL, NULL, '包裝很穩，外送沒有灑出來',
                             '烏龍很香，回甘明顯', '奶蓋偏甜了一點'];
BEGIN
  PERFORM setseed(0.4242);
  SELECT array_agg(m.member_id ORDER BY m.member_id) INTO members
  FROM member m JOIN users u USING (user_id) WHERE u.login_id LIKE 'cust%';
  SELECT m.member_id INTO demo_mid FROM member m JOIN users u USING (user_id) WHERE u.login_id = 'demo';

  FOR d IN SELECT generate_series(today - 59, today, interval '1 day')::date LOOP
    FOR st IN SELECT store_id FROM store ORDER BY store_id LOOP
      SELECT ss.user_id INTO staff_uid FROM store_staff ss JOIN users u USING (user_id)
      WHERE ss.store_id = st.store_id AND u.login_id <> 'admin' LIMIT 1;

      IF d < today THEN
        n := 7 + floor(random() * 9)::int + CASE WHEN extract(isodow FROM d) >= 6 THEN 5 ELSE 0 END;
        SELECT array_agg(x ORDER BY x) INTO times FROM (
          SELECT ((d + make_time(hours[1 + floor(random() * array_length(hours, 1))::int], floor(random() * 60)::int, 0))
                  AT TIME ZONE 'Asia/Taipei') AS x
          FROM generate_series(1, n)
        ) AS q;
      ELSE
        -- today: a steady stream over the last two hours, so the staff board has work on it
        n := 9;
        SELECT array_agg(x ORDER BY x) INTO times FROM (
          SELECT greatest(now() - make_interval(mins => (g * 13 + st.store_id * 2)),
                          (today::timestamp AT TIME ZONE 'Asia/Taipei') + make_interval(secs => g)) AS x
          FROM generate_series(0, n - 1) AS g
        ) AS q;
      END IF;

      FOR k IN 1 .. n LOOP
        t := times[k];
        v_member := CASE WHEN random() < 0.03 THEN demo_mid ELSE members[1 + floor(random() * array_length(members, 1))::int] END;
        v_ful := CASE WHEN random() < 0.22 THEN 'delivery' ELSE 'pickup' END;
        age_min := extract(epoch FROM now() - t) / 60;
        v_status := CASE
          WHEN d < today THEN CASE WHEN random() < 0.04 THEN 'cancelled' ELSE 'closed' END
          WHEN age_min > 75 THEN 'closed'
          WHEN age_min > 40 THEN 'shipping'
          WHEN age_min > 14 THEN 'processing'
          ELSE 'received' END;

        -- pick the lines first, so the order is inserted with its final amounts (they are frozen after)
        lines := 1 + floor(random() * random() * 3)::int;
        l_pid := '{}'; l_qty := '{}'; l_sweet := '{}'; l_ice := '{}'; l_top := '{}';
        v_sub := 0;
        FOR i IN 1 .. lines LOOP
          v_pid := pool[1 + floor(random() * array_length(pool, 1))::int];
          v_qty := CASE WHEN random() < 0.8 THEN 1 ELSE 2 END;
          v_top := NULL;
          IF random() < 0.35 THEN
            SELECT po.option_id INTO v_top FROM product_option po JOIN custom_option o USING (option_id)
            WHERE po.product_id = v_pid AND o.type = 'topping' ORDER BY random() LIMIT 1;
          END IF;
          l_pid := l_pid || v_pid;
          l_qty := l_qty || v_qty;
          l_sweet := l_sweet || (1 + floor(random() * 5)::int);
          l_ice := l_ice || (6 + floor(random() * 5)::int);
          l_top := l_top || coalesce(v_top, 0);
          SELECT price INTO v_price FROM product WHERE product_id = v_pid;
          v_sub := v_sub + (v_price + coalesce((SELECT extra_price FROM custom_option WHERE option_id = v_top), 0)) * v_qty;
        END LOOP;

        v_tax  := round(v_sub * 0.05);
        v_ship := CASE WHEN v_ful = 'delivery' THEN 60 ELSE 0 END;
        v_disc := CASE WHEN v_ful = 'delivery' AND v_sub >= 500 THEN 60 ELSE 0 END;
        v_total := v_sub + v_tax + v_ship - v_disc;

        INSERT INTO orders (member_id, store_id, order_time, fulfillment_type, delivery_address, pickup_no,
                            status, subtotal, tax, shipping_fee, discount_amount, points_used, total_amount)
        VALUES (v_member, st.store_id, t, v_ful,
                CASE WHEN v_ful = 'delivery' THEN (SELECT coalesce(u.address, '台北市大安區') FROM users u JOIN member m USING (user_id) WHERE m.member_id = v_member) END,
                k, 'received', v_sub, v_tax, v_ship, v_disc, 0, v_total)
        RETURNING order_id INTO v_order;

        FOR i IN 1 .. lines LOOP
          INSERT INTO order_item (order_id, product_id, product_name, unit_price, quantity)
          SELECT v_order, product_id, name, price, l_qty[i] FROM product WHERE product_id = l_pid[i]
          RETURNING order_item_id INTO v_item;
          INSERT INTO order_item_option (order_item_id, option_id, option_name, extra_price)
          SELECT v_item, option_id, name, extra_price FROM custom_option
          WHERE option_id IN (l_sweet[i], l_ice[i], l_top[i]);
        END LOOP;
        IF v_disc > 0 THEN
          INSERT INTO order_discount (order_id, discount_code, amount) VALUES (v_order, 'SHP-FREE500', v_disc);
        END IF;

        -- walk the order through the state machine (the status trigger checks every step)
        INSERT INTO order_status_log (order_id, status, changed_at, changed_by) VALUES (v_order, 'received', t, NULL);
        IF v_status = 'cancelled' THEN
          UPDATE orders SET status = 'cancelled' WHERE order_id = v_order;
          INSERT INTO order_status_log VALUES (v_order, 'cancelled', t + interval '1 minute', NULL);
        END IF;
        IF v_status IN ('processing', 'shipping', 'closed') THEN
          UPDATE orders SET status = 'processing' WHERE order_id = v_order;
          INSERT INTO order_status_log VALUES (v_order, 'processing', t + interval '3 minutes', staff_uid);
        END IF;
        IF v_status IN ('shipping', 'closed') THEN
          UPDATE orders SET status = 'shipping' WHERE order_id = v_order;
          INSERT INTO order_status_log VALUES (v_order, 'shipping', t + interval '9 minutes', staff_uid);
        END IF;
        IF v_status = 'closed' THEN
          UPDATE orders SET status = 'closed' WHERE order_id = v_order;
          INSERT INTO order_status_log VALUES (v_order, 'closed', t + interval '18 minutes', staff_uid);
          IF floor(v_total / 10) > 0 THEN   -- BR-003: NT$10 = 1 point, credited at close
            INSERT INTO point_log (member_id, order_id, points_change, reason, created_at)
            VALUES (v_member, v_order, floor(v_total / 10), 'earn', t + interval '18 minutes');
          END IF;
          IF random() < 0.22 THEN
            INSERT INTO review (order_id, rating, comment, created_at)
            VALUES (v_order, (ARRAY[5,5,5,5,4,4,4,3,5,4,2])[1 + floor(random() * 11)::int],
                    comments[1 + floor(random() * array_length(comments, 1))::int], t + interval '2 hours');
          END IF;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

COMMIT;
