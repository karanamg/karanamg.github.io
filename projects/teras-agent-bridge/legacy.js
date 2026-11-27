// Simulated legacy backend: an IBM Power (P-Series) system running IBM i / DB2 for i, as found in the "J" departments.
// It only speaks fixed-width records (one physical file per entity, field positions defined by a DDS / copybook layout),
// uses IBM i conventions (CYYMMDD dates, implied-decimal amounts, single-letter status codes, unpadded keys) and does exact-key
// lookups only. Boomi is the only client that talks to it; everything it returns is raw and un-governed.
// All people, vehicles and summons below are fictitious demo data.

const LAYOUTS = {
  VEHMST: { title: 'Vehicle registration master', library: 'JPJPRD', keys: { PLATE: 'PLATE', OWNIC: 'OWNIC' }, fields: [
    ['PLATE', 10, 'Registration number (no spaces)'], ['CHASSIS', 17, 'Chassis / VIN'], ['MAKE', 12, 'Make'], ['MODEL', 15, 'Model'],
    ['MFGYR', 4, 'Year of manufacture'], ['COLOUR', 8, 'Colour (Malay)'], ['OWNIC', 12, 'Owner MyKad (no dashes)'], ['OWNNM', 30, 'Owner name'],
    ['RTXEXP', 7, 'Road tax (LKM) expiry CYYMMDD'], ['INSEXP', 7, 'Insurance expiry CYYMMDD'], ['VSTAT', 1, 'Status A=Active D=Deregistered'],
    ['BLKLST', 1, 'Blacklisted Y/N'], ['VCLASS', 3, 'Class MPV / MC / GDV']] },
  LICMST: { title: 'Driving licence master', library: 'JPJPRD', keys: { ICNO: 'ICNO' }, fields: [
    ['ICNO', 12, 'Holder MyKad (no dashes)'], ['LNAME', 30, 'Holder name'], ['DOB', 7, 'Date of birth CYYMMDD'], ['LTYPE', 3, 'CDL / PDL / GDL / LDL'],
    ['LCLASS', 10, 'Licence classes'], ['LEXP', 7, 'Licence expiry CYYMMDD'], ['KEJARA', 2, 'KEJARA demerit points'],
    ['LSTAT', 1, 'Status A=Active S=Suspended R=Revoked X=Expired'], ['ADDR', 40, 'Address'], ['PHONE', 12, 'Mobile phone']] },
  SUMMST: { title: 'Traffic summons (saman) master', library: 'JPJPRD', keys: { ICNO: 'ICNO', PLATE: 'PLATE' }, fields: [
    ['SUMNO', 12, 'Summons number'], ['ICNO', 12, 'Offender MyKad'], ['PLATE', 10, 'Vehicle registration'], ['OFFCD', 4, 'Offence code'],
    ['OFFDT', 7, 'Offence date CYYMMDD'], ['LOCN', 20, 'Location'], ['AMT', 9, 'Amount RM, 2 implied decimals'], ['SSTAT', 1, 'Status O=Open P=Paid K=Court']] },
};

