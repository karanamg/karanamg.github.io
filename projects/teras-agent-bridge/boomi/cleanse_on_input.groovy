import java.util.Properties
import java.io.InputStream
import groovy.json.JsonOutput
import com.boomi.execution.ExecutionUtil

/* Teras Legacy Tools - CLEANSE ON INPUT.
   Current document = fixed-width records returned by the IBM i (DB2 for i) keyed read. Parses each record with the file's
   DDS / copybook layout, then standardises it before anything downstream (agent, RAG index, analytics) can see it:
   trims padding, fixes name casing, converts CYYMMDD dates, implied-decimal amounts, formats MyKad, plates and phone numbers,
   decodes status / offence codes and derives the answers an assistant actually needs (is the road tax valid? days left?). */
def dpp = { String n -> String v = ExecutionUtil.getDynamicProcessProperty(n); v == null ? "" : v }
String file = dpp("DPP_FILE")
def LAYOUT = [
  VEHMST: [["PLATE",10],["CHASSIS",17],["MAKE",12],["MODEL",15],["MFGYR",4],["COLOUR",8],["OWNIC",12],["OWNNM",30],["RTXEXP",7],["INSEXP",7],["VSTAT",1],["BLKLST",1],["VCLASS",3]],
  LICMST: [["ICNO",12],["LNAME",30],["DOB",7],["LTYPE",3],["LCLASS",10],["LEXP",7],["KEJARA",2],["LSTAT",1],["ADDR",40],["PHONE",12]],
  SUMMST: [["SUMNO",12],["ICNO",12],["PLATE",10],["OFFCD",4],["OFFDT",7],["LOCN",20],["AMT",9],["SSTAT",1]]]
def OFFENCE = [S101: "Speeding (exceeding speed limit)", R110: "Beating the red light", H210: "Using a mobile phone while driving",
               W320: "Commercial vehicle overloaded", L301: "Driving while licence suspended", L302: "Driving with an expired licence",
               T401: "No valid road tax (LKM)", P203: "Obstruction / illegal parking"]
def COLOUR = [MERAH: "Red", BIRU: "Blue", PUTIH: "White", HITAM: "Black", KELABU: "Grey", PERAK: "Silver", HIJAU: "Green", KUNING: "Yellow"]
def LTYPE = [CDL: "Competent Driving Licence", PDL: "Probationary Driving Licence", GDL: "Goods Driving Licence", LDL: "Learner Driving Licence"]
def VCLASS = [MPV: "Motorcar", MC: "Motorcycle", GDV: "Goods vehicle"]

def today = new Date().clearTime()
int fixes = 0
def rules = [] as LinkedHashSet
def issues = []
def note = { String rule -> rules << rule; fixes++ }

def date = { String v, String fld, String id ->
  if (!v || v ==~ /0+/) { issues << "${id}: ${fld} is blank (0000000) in the source - returned as null".toString(); rules << "NULL_DATES"; return null }
  if (!(v ==~ /[01]\d{6}/)) { issues << "${id}: ${fld} '${v}' is not a CYYMMDD date".toString(); return null }
  note("CYYMMDD_TO_ISO_DATE")
  return (v[0] == "1" ? "20" : "19") + v[1..2] + "-" + v[3..4] + "-" + v[5..6] }
def daysUntil = { String iso -> iso ? (int) (Date.parse("yyyy-MM-dd", iso) - today) : null }
def name = { String v ->
  String clean = v.replaceAll(/\s+/, " ").trim()
  String t = clean.toLowerCase().split(" ").collect { w ->
    w in ["bin", "binti", "a/l", "a/p", "bt", "bte"] ? w : (w == "dato" ? "Dato'" : w.split("/").collect { it ? it[0].toUpperCase() + it.substring(1) : it }.join("/")) }.join(" ")
  if (t != v) note("NAME_STANDARDISED")
  t }
def mykad = { String v -> if (v ==~ /\d{12}/) { note("MYKAD_FORMAT"); return v[0..5] + "-" + v[6..7] + "-" + v[8..11] }; v }
def plateFmt = { String v -> def m = v =~ /^([A-Z]+)(\d+)([A-Z]?)$/; if (m.matches()) { note("PLATE_FORMAT"); return (m.group(1) + " " + m.group(2) + m.group(3)) }; v }
def phone = { String v ->
  String d = v.replaceAll(/\D/, "")
  if (!(d ==~ /01\d{8,9}/)) { if (d) issues << "Phone '${v}' is not a Malaysian mobile number".toString(); return d ? v : null }
  note("PHONE_E164")
  String n = d.substring(1)
  return "+60 " + n[0..1] + "-" + (n.length() == 9 ? n[2..4] + " " + n[5..8] : n[2..5] + " " + n[6..9]) }
def decode = { Map tbl, String v, String id, String fld ->
  if (tbl.containsKey(v)) { note("CODE_DECODE"); return tbl[v] }
  issues << "${id}: unknown ${fld} code '${v}'".toString(); v }

