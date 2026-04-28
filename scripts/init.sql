-- ============================================
-- One Piece Kubernetes TP — Database Init
-- ============================================

-- CREWS
CREATE TABLE IF NOT EXISTS crews (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  jolly_roger VARCHAR(255),
  home_island VARCHAR(100),
  bounty_total BIGINT DEFAULT 0,
  ship_id     INT,
  status      VARCHAR(50) DEFAULT 'active',
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- CHARACTERS
CREATE TABLE IF NOT EXISTS characters (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  alias           VARCHAR(100),
  role            VARCHAR(100),
  bounty          BIGINT DEFAULT 0,
  affiliation     VARCHAR(100),
  crew_id         INT REFERENCES crews(id) ON DELETE SET NULL,
  devil_fruit_id  INT,
  haki_types      TEXT[],
  origin_island   VARCHAR(100),
  age             INT,
  height_cm       INT,
  status          VARCHAR(50) DEFAULT 'alive',
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- DEVIL FRUITS
CREATE TABLE IF NOT EXISTS devil_fruits (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  type        VARCHAR(50) NOT NULL CHECK (type IN ('Paramecia', 'Zoan', 'Logia')),
  ability     TEXT,
  weakness    TEXT DEFAULT 'Seawater and Sea Prism Stone',
  owner_id    INT REFERENCES characters(id) ON DELETE SET NULL,
  is_awakened BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- SHIPS
CREATE TABLE IF NOT EXISTS ships (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  type        VARCHAR(100),
  crew_id     INT REFERENCES crews(id) ON DELETE SET NULL,
  speed_knots INT,
  cannons     INT DEFAULT 0,
  special     TEXT,
  status      VARCHAR(50) DEFAULT 'sailing',
  created_at  TIMESTAMP DEFAULT NOW()
);

-- BATTLES (log)
CREATE TABLE IF NOT EXISTS battles (
  id              SERIAL PRIMARY KEY,
  attacker_id     INT NOT NULL,
  defender_id     INT NOT NULL,
  attacker_name   VARCHAR(100),
  defender_name   VARCHAR(100),
  winner_id       INT,
  winner_name     VARCHAR(100),
  location        VARCHAR(100),
  technique_used  VARCHAR(100),
  damage_dealt    INT,
  duration_ms     INT,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ─── SEED DATA ─────────────────────────────────────────────────────

-- Crews
INSERT INTO crews (name, jolly_roger, home_island, bounty_total, status) VALUES
  ('Straw Hat Pirates',   '💀🎩', 'East Blue',     '3,161,000,100', 'active'),
  ('Whitebeard Pirates',  '💀✨', 'New World',     '5,000,000,000', 'disbanded'),
  ('Big Mom Pirates',     '💀🍭', 'Totto Land',    '4,388,000,000', 'active'),
  ('Beasts Pirates',      '💀🐉', 'Wano',          '9,400,000,100', 'defeated'),
  ('Heart Pirates',       '💀❤️', 'North Blue',    '500,000,000',   'active')
ON CONFLICT DO NOTHING;

-- Devil Fruits
INSERT INTO devil_fruits (name, type, ability, is_awakened) VALUES
  ('Gomu Gomu no Mi',   'Paramecia', 'Grants the user a rubber body',                        TRUE),
  ('Mera Mera no Mi',   'Logia',     'Grants the ability to create and control fire',         FALSE),
  ('Hie Hie no Mi',     'Logia',     'Grants the ability to create and control ice',          FALSE),
  ('Ope Ope no Mi',     'Paramecia', 'Grants the ability to create a spherical room',         FALSE),
  ('Gura Gura no Mi',   'Paramecia', 'Grants the ability to create shock waves',              TRUE),
  ('Yami Yami no Mi',   'Logia',     'Grants the ability to control darkness',                FALSE),
  ('Tori Tori no Mi',   'Zoan',      'Grants the ability to transform into a phoenix',        TRUE),
  ('Suna Suna no Mi',   'Logia',     'Grants the ability to control sand',                    FALSE),
  ('Pika Pika no Mi',   'Logia',     'Grants the ability to create and control light',        FALSE),
  ('Magu Magu no Mi',   'Logia',     'Grants the ability to create and control magma',        FALSE)
ON CONFLICT DO NOTHING;

-- Characters
INSERT INTO characters (name, alias, role, bounty, affiliation, crew_id, devil_fruit_id, haki_types, origin_island, age, height_cm) VALUES
  ('Monkey D. Luffy',   'Straw Hat',       'Captain',      '3,000,000,000', 'Straw Hat Pirates', 1, 1, ARRAY['Haoshoku','Busoshoku','Kenbunshoku'], 'Foosha Village', 19, 174),
  ('Roronoa Zoro',      'Pirate Hunter',   'Swordsman',      '320,000,000', 'Straw Hat Pirates', 1, NULL, ARRAY['Busoshoku','Kenbunshoku'], 'Shimotsuki Village', 21, 181),
  ('Nami',              'Cat Burglar',     'Navigator',       '66,000,000', 'Straw Hat Pirates', 1, NULL, ARRAY[]::TEXT[], 'Cocoyasi Village', 20, 170),
  ('Usopp',             'God Usopp',       'Sniper',          '200,000,000', 'Straw Hat Pirates', 1, NULL, ARRAY['Kenbunshoku'], 'Syrup Village', 19, 176),
  ('Sanji',             'Black Leg',       'Cook',            '330,000,000', 'Straw Hat Pirates', 1, NULL, ARRAY['Busoshoku','Kenbunshoku'], 'North Blue', 21, 180),
  ('Tony Tony Chopper', 'Cotton Candy',    'Doctor',          '100',         'Straw Hat Pirates', 1, NULL, ARRAY[]::TEXT[], 'Drum Island', 17, 90),
  ('Nico Robin',        'Devil Child',     'Archaeologist',   '130,000,000', 'Straw Hat Pirates', 1, NULL, ARRAY['Busoshoku'], 'Ohara', 30, 188),
  ('Franky',            'Cyborg',          'Shipwright',      '94,000,000',  'Straw Hat Pirates', 1, NULL, ARRAY['Busoshoku'], 'South Blue', 36, 225),
  ('Brook',             'Soul King',       'Musician',        '83,000,000',  'Straw Hat Pirates', 1, NULL, ARRAY['Busoshoku'], 'West Blue', 90, 277),
  ('Trafalgar Law',     'Surgeon of Death','Captain',         '500,000,000', 'Heart Pirates',     5, 4, ARRAY['Busoshoku','Kenbunshoku'], 'North Blue', 26, 191)
ON CONFLICT DO NOTHING;

-- Link devil fruits to owners
UPDATE devil_fruits SET owner_id = (SELECT id FROM characters WHERE name = 'Monkey D. Luffy')   WHERE name = 'Gomu Gomu no Mi';
UPDATE devil_fruits SET owner_id = (SELECT id FROM characters WHERE name = 'Trafalgar Law')      WHERE name = 'Ope Ope no Mi';

-- Ships
INSERT INTO ships (name, type, crew_id, speed_knots, cannons, special, status) VALUES
  ('Thousand Sunny',  'Brigantine',   1, 30, 20, 'Coup de Burst – air cannon propulsion', 'sailing'),
  ('Polar Tang',      'Submarine',    5, 20, 10, 'Operates underwater',                   'sailing'),
  ('Queen Mama Chanter', 'Caravel',   3, 25, 40, 'Giant ship of Big Mom Pirates',          'sailing'),
  ('Moby Dick',       'Whaling ship', 2, 18, 50, 'Flagship of Whitebeard',                 'destroyed')
ON CONFLICT DO NOTHING;

-- Update crew ship links
UPDATE crews SET ship_id = (SELECT id FROM ships WHERE name = 'Thousand Sunny')     WHERE name = 'Straw Hat Pirates';
UPDATE crews SET ship_id = (SELECT id FROM ships WHERE name = 'Polar Tang')         WHERE name = 'Heart Pirates';