// rows exactly as the legacy system stores them (note the inconsistent casing, double spaces, missing dates and raw phone numbers)
const ROWS = {
  VEHMST: [
    ['WXY1234', 'PM2B50SA0KZ123456', 'PERODUA', 'MYVI 1.5 AV', '2019', 'MERAH', '850412105523', 'AHMAD FAIZAL  BIN RAHMAN', '1261031', '1270215', 'A', 'N', 'MPV'],
    ['WA8812K', 'MH4KC0710LK887123', 'YAMAHA', 'Y15ZR', '2020', 'BIRU', '850412105523', 'ahmad faizal bin rahman', '1270304', '1270304', 'A', 'N', 'MC'],
    ['VAB8899', 'MRHGM6650NP200341', 'HONDA', 'CITY 1.5 V', '2022', 'PUTIH', '920730146688', 'SITI NURHALIZA BINTI OMAR', '1270730', '1270730', 'A', 'N', 'MPV'],
    ['BKT5521', 'JHHFC4JF1HK004417', 'HINO', '300 SERIES', '2017', 'PUTIH', '780115085011', 'TAN WEI MING', '1260601', '0000000', 'A', 'Y', 'GDV'],
    ['BMC303', 'PL1BT3SNRGB405519', 'PROTON', 'SAGA 1.3', '2016', 'KELABU', '780115085011', 'TAN  WEI MING', '1251120', '1251120', 'A', 'N', 'MPV'],
    ['JQR77', 'PL1MX5BS7RG000777', 'PROTON', 'X50 FLAGSHIP', '2024', 'HITAM', '880903055237', 'RAJESH A/L SUBRAMANIAM', '1280112', '1280112', 'A', 'N', 'MPV'],
    ['PKN4402', 'MR0BA3CD7M0412290', 'TOYOTA', 'HILUX 2.4', '2021', 'KELABU', '010521101234', 'NURUL AINA BINTI KAMAL', '1260930', '1260930', 'A', 'N', 'MPV'],
    ['WTT1', 'WBA5R1103LF000101', 'BMW', '330E M SPORT', '2020', 'HITAM', '690228075599', 'DATO LIM CHEE KEONG', '1270101', '1270101', 'A', 'N', 'MPV'],
  ],
  LICMST: [
    ['850412105523', 'AHMAD FAIZAL  BIN RAHMAN', '0850412', 'CDL', 'B2 D', '1261215', '06', 'A', 'NO 12 JLN SS2/24, PETALING JAYA, SEL', '0123456789'],
    ['920730146688', 'SITI NURHALIZA BINTI OMAR', '0920730', 'CDL', 'D', '1290730', '00', 'A', 'B-7-3 PANGSAPURI SRI ARA, CYBERJAYA', '0198765432'],
    ['780115085011', 'TAN WEI MING', '0780115', 'GDL', 'D E', '1270301', '20', 'S', 'LOT 88 KAW PERINDUSTRIAN, IPOH, PRK', '0165551234'],
    ['880903055237', 'rajesh a/l subramaniam', '0880903', 'PDL', 'D', '1270903', '04', 'A', '23 JALAN MERBAU, SEREMBAN, NSN', '01133344455'],
    ['010521101234', 'NURUL AINA BINTI KAMAL', '1010521', 'CDL', 'D', '1260520', '00', 'X', '5 JALAN BUNGA RAYA, KLANG, SEL', '0172223344'],
    ['690228075599', 'DATO LIM CHEE KEONG', '0690228', 'CDL', 'B2 D', '1300228', '00', 'A', '1 JALAN TUNKU, BUKIT TUNKU, KL', '0122000001'],
  ],
  SUMMST: [
    ['JPJ250081234', '850412105523', 'WXY1234', 'S101', '1260914', 'LEBUHRAYA PLUS KM 2', '000030000', 'O'],
    ['JPJ250077120', '850412105523', 'WXY1234', 'R110', '1260802', 'JLN DAMANSARA PJ', '000030000', 'O'],
    ['JPJ240055501', '850412105523', 'WA8812K', 'H210', '1241119', 'JLN SS2 PJ', '000015000', 'P'],
    ['JPJ250090017', '780115085011', 'BKT5521', 'W320', '1260710', 'JLN IPOH-LUMUT', '000200000', 'O'],
    ['JPJ250090388', '780115085011', 'BKT5521', 'L301', '1260815', 'JLN KUALA KANGSAR', '000100000', 'K'],
    ['JPJ250091002', '780115085011', 'BKT5521', 'S101', '1260921', 'LEBUHRAYA PLUS KM 2', '000030000', 'O'],
    ['JPJ260000144', '780115085011', 'BMC303', 'T401', '1251201', 'IPOH TOWN', '000030000', 'O'],
    ['JPJ250066778', '880903055237', 'JQR77', 'P203', '1260519', 'SEREMBAN 2', '000015000', 'P'],
    ['JPJ250099901', '010521101234', 'PKN4402', 'L302', '1261002', 'KLANG SENTRAL', '000030000', 'O'],
  ],
};

const pad = (v, n) => String(v).padEnd(n, ' ').slice(0, n);
const record = (file, row) => LAYOUTS[file].fields.map(([, len], i) => pad(row[i] ?? '', len)).join('');
const recordLength = (file) => LAYOUTS[file].fields.reduce((s, [, len]) => s + len, 0);

// exact-match keyed read, the way an RPG program or a DB2 index would do it - no trimming, no case folding, no partial match
function query(file, by, key) {
  const L = LAYOUTS[file];
  if (!L) return { error: `CPF9812: File ${file} in library JPJPRD not found.` };
  if (by === 'ALL') return { lines: ROWS[file].map((r) => record(file, r)) };   // full-file extract (batch / ingestion)
  const field = L.keys[by];
  if (!field) return { error: `SQL0206: Column ${by} is not a key of ${file}.` };
  const idx = L.fields.findIndex(([n]) => n === field);
  const rows = ROWS[file].filter((r) => (r[idx] || '') === String(key || ''));
  return { lines: rows.map((r) => record(file, r)) };
}
const all = (file) => ROWS[file].map((r) => record(file, r));
const layout = (file) => {
  let pos = 1;
  return { file, library: LAYOUTS[file].library, title: LAYOUTS[file].title, recordLength: recordLength(file),
           fields: LAYOUTS[file].fields.map(([name, len, desc]) => { const f = { name, from: pos, to: pos + len - 1, length: len, description: desc }; pos += len; return f; }) };
};

module.exports = { LAYOUTS, query, all, layout, files: Object.keys(LAYOUTS) };