for (int i = 0; i < dataContext.getDataCount(); i++) {
  InputStream is = dataContext.getStream(i)
  Properties props = dataContext.getProperties(i)
  String text = is.getText("UTF-8") ?: ""
  def layout = LAYOUT[file]
  def records = [], rawCount = 0
  String sourceError = ""
  if (dpp("DPP_VALIDATION")) {
    /* invalid request - nothing was read */
  } else if (text.trim().startsWith("CPF") || text.trim().startsWith("SQL") || text.trim().startsWith("{")) {
    sourceError = text.trim().take(200)
  } else if (layout) {
    text.readLines().findAll { it.trim() }.each { String line ->
      rawCount++
      def f = [:]; int pos = 0
      layout.each { fld -> String raw = pos < line.length() ? line.substring(pos, Math.min(line.length(), pos + fld[1])) : ""; f[fld[0]] = raw.trim(); pos += fld[1] }
      rules << "TRIM_FIXED_WIDTH_PADDING"
      def r
      if (file == "VEHMST") {
        String id = f.PLATE
        String rt = date(f.RTXEXP, "RTXEXP", id), ins = date(f.INSEXP, "INSEXP", id)
        Integer rtd = daysUntil(rt), insd = daysUntil(ins)
        r = [plate: plateFmt(f.PLATE), make: f.MAKE.length() > 3 ? f.MAKE.toLowerCase().capitalize() : f.MAKE, model: f.MODEL, year: f.MFGYR as Integer,
             colour: decode(COLOUR, f.COLOUR, id, "colour"), vehicle_class: decode(VCLASS, f.VCLASS, id, "vehicle class"), chassis: f.CHASSIS,
             owner_ic: mykad(f.OWNIC), owner_name: name(f.OWNNM),
             road_tax_expiry: rt, road_tax_valid: rtd != null && rtd >= 0, road_tax_days_left: rtd,
             insurance_expiry: ins, insurance_valid: insd != null && insd >= 0,
             status: decode([A: "Active", D: "Deregistered"], f.VSTAT, id, "vehicle status"), blacklisted: f.BLKLST == "Y"]
        rules << "DERIVED_VALIDITY_FLAGS"
      } else if (file == "LICMST") {
        String id = f.ICNO.take(6) + "******"
        String exp = date(f.LEXP, "LEXP", id); Integer d = daysUntil(exp)
        int pts = (f.KEJARA ?: "0") as Integer
        String st = decode([A: "Active", S: "Suspended", R: "Revoked", X: "Expired"], f.LSTAT, id, "licence status")
        if (st == "Active" && d != null && d < 0) { st = "Expired"; issues << "${id}: status A but expiry has passed - corrected to Expired".toString(); note("STATUS_RECONCILED") }
        r = [ic: mykad(f.ICNO), name: name(f.LNAME), date_of_birth: date(f.DOB, "DOB", id),
             licence_type: f.LTYPE, licence_type_desc: decode(LTYPE, f.LTYPE, id, "licence type"), classes: f.LCLASS.split(/\s+/).findAll { it },
             expiry: exp, days_to_expiry: d, expiring_soon: d != null && d >= 0 && d <= 60,
             demerit_points: pts, demerit_limit: 20, status: st, address: f.ADDR.replaceAll(/\s+/, " ").replaceAll(/, SEL$/, ", Selangor").replaceAll(/, PRK$/, ", Perak").replaceAll(/, NSN$/, ", Negeri Sembilan").replaceAll(/, KL$/, ", Kuala Lumpur"),
             phone: phone(f.PHONE)]
        rules << "DERIVED_VALIDITY_FLAGS"
      } else if (file == "SUMMST") {
        String id = f.SUMNO
        BigDecimal amt = new BigDecimal(f.AMT ?: "0").movePointLeft(2); note("IMPLIED_DECIMAL_AMOUNT")
        String st = decode([O: "Outstanding", P: "Paid", K: "Referred to court"], f.SSTAT, id, "summons status")
        r = [summons_no: f.SUMNO, ic: mykad(f.ICNO), plate: plateFmt(f.PLATE), offence_code: f.OFFCD, offence: decode(OFFENCE, f.OFFCD, id, "offence"),
             offence_date: date(f.OFFDT, "OFFDT", id), location: f.LOCN.split(" ").collect { it.length() > 3 ? it.toLowerCase().capitalize() : it }.join(" "),
             amount_rm: amt, status: st, payable_online: st == "Outstanding"]
      }
      records << r
    }
  }
  def out = [file: file, records: records, sourceError: sourceError,
             cleansing: [rulesApplied: rules as List, valuesFixed: fixes, issues: issues],
             source: [system: "JPJ IBM Power9 - IBM i 7.4 - DB2 for i", library: "JPJPRD", file: file,
                      query: dpp("DPP_VALIDATION") ? "(not executed - invalid request)" : "SELECT * FROM JPJPRD/" + file + (dpp("DPP_BY") == "ALL" ? "" : " WHERE " + dpp("DPP_BY") + " = '" + dpp("DPP_KEY") + "'"),
                      keyAsReceived: dpp("DPP_KEY_RAW"), keyNormalised: dpp("DPP_KEY"), recordsRead: rawCount,
                      recordLength: layout ? layout.sum { it[1] } : 0, format: "Fixed-width EBCDIC records (DDS layout), converted to UTF-8 by the gateway"]]
  props.setProperty("document.dynamic.userdefined.DDP_RECORDS", records.size().toString())
  dataContext.storeStream(new ByteArrayInputStream(JsonOutput.toJson(out).getBytes("UTF-8")), props)
}
