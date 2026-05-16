'use strict';
const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'crm.db');
const DB   = new Database(DB_PATH);

DB.pragma('journal_mode = WAL');
DB.pragma('foreign_keys = ON');
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'loop-logistics.html'));
});

/* ═══════════════════════════════════════════════
   SCHEMA
═══════════════════════════════════════════════ */
DB.exec(`
  CREATE TABLE IF NOT EXISTS parts (
    part_id       TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    category      TEXT NOT NULL,
    current_stock INTEGER NOT NULL DEFAULT 0,
    min_threshold INTEGER NOT NULL DEFAULT 0,
    lifespan_logic TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS clients (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    company      TEXT NOT NULL DEFAULT '',
    email        TEXT NOT NULL DEFAULT '',
    phone        TEXT NOT NULL DEFAULT '',
    tags         TEXT NOT NULL DEFAULT '[]',
    orders_count INTEGER NOT NULL DEFAULT 0,
    value        TEXT NOT NULL DEFAULT '$0',
    created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS client_parts (
    client_id        TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    part_id          TEXT NOT NULL REFERENCES parts(part_id) ON DELETE CASCADE,
    qty              INTEGER NOT NULL DEFAULT 0,
    min_qty          INTEGER NOT NULL DEFAULT 0,
    refill_qty       INTEGER NOT NULL DEFAULT 0,
    lifespan_days    INTEGER,
    last_delivered_at TEXT,
    PRIMARY KEY (client_id, part_id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    order_id     TEXT PRIMARY KEY,
    client_id    TEXT NOT NULL REFERENCES clients(id),
    client_name  TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending',
    auto_refill  INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    shipped_at   TEXT,
    delivered_at TEXT
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id   TEXT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    part_id    TEXT NOT NULL,
    part_name  TEXT NOT NULL,
    qty        INTEGER NOT NULL,
    fulfilled  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         TEXT NOT NULL,
    type       TEXT NOT NULL,
    msg        TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

/* ═══════════════════════════════════════════════
   SEED DATA (runs once if parts table is empty)
═══════════════════════════════════════════════ */
const seed = DB.transaction(() => {
  const parts = [
    ['PRT-0001','Ethernet Cable Cat6',        'Cables',      4,  10, ''],
    ['PRT-0002','M8 Hex Bolt Pack (x50)',     'Hardware',    2,  50, ''],
    ['PRT-0003','Bubble Wrap Roll 50m',       'Packaging',  88,  20, '90d'],
    ['PRT-0004','Torque Wrench 3/8"',         'Tools',       6,   2, ''],
    ['PRT-0005','AA Alkaline Battery (x10)',  'Batteries',   3,  30, '365d'],
    ['PRT-0006','Isopropyl Alcohol 1L',       'Chemicals',  15,   5, '730d'],
    ['PRT-0007','Raspberry Pi 4B',            'Electronics', 9,  10, ''],
    ['PRT-0008','PVC Conduit 20mm x 3m',      'Pipes',     120,  25, ''],
    ['PRT-0009','A4 Copy Paper Ream',         'Office',      7,  15, ''],
    ['PRT-0010','Red Clay Brick',             'Bricks',    500, 100, ''],
    ['PRT-0011','HDMI Cable 2m v2.1',         'Cables',     22,   8, ''],
    ['PRT-0012','M6 Stainless Nut (x100)',    'Hardware',    8,  40, ''],
    ['PRT-0013','Cardboard Box Large 600mm',  'Packaging',  65,  30, ''],
    ['PRT-0014','Digital Multimeter 600V',    'Tools',       4,   3, ''],
    ['PRT-0015','18650 Li-Ion Cell 3.7V',     'Batteries',   0,  20, '500-cycle'],
    ['PRT-0016','Acetone Solvent 500ml',      'Chemicals',  11,   4, '365d'],
    ['PRT-0017','Arduino Uno R3',             'Electronics',18,   5, ''],
    ['PRT-0018','Copper Pipe 15mm x 2m',      'Pipes',      44,  10, ''],
    ['PRT-0019','Stapler Heavy Duty 23/8',    'Office',      2,   5, ''],
    ['PRT-0020','Concrete Block 4" Hollow',   'Bricks',    340,  80, ''],
  ];
  const insPart = DB.prepare(
    'INSERT OR IGNORE INTO parts (part_id,name,category,current_stock,min_threshold,lifespan_logic) VALUES (?,?,?,?,?,?)'
  );
  parts.forEach(p => insPart.run(...p));

  const clients = [
    {id:'CLT-001',name:'Marcus Webb',     company:'Webb Industrial',      email:'m.webb@webb.ind',     phone:'+1 555 0101',tags:['Wholesale','VIP'],          orders_count:14,value:'$32,400',
     cp:[{pid:'PRT-0002',qty:8, min:20,rfq:50, ld:'2026-02-10',ld_days:null},
         {pid:'PRT-0008',qty:35,min:15,rfq:30, ld:'2026-03-01',ld_days:null},
         {pid:'PRT-0010',qty:80,min:100,rfq:200,ld:'2026-01-15',ld_days:null},
         {pid:'PRT-0012',qty:0, min:15,rfq:50, ld:'2025-12-20',ld_days:null},
         {pid:'PRT-0018',qty:20,min:10,rfq:20, ld:'2026-04-01',ld_days:null}]},
    {id:'CLT-002',name:'Sara Lin',        company:'LinTech Supply',       email:'sara@lintech.io',     phone:'+1 555 0182',tags:['Retail','Priority'],        orders_count:7,value:'$9,820',
     cp:[{pid:'PRT-0001',qty:5, min:8, rfq:15,ld:'2026-03-20',ld_days:null},
         {pid:'PRT-0007',qty:0, min:3, rfq:5, ld:'2025-11-01',ld_days:null},
         {pid:'PRT-0011',qty:12,min:5, rfq:10,ld:'2026-04-10',ld_days:null},
         {pid:'PRT-0017',qty:8, min:4, rfq:8, ld:'2026-04-05',ld_days:null}]},
    {id:'CLT-003',name:'David Okafor',    company:'BuildRight LLC',       email:'d.okafor@br.com',     phone:'+1 555 0233',tags:['Construction','VIP'],       orders_count:22,value:'$87,300',
     cp:[{pid:'PRT-0010',qty:50, min:200,rfq:500,ld:'2026-01-10',ld_days:null},
         {pid:'PRT-0020',qty:100,min:150,rfq:300,ld:'2026-02-01',ld_days:null},
         {pid:'PRT-0002',qty:5,  min:25, rfq:100,ld:'2025-12-15',ld_days:null},
         {pid:'PRT-0008',qty:60, min:30, rfq:60, ld:'2026-03-10',ld_days:null},
         {pid:'PRT-0018',qty:30, min:20, rfq:40, ld:'2026-04-01',ld_days:null}]},
    {id:'CLT-004',name:'Elena Vasquez',   company:'Vasquez & Partners',   email:'e.vasquez@vp.net',    phone:'+1 555 0310',tags:['Office','Retail'],          orders_count:9,value:'$14,650',
     cp:[{pid:'PRT-0009',qty:5, min:10,rfq:20,ld:'2026-03-15',ld_days:null},
         {pid:'PRT-0013',qty:20,min:15,rfq:30,ld:'2026-04-01',ld_days:null},
         {pid:'PRT-0019',qty:0, min:2, rfq:4, ld:'2025-10-01',ld_days:null},
         {pid:'PRT-0003',qty:30,min:10,rfq:20,ld:'2026-03-01',ld_days:90}]},
    {id:'CLT-005',name:'James Thornton',  company:'Thornton Fabrication', email:'j.thornton@tf.co',    phone:'+1 555 0447',tags:['Wholesale','Industrial'],   orders_count:31,value:'$124,800',
     cp:[{pid:'PRT-0004',qty:3, min:2, rfq:4,  ld:'2026-04-20',ld_days:null},
         {pid:'PRT-0014',qty:2, min:2, rfq:4,  ld:'2026-03-01',ld_days:null},
         {pid:'PRT-0002',qty:0, min:30,rfq:100,ld:'2025-11-01',ld_days:null},
         {pid:'PRT-0012',qty:15,min:20,rfq:50, ld:'2026-02-15',ld_days:null}]},
    {id:'CLT-006',name:'Priya Sharma',    company:'SharmaElec Ltd',       email:'priya@sharmaelec.in', phone:'+1 555 0558',tags:['Electronics','Priority'],   orders_count:16,value:'$43,200',
     cp:[{pid:'PRT-0007',qty:5, min:5, rfq:10,ld:'2026-04-01',ld_days:null},
         {pid:'PRT-0017',qty:10,min:5, rfq:10,ld:'2026-04-10',ld_days:null},
         {pid:'PRT-0005',qty:0, min:10,rfq:20,ld:'2025-05-01',ld_days:365},
         {pid:'PRT-0015',qty:5, min:10,rfq:15,ld:'2026-03-01',ld_days:null},
         {pid:'PRT-0011',qty:8, min:5, rfq:10,ld:'2026-04-05',ld_days:null}]},
    {id:'CLT-007',name:'Carlos Mendez',   company:'Mendez Chem Works',    email:'cmendez@mcw.mx',      phone:'+1 555 0672',tags:['Chemicals','Wholesale'],    orders_count:5,value:'$18,900',
     cp:[{pid:'PRT-0006',qty:8,min:5,rfq:10,ld:'2025-05-15',ld_days:730},
         {pid:'PRT-0016',qty:2,min:5,rfq:8, ld:'2026-01-01',ld_days:365},
         {pid:'PRT-0004',qty:1,min:2,rfq:3, ld:'2026-03-01',ld_days:null}]},
    {id:'CLT-008',name:'Anna Kowalski',   company:'Kowalski Logistics',   email:'a.kowalski@klog.pl',  phone:'+1 555 0789',tags:['Packaging','Retail'],       orders_count:18,value:'$22,100',
     cp:[{pid:'PRT-0003',qty:40,min:20,rfq:40,ld:'2026-04-01',ld_days:90},
         {pid:'PRT-0013',qty:10,min:20,rfq:40,ld:'2026-03-10',ld_days:null},
         {pid:'PRT-0009',qty:8, min:10,rfq:20,ld:'2026-03-20',ld_days:null},
         {pid:'PRT-0019',qty:3, min:3, rfq:6, ld:'2026-04-01',ld_days:null}]},
    {id:'CLT-009',name:'Robert Kim',      company:'Kim Systems Inc',      email:'rkim@kimsys.kr',      phone:'+1 555 0891',tags:['Electronics','Industrial'], orders_count:11,value:'$67,500',
     cp:[{pid:'PRT-0001',qty:15,min:8, rfq:15,ld:'2026-04-15',ld_days:null},
         {pid:'PRT-0007',qty:2, min:5, rfq:8, ld:'2026-02-01',ld_days:null},
         {pid:'PRT-0011',qty:0, min:5, rfq:10,ld:'2025-12-01',ld_days:null},
         {pid:'PRT-0015',qty:3, min:8, rfq:15,ld:'2026-03-01',ld_days:null},
         {pid:'PRT-0017',qty:6, min:4, rfq:8, ld:'2026-04-01',ld_days:null}]},
    {id:'CLT-010',name:'Fatima Al-Hassan',company:'Al-Hassan Contracting',email:'f.hassan@ahc.ae',     phone:'+1 555 0933',tags:['Construction','Pipes'],     orders_count:27,value:'$195,000',
     cp:[{pid:'PRT-0008',qty:80, min:50, rfq:100,ld:'2026-04-10',ld_days:null},
         {pid:'PRT-0018',qty:20, min:30, rfq:60, ld:'2026-03-01',ld_days:null},
         {pid:'PRT-0010',qty:50, min:200,rfq:500,ld:'2026-01-15',ld_days:null},
         {pid:'PRT-0020',qty:200,min:150,rfq:300,ld:'2026-04-01',ld_days:null},
         {pid:'PRT-0002',qty:10, min:30, rfq:60, ld:'2025-12-10',ld_days:null},
         {pid:'PRT-0012',qty:5,  min:30, rfq:60, ld:'2025-11-01',ld_days:null}]},
  ];

  const insClient = DB.prepare(
    `INSERT OR IGNORE INTO clients (id,name,company,email,phone,tags,orders_count,value)
     VALUES (?,?,?,?,?,?,?,?)`
  );
  const insCp = DB.prepare(
    `INSERT OR IGNORE INTO client_parts (client_id,part_id,qty,min_qty,refill_qty,lifespan_days,last_delivered_at)
     VALUES (?,?,?,?,?,?,?)`
  );
  clients.forEach(c => {
    insClient.run(c.id, c.name, c.company, c.email, c.phone,
      JSON.stringify(c.tags), c.orders_count, c.value);
    c.cp.forEach(r => insCp.run(c.id, r.pid, r.qty, r.min, r.rfq, r.ld_days ?? null, r.ld));
  });

  const insLog = DB.prepare('INSERT INTO logs (ts,type,msg) VALUES (?,?,?)');
  [
    ['09:00:01','info',   'Loop Logistics v1.0 — SQLite database initialized'],
    ['09:00:02','ok',     'Schema created: parts, clients, client_parts, orders, order_items, logs'],
    ['09:00:03','data',   'Seed complete — 20 parts, 10 clients with lifecycle data'],
    ['09:00:04','info',   'Order workflow active: pending → shipped → delivered'],
    ['09:00:05','warn',   'Lifecycle alerts detected on multiple client accounts'],
    ['09:00:06','comment','// Ready — awaiting customer manager action'],
  ].forEach(([ts,type,msg]) => insLog.run(ts, type, msg));
});

if (DB.prepare('SELECT COUNT(*) as c FROM parts').get().c === 0) seed();

/* ═══════════════════════════════════════════════
   SEED EXTRA — 20 more parts + 10 more clients
   Uses INSERT OR IGNORE so safe to run every boot
═══════════════════════════════════════════════ */
const seedExtra = DB.transaction(() => {
  const insPart = DB.prepare(
    'INSERT OR IGNORE INTO parts (part_id,name,category,current_stock,min_threshold,lifespan_logic) VALUES (?,?,?,?,?,?)'
  );
  [
    ['PRT-0021','USB-C Cable 2m 60W',            'Cables',      35,  15, ''],
    ['PRT-0022','M10 Hex Bolt Stainless (x25)',  'Hardware',    60,  20, ''],
    ['PRT-0023','Foam Peanuts Bag 20L',           'Packaging',   40,  15, ''],
    ['PRT-0024','Heat Gun 2000W',                 'Tools',        5,   2, ''],
    ['PRT-0025','9V Alkaline Battery (x10)',      'Batteries',   12,  10, '365d'],
    ['PRT-0026','Acetylene Cylinder 10L',         'Chemicals',    3,   2, '730d'],
    ['PRT-0027','ESP32 DevKit v4',                'Electronics', 25,   8, ''],
    ['PRT-0028','Galvanized Pipe 25mm x 3m',     'Pipes',       55,  20, ''],
    ['PRT-0029','Whiteboard Marker Set x8',       'Office',      18,   8, ''],
    ['PRT-0030','Granite Tile 30x30cm',           'Bricks',     280,  60, ''],
    ['PRT-0031','Fiber Optic Patch Cord 1m',     'Cables',      14,   6, ''],
    ['PRT-0032','Stainless Rivet Set (x200)',     'Hardware',    22,  10, ''],
    ['PRT-0033','Stretch Wrap Film 500mm',        'Packaging',   30,  12, ''],
    ['PRT-0034','Digital Caliper 150mm',          'Tools',        8,   3, ''],
    ['PRT-0035','CR123A Battery (x6)',            'Batteries',    0,   8, '365d'],
    ['PRT-0036','Solder Flux Paste 50g',          'Chemicals',    9,   4, '730d'],
    ['PRT-0037','Raspberry Pi Zero 2W',           'Electronics',  6,   4, ''],
    ['PRT-0038','CPVC Pipe 20mm x 1m',            'Pipes',       90,  25, ''],
    ['PRT-0039','Laser Toner Cartridge Black',    'Office',       4,   3, ''],
    ['PRT-0040','Paver Brick 200x100mm',          'Bricks',     450, 100, ''],
  ].forEach(p => insPart.run(...p));

  const insClient = DB.prepare(
    `INSERT OR IGNORE INTO clients (id,name,company,email,phone,tags,orders_count,value)
     VALUES (?,?,?,?,?,?,?,?)`
  );
  const insCp = DB.prepare(
    `INSERT OR IGNORE INTO client_parts (client_id,part_id,qty,min_qty,refill_qty,lifespan_days,last_delivered_at)
     VALUES (?,?,?,?,?,?,?)`
  );

  const extras = [
    {id:'CLT-011',name:'Tom Bradley',     company:'Bradley Automotive',    email:'tom@bradleyauto.com',    phone:'+1 555 1101',tags:['Automotive','Wholesale'],   orders_count:8, value:'$28,500',
     cp:[{pid:'PRT-0022',qty:15,min:20,rfq:50, ld:'2026-03-15',ld_days:null},
         {pid:'PRT-0026',qty:2, min:2, rfq:4,  ld:'2025-08-01',ld_days:730},
         {pid:'PRT-0004',qty:3, min:2, rfq:4,  ld:'2026-04-01',ld_days:null},
         {pid:'PRT-0034',qty:4, min:3, rfq:5,  ld:'2026-03-20',ld_days:null}]},
    {id:'CLT-012',name:'Mei Wong',        company:'WongFab Metals',        email:'mei@wongfab.hk',         phone:'+1 555 1202',tags:['Industrial','Fabrication'], orders_count:19,value:'$54,900',
     cp:[{pid:'PRT-0002',qty:5, min:25,rfq:100,ld:'2025-12-01',ld_days:null},
         {pid:'PRT-0012',qty:10,min:20,rfq:50, ld:'2026-02-10',ld_days:null},
         {pid:'PRT-0032',qty:8, min:10,rfq:25, ld:'2026-03-01',ld_days:null},
         {pid:'PRT-0014',qty:2, min:2, rfq:4,  ld:'2026-04-05',ld_days:null}]},
    {id:'CLT-013',name:'Ahmed Hassan',    company:'Hassan Medical Ltd',    email:'a.hassan@hassanmed.ae',  phone:'+1 555 1303',tags:['Medical','Priority'],      orders_count:6, value:'$11,200',
     cp:[{pid:'PRT-0006',qty:4, min:5, rfq:10, ld:'2026-01-15',ld_days:730},
         {pid:'PRT-0016',qty:0, min:4, rfq:8,  ld:'2025-09-01',ld_days:365},
         {pid:'PRT-0036',qty:3, min:4, rfq:8,  ld:'2026-03-01',ld_days:730},
         {pid:'PRT-0021',qty:20,min:10,rfq:20, ld:'2026-04-10',ld_days:null}]},
    {id:'CLT-014',name:'Lisa Park',       company:'Park Office Hub',       email:'lisa@parkofficehub.com', phone:'+1 555 1414',tags:['Office','Retail'],          orders_count:11,value:'$7,800',
     cp:[{pid:'PRT-0009',qty:3, min:10,rfq:20, ld:'2026-02-20',ld_days:null},
         {pid:'PRT-0019',qty:1, min:3, rfq:6,  ld:'2026-01-10',ld_days:null},
         {pid:'PRT-0029',qty:6, min:8, rfq:15, ld:'2026-03-25',ld_days:null},
         {pid:'PRT-0039',qty:2, min:3, rfq:6,  ld:'2026-03-01',ld_days:null}]},
    {id:'CLT-015',name:'Dmitri Volkov',   company:'Volkov Heavy Industry', email:'d.volkov@volkovheavy.ru',phone:'+1 555 1505',tags:['Industrial','VIP'],         orders_count:35,value:'$210,000',
     cp:[{pid:'PRT-0010',qty:120,min:200,rfq:500,ld:'2026-02-01',ld_days:null},
         {pid:'PRT-0020',qty:80, min:150,rfq:300,ld:'2026-02-15',ld_days:null},
         {pid:'PRT-0040',qty:200,min:150,rfq:400,ld:'2026-04-01',ld_days:null},
         {pid:'PRT-0008',qty:30, min:30, rfq:60, ld:'2026-03-10',ld_days:null}]},
    {id:'CLT-016',name:'Natalie Chen',    company:'ChenLog Shipping',      email:'natalie@chenlog.sg',     phone:'+1 555 1616',tags:['Packaging','Wholesale'],   orders_count:23,value:'$38,400',
     cp:[{pid:'PRT-0003',qty:15,min:20,rfq:40, ld:'2026-03-20',ld_days:90},
         {pid:'PRT-0013',qty:8, min:20,rfq:40, ld:'2026-03-01',ld_days:null},
         {pid:'PRT-0023',qty:20,min:15,rfq:30, ld:'2026-04-05',ld_days:null},
         {pid:'PRT-0033',qty:5, min:12,rfq:25, ld:'2026-02-15',ld_days:null}]},
    {id:'CLT-017',name:'Samuel Osei',     company:'Osei Build & Civil',    email:'s.osei@oseibuild.gh',    phone:'+1 555 1717',tags:['Construction','VIP'],       orders_count:28,value:'$156,000',
     cp:[{pid:'PRT-0010',qty:60, min:200,rfq:500,ld:'2026-01-20',ld_days:null},
         {pid:'PRT-0030',qty:150,min:60, rfq:200,ld:'2026-04-01',ld_days:null},
         {pid:'PRT-0028',qty:25, min:20, rfq:50, ld:'2026-03-15',ld_days:null},
         {pid:'PRT-0038',qty:40, min:25, rfq:60, ld:'2026-04-05',ld_days:null}]},
    {id:'CLT-018',name:'Ingrid Larsson',  company:'Nordic Tech AB',        email:'i.larsson@nordictech.se',phone:'+1 555 1818',tags:['Electronics','Priority'],   orders_count:14,value:'$62,300',
     cp:[{pid:'PRT-0007',qty:3, min:5, rfq:10,ld:'2026-02-10',ld_days:null},
         {pid:'PRT-0017',qty:12,min:5, rfq:10,ld:'2026-04-01',ld_days:null},
         {pid:'PRT-0027',qty:8, min:8, rfq:15,ld:'2026-03-25',ld_days:null},
         {pid:'PRT-0037',qty:2, min:4, rfq:8, ld:'2026-02-01',ld_days:null}]},
    {id:'CLT-019',name:'Rodrigo Santos',  company:'Santos Mining Corp',    email:'r.santos@santosmining.br',phone:'+1 555 1919',tags:['Industrial','Wholesale'],  orders_count:17,value:'$93,700',
     cp:[{pid:'PRT-0004',qty:2, min:3, rfq:6,  ld:'2026-03-01',ld_days:null},
         {pid:'PRT-0024',qty:1, min:2, rfq:4,  ld:'2026-02-15',ld_days:null},
         {pid:'PRT-0022',qty:10,min:20,rfq:50, ld:'2026-03-10',ld_days:null},
         {pid:'PRT-0002',qty:0, min:30,rfq:100,ld:'2025-11-15',ld_days:null}]},
    {id:'CLT-020',name:'Yuki Tanaka',     company:'Tanaka Precision',      email:'y.tanaka@tanakaprec.jp', phone:'+1 555 2020',tags:['Electronics','Cables'],     orders_count:9, value:'$29,600',
     cp:[{pid:'PRT-0001',qty:8, min:8, rfq:15,ld:'2026-03-20',ld_days:null},
         {pid:'PRT-0011',qty:0, min:5, rfq:10,ld:'2025-10-01',ld_days:null},
         {pid:'PRT-0021',qty:12,min:10,rfq:20,ld:'2026-04-10',ld_days:null},
         {pid:'PRT-0031',qty:3, min:6, rfq:12,ld:'2026-03-01',ld_days:null}]},
  ];

  extras.forEach(c => {
    insClient.run(c.id, c.name, c.company, c.email, c.phone,
      JSON.stringify(c.tags), c.orders_count, c.value);
    c.cp.forEach(r => insCp.run(c.id, r.pid, r.qty, r.min, r.rfq, r.ld_days ?? null, r.ld));
  });
});
seedExtra();

/* ═══════════════════════════════════════════════
   QUERY HELPERS
═══════════════════════════════════════════════ */
function nextPartId() {
  const row = DB.prepare("SELECT part_id FROM parts ORDER BY part_id DESC LIMIT 1").get();
  const n = row ? parseInt(row.part_id.replace('PRT-','')) : 0;
  return 'PRT-' + String(n + 1).padStart(4,'0');
}
function nextOrderId() {
  const row = DB.prepare("SELECT order_id FROM orders ORDER BY order_id DESC LIMIT 1").get();
  const n = row ? parseInt(row.order_id.replace('ORD-','')) : 0;
  return 'ORD-' + String(n + 1).padStart(4,'0');
}
function nextClientId() {
  const row = DB.prepare("SELECT id FROM clients ORDER BY id DESC LIMIT 1").get();
  const n = row ? parseInt(row.id.replace('CLT-','')) : 0;
  return 'CLT-' + String(n + 1).padStart(4,'0');
}

function rowToClient(c) {
  const cps = DB.prepare('SELECT * FROM client_parts WHERE client_id = ?').all(c.id);
  const part_quantities = {}, part_lifecycle = {}, parts = [];
  cps.forEach(r => {
    parts.push(r.part_id);
    part_quantities[r.part_id] = r.qty;
    part_lifecycle[r.part_id] = {
      min_qty: r.min_qty, refill_qty: r.refill_qty,
      lifespan_days: r.lifespan_days, last_delivered_at: r.last_delivered_at,
    };
  });
  return { ...c, tags: JSON.parse(c.tags || '[]'), orders: c.orders_count, parts, part_quantities, part_lifecycle };
}

function rowToOrder(o) {
  const items = DB.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.order_id);
  return { ...o, auto_refill: !!o.auto_refill, items: items.map(i => ({ ...i, fulfilled: !!i.fulfilled })) };
}

/* ═══════════════════════════════════════════════
   PARTS ROUTES
═══════════════════════════════════════════════ */
app.get('/api/parts', (_req, res) => {
  res.json(DB.prepare('SELECT * FROM parts ORDER BY category, name').all());
});

app.post('/api/parts', (req, res) => {
  const { name, category, current_stock = 0, min_threshold = 0, lifespan_logic = '' } = req.body;
  if (!name || !category) return res.status(400).json({ error: 'name and category required' });
  const part_id = nextPartId();
  DB.prepare(
    'INSERT INTO parts (part_id,name,category,current_stock,min_threshold,lifespan_logic) VALUES (?,?,?,?,?,?)'
  ).run(part_id, name, category, current_stock, min_threshold, lifespan_logic);
  res.json(DB.prepare('SELECT * FROM parts WHERE part_id = ?').get(part_id));
});

app.put('/api/parts/:id', (req, res) => {
  const { current_stock, min_threshold, name, lifespan_logic } = req.body;
  const p = DB.prepare('SELECT * FROM parts WHERE part_id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  DB.prepare('UPDATE parts SET current_stock=?, min_threshold=?, name=?, lifespan_logic=? WHERE part_id=?')
    .run(
      current_stock    ?? p.current_stock,
      min_threshold    ?? p.min_threshold,
      name             ?? p.name,
      lifespan_logic   ?? p.lifespan_logic,
      req.params.id
    );
  res.json(DB.prepare('SELECT * FROM parts WHERE part_id = ?').get(req.params.id));
});

/* ═══════════════════════════════════════════════
   CLIENT ROUTES
═══════════════════════════════════════════════ */
app.get('/api/clients', (_req, res) => {
  res.json(DB.prepare('SELECT * FROM clients ORDER BY name').all().map(rowToClient));
});

app.post('/api/clients', (req, res) => {
  const { name, company = '', email = '', phone = '', tags = [] } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = nextClientId();
  DB.prepare(
    'INSERT INTO clients (id,name,company,email,phone,tags) VALUES (?,?,?,?,?,?)'
  ).run(id, name, company, email, phone, JSON.stringify(tags));
  res.json(rowToClient(DB.prepare('SELECT * FROM clients WHERE id = ?').get(id)));
});

/* ═══════════════════════════════════════════════
   ORDER ROUTES
═══════════════════════════════════════════════ */
app.get('/api/orders', (_req, res) => {
  res.json(DB.prepare("SELECT * FROM orders ORDER BY created_at DESC").all().map(rowToOrder));
});

app.post('/api/orders', (req, res) => {
  const { client_id, items, auto_refill = false } = req.body;
  if (!client_id || !items?.length) return res.status(400).json({ error: 'client_id and items required' });
  const client = DB.prepare('SELECT * FROM clients WHERE id = ?').get(client_id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const order_id = nextOrderId();
  const created_at = new Date().toISOString();

  const createOrder = DB.transaction(() => {
    DB.prepare(
      'INSERT INTO orders (order_id,client_id,client_name,status,auto_refill,created_at) VALUES (?,?,?,?,?,?)'
    ).run(order_id, client_id, client.name, 'pending', auto_refill ? 1 : 0, created_at);

    const insItem = DB.prepare(
      'INSERT INTO order_items (order_id,part_id,part_name,qty) VALUES (?,?,?,?)'
    );
    items.forEach(it => insItem.run(order_id, it.part_id, it.part_name, it.qty));

    DB.prepare('UPDATE clients SET orders_count = orders_count + 1 WHERE id = ?').run(client_id);
    DB.prepare("INSERT INTO logs (ts,type,msg) VALUES (?,?,?)").run(
      nowTs(), 'info', `Order created: ${order_id} for ${client.name} (${items.length} SKUs)`
    );
  });
  createOrder();
  res.json(rowToOrder(DB.prepare('SELECT * FROM orders WHERE order_id = ?').get(order_id)));
});

/* Fulfill a single item from a part's row */
app.put('/api/orders/:id/fulfill-item', (req, res) => {
  const { part_id } = req.body;
  const order_id = req.params.id;

  const doFulfill = DB.transaction(() => {
    const item = DB.prepare(
      'SELECT * FROM order_items WHERE order_id = ? AND part_id = ? AND fulfilled = 0 LIMIT 1'
    ).get(order_id, part_id);
    if (!item) return { error: 'Item not found or already fulfilled' };

    const part = DB.prepare('SELECT * FROM parts WHERE part_id = ?').get(part_id);
    if (!part || part.current_stock < item.qty) {
      return { error: 'insufficient_stock', available: part?.current_stock ?? 0, required: item.qty, part_name: item.part_name };
    }
    DB.prepare('UPDATE parts SET current_stock = current_stock - ? WHERE part_id = ?').run(item.qty, part_id);
    DB.prepare('UPDATE order_items SET fulfilled = 1 WHERE id = ?').run(item.id);

    const remaining = DB.prepare(
      'SELECT COUNT(*) as c FROM order_items WHERE order_id = ? AND fulfilled = 0'
    ).get(order_id).c;

    const shipped = remaining === 0;
    if (shipped) {
      const now = new Date().toISOString();
      DB.prepare("UPDATE orders SET status = 'shipped', shipped_at = ? WHERE order_id = ?")
        .run(now, order_id);
    }

    const order = DB.prepare('SELECT * FROM orders WHERE order_id = ?').get(order_id);
    DB.prepare("INSERT INTO logs (ts,type,msg) VALUES (?,?,?)").run(
      nowTs(), 'ok',
      `Item fulfilled: ${item.part_name} ×${item.qty} for ${order.client_name} (${order_id})`
    );
    if (shipped) {
      DB.prepare("INSERT INTO logs (ts,type,msg) VALUES (?,?,?)").run(
        nowTs(), 'ok', `Order fully shipped: ${order_id} — receipt sent to ${order.client_name}`
      );
    }
    return { success: true, shipped };
  });

  const result = doFulfill();
  if (result.error === 'insufficient_stock') return res.status(409).json(result);
  if (result.error) return res.status(404).json(result);
  res.json(result);
});

/* Fulfill all remaining items in an order */
app.put('/api/orders/:id/fulfill-all', (req, res) => {
  const order_id = req.params.id;

  const doFulfillAll = DB.transaction(() => {
    const unfulfilled = DB.prepare(
      'SELECT * FROM order_items WHERE order_id = ? AND fulfilled = 0'
    ).all(order_id);

    const shortfalls = [];
    for (const item of unfulfilled) {
      const part = DB.prepare('SELECT * FROM parts WHERE part_id = ?').get(item.part_id);
      if (!part || part.current_stock < item.qty) {
        shortfalls.push({ part_id: item.part_id, part_name: item.part_name, required: item.qty, available: part?.current_stock ?? 0 });
      }
    }
    if (shortfalls.length > 0) return { error: 'insufficient_stock', shortfalls };

    unfulfilled.forEach(item => {
      DB.prepare('UPDATE parts SET current_stock = current_stock - ? WHERE part_id = ?')
        .run(item.qty, item.part_id);
      DB.prepare('UPDATE order_items SET fulfilled = 1 WHERE id = ?').run(item.id);
    });

    const now = new Date().toISOString();
    DB.prepare("UPDATE orders SET status = 'shipped', shipped_at = ? WHERE order_id = ?")
      .run(now, order_id);

    const order = DB.prepare('SELECT * FROM orders WHERE order_id = ?').get(order_id);
    DB.prepare("INSERT INTO logs (ts,type,msg) VALUES (?,?,?)").run(
      nowTs(), 'ok', `Order fulfilled: ${order_id} for ${order.client_name} — all items shipped`
    );
    DB.prepare("INSERT INTO logs (ts,type,msg) VALUES (?,?,?)").run(
      nowTs(), 'data', `Inventory updated for ${unfulfilled.length} SKU(s)`
    );
    return { success: true };
  });

  const result = doFulfillAll();
  if (result?.error) return res.status(409).json(result);
  res.json({ success: true });
});

/* Confirm delivery — updates client parts lifecycle */
app.put('/api/orders/:id/deliver', (req, res) => {
  const order_id = req.params.id;

  const doDeliver = DB.transaction(() => {
    const order = DB.prepare('SELECT * FROM orders WHERE order_id = ?').get(order_id);
    if (!order) return { error: 'Order not found' };

    const now = new Date().toISOString();
    DB.prepare("UPDATE orders SET status = 'delivered', delivered_at = ? WHERE order_id = ?")
      .run(now, order_id);

    const items = DB.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order_id);
    const upsertCp = DB.prepare(`
      INSERT INTO client_parts (client_id, part_id, qty, min_qty, refill_qty, last_delivered_at)
        VALUES (?, ?, ?, 0, 0, ?)
        ON CONFLICT(client_id, part_id) DO UPDATE SET
          qty = qty + excluded.qty,
          last_delivered_at = excluded.last_delivered_at
    `);
    items.forEach(it => {
      upsertCp.run(order.client_id, it.part_id, it.qty, now);
    });

    DB.prepare("INSERT INTO logs (ts,type,msg) VALUES (?,?,?)").run(
      nowTs(), 'ok', `Delivery confirmed: ${order_id} — ${order.client_name}`
    );
    items.forEach(it => {
      DB.prepare("INSERT INTO logs (ts,type,msg) VALUES (?,?,?)").run(
        nowTs(), 'ok', `  ${it.part_id}: +${it.qty} units delivered to ${order.client_name}`
      );
    });
    return { success: true };
  });

  const result = doDeliver();
  if (result.error) return res.status(404).json(result);
  res.json(result);
});

/* ═══════════════════════════════════════════════
   AUTO REFILL
═══════════════════════════════════════════════ */
app.post('/api/orders/auto-refill', (req, res) => {
  const { client_id, part_id } = req.body;
  const client = DB.prepare('SELECT * FROM clients WHERE id = ?').get(client_id);
  const part   = DB.prepare('SELECT * FROM parts WHERE part_id = ?').get(part_id);
  const cp     = DB.prepare('SELECT * FROM client_parts WHERE client_id = ? AND part_id = ?').get(client_id, part_id);
  if (!client || !part) return res.status(404).json({ error: 'Not found' });

  const qty = cp?.refill_qty || (cp?.min_qty ? cp.min_qty * 2 : 5);
  const order_id = nextOrderId();
  const created_at = new Date().toISOString();

  DB.transaction(() => {
    DB.prepare(
      'INSERT INTO orders (order_id,client_id,client_name,status,auto_refill,created_at) VALUES (?,?,?,?,?,?)'
    ).run(order_id, client_id, client.name, 'pending', 1, created_at);
    DB.prepare(
      'INSERT INTO order_items (order_id,part_id,part_name,qty) VALUES (?,?,?,?)'
    ).run(order_id, part_id, part.name, qty);
    DB.prepare('UPDATE clients SET orders_count = orders_count + 1 WHERE id = ?').run(client_id);
    DB.prepare("INSERT INTO logs (ts,type,msg) VALUES (?,?,?)").run(
      nowTs(), 'warn',
      `Auto-refill: ${order_id} — ${part.name} ×${qty} for ${client.name}`
    );
  })();

  res.json(rowToOrder(DB.prepare('SELECT * FROM orders WHERE order_id = ?').get(order_id)));
});

/* ═══════════════════════════════════════════════
   LOGS ROUTES
═══════════════════════════════════════════════ */
app.get('/api/logs', (_req, res) => {
  res.json(DB.prepare('SELECT id,ts,type,msg FROM logs ORDER BY id DESC LIMIT 500').all().reverse());
});

app.post('/api/logs', (req, res) => {
  const { ts, type, msg } = req.body;
  DB.prepare('INSERT INTO logs (ts,type,msg) VALUES (?,?,?)').run(ts || nowTs(), type || 'info', msg);
  res.json({ success: true });
});

app.delete('/api/logs', (_req, res) => {
  DB.prepare('DELETE FROM logs').run();
  res.json({ success: true });
});

/* ═══════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════ */
function nowTs() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function pad(n) { return String(n).padStart(2,'0'); }

app.listen(PORT, () => {
  console.log(`\n  Loop Logistics server running at http://localhost:${PORT}`);
  console.log(`  Database: ${DB_PATH}\n`);
});
