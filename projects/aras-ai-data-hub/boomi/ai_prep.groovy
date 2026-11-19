import java.util.Properties
import java.io.InputStream
import groovy.json.JsonSlurper
import groovy.json.JsonOutput
import com.boomi.execution.ExecutionUtil

/* Integrasi Connect - AI data prep. Current document = records from the source connector; DPP_REQUEST = tenant request
   (mapping, PII policy, chunking). Produces RAG-ready documents and chunks, or a field preview for the mapping studio. */
def dpp = { String n -> String v = ExecutionUtil.getDynamicProcessProperty(n); v == null ? "" : v }
def utc = TimeZone.getTimeZone("UTC")
def iso = { String s ->
  try { return new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ").parse(s).format("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", utc) }
  catch (e) { return s } }
def flat
flat = { Map m, String pre, Map out ->
  m.each { k, v -> if (k == "attributes") return; String key = pre ? pre + "." + k : k.toString()
    if (v instanceof Map) flat(v, key, out) else out[key] = v == null ? "" : v.toString() }; out }
def findRecords = { o -> o instanceof List ? o : (o instanceof Map ? (o.values().find { it instanceof List && it && it[0] instanceof Map } ?: []) : []) }
def PII = [MYKAD: ~/\b\d{6}-\d{2}-\d{4}\b/, EMAIL: ~/[\w.+-]+@[\w-]+(\.[\w-]+)+/, PHONE: ~/(?<!\d)(\+?60|0)[- ]?\d{1,2}[- ]?\d{3,4}[- ]?\d{4}(?!\d)/]
def PII_NAME = ~/(?i)(contact_?name|full_?name|patient_?name|student_?name|^name$|email|phone|mobile|mykad|nric|ic_?no|passport|home_?address)/
def label = { String f -> f.replace("__c", "").replace("_", " ").replaceAll(/([a-z])([A-Z])/, '$1 $2').capitalize() }
def SYSTEMS = [SAP_S4HANA: "SAP S/4HANA", SAP_SALES_ORDERS: "SAP S/4HANA", SALESFORCE: "Salesforce Service Cloud", FILE_CSV: "File drop (CSV)", OPEN_DATA: "data.gov.my open data"]
def slurp = new JsonSlurper()

for (int i = 0; i < dataContext.getDataCount(); i++) {
  InputStream is = dataContext.getStream(i)
  Properties props = dataContext.getProperties(i)
  def req = slurp.parseText(dpp("DPP_REQUEST") ?: "{}")
  is.getText("UTF-8")   /* current document is the request copy from the branch; source records come from DPP_RAW */
  String raw = dpp("DPP_RAW")
  def records = findRecords(raw.trim() ? slurp.parseText(raw) : []).collect { flat(it as Map, "", [:]) }
  def conn = req.connection ?: [:], map = req.mapping ?: [:], pol = req.policy ?: [:], tenant = req.tenant ?: [:]
  String type = conn.type ?: "", system = SYSTEMS[type] ?: type, mode = req.mode ?: "ingest"
  def maskFields = (pol.maskFields ?: []) as Set
  def counts = [FIELD: 0, MYKAD: 0, EMAIL: 0, PHONE: 0]
  int size = Math.max(200, (pol.chunkSize ?: 500) as int)

  def mask = { Map r ->
    def out = [:]
    r.each { k, v ->
      String s = v
      if (k in maskFields && s) { s = "[REDACTED]"; counts.FIELD++ }
      else if (pol.autoDetect != false) PII.each { t, re -> def m = (s =~ re); int c = 0; while (m.find()) c++; if (c) { counts[t] += c; s = s.replaceAll(re, "[" + t + "]") } }
      out[k] = s }
    out }
  def render = { String tpl, Map r -> (tpl ?: "").replaceAll(/\{([^}]+)\}/) { all, f -> r.containsKey(f) ? r[f] : "" }.trim() }

  def docs = [], chunks = []
  records.eachWithIndex { rec, n ->
    def m = mask(rec)
    String id = render(map.id, rec) ?: "${conn.id ?: type}-${n + 1}"
    String title = render(map.title, m) ?: "${system} record ${n + 1}"
    def lines = (map.content ?: []).findAll { m[it] }.collect { "${label(it)}: ${m[it]}" }
    String text = ([title] + lines).join("\n")
    def meta = [tenant: tenant.id, source_system: system, connection: conn.name ?: conn.id, record_id: id,
                classification: tenant.classification ?: "Internal", ingested_at: new Date().format("yyyy-MM-dd'T'HH:mm:ss'Z'", utc)]
    (map.metadata ?: []).each { mm -> if (mm.from && mm.to) meta[mm.to] = m[mm.from] ?: "" }
    def parts = [], buf = new StringBuilder()
    text.split(/(?<=[.!?\n])\s+/).each { s -> if (buf.length() + s.length() > size && buf.length()) { parts << buf.toString().trim(); buf = new StringBuilder(parts[-1].takeRight(60) + " ") }; buf << s << " " }
    if (buf.toString().trim()) parts << buf.toString().trim()
    parts.eachWithIndex { t, c -> chunks << [id: "${tenant.id}:${conn.id}:${id}#${c + 1}".toString(), docId: id, text: t, metadata: meta] }
    docs << [docId: id, title: title, text: text, metadata: meta, chunks: parts.size()]
  }

  String now = new Date().format("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", utc), execId = ""
  try { execId = ExecutionUtil.getRuntimeExecutionProperty("EXECUTION_ID") ?: "" } catch (e) { }
  def fieldNames = records.take(50).collectMany { it.keySet() as List }.unique()
  def fields = fieldNames.collect { f ->
    String sample = records.find { it[f] }?.getAt(f) ?: ""
    [name: f, sample: sample.take(80), pii: (f in maskFields) || PII_NAME.matcher(f).find() || PII.values().any { sample =~ it } ] }
  int masked = counts.values().sum()
  def result = [
    mode: mode, executionId: execId, processedAt: now, tenant: tenant, connection: [id: conn.id, name: conn.name, type: type, system: system],
    stats: [sourceRecords: records.size(), documents: docs.size(), chunks: chunks.size(), piiMasked: masked, piiByType: counts,
            fieldsMapped: (map.content ?: []).size() + (map.metadata ?: []).size()],
    fields: fields,
    documents: mode == "preview" ? docs.take(10) : docs,
    chunks: mode == "preview" ? [] : chunks,
    sample: records.take(10),   /* source records as fetched, shown in the portal lineage view */
    trace: [[step: "REQUEST_RECEIVED", at: iso(dpp("DPP_TS_START")), detail: "${tenant.name ?: tenant.id} - ${conn.name ?: type} (${mode})".toString()],
            [step: "SOURCE_FETCHED", at: iso(dpp("DPP_TS_FETCH")), detail: "${records.size()} records from ${system}".toString()],
            [step: "MAPPED", at: now, detail: "${docs.size()} documents using the tenant mapping (${(map.content ?: []).size()} content, ${(map.metadata ?: []).size()} metadata fields)".toString()],
            [step: "PII_MASKED", at: now, detail: masked ? "${masked} values masked: ${counts.findAll { it.value }.collect { "${it.value} " + [FIELD: "configured fields", MYKAD: "MyKad numbers", EMAIL: "e-mail addresses", PHONE: "phone numbers"][it.key] }.join(', ')}".toString() : "No personal data found"],
            [step: "CHUNKED", at: now, detail: mode == "preview" ? "Preview only - nothing chunked" : "${chunks.size()} chunks (max ${size} characters) ready for embedding".toString()]]
  ]
  ExecutionUtil.setDynamicProcessProperty("DPP_RESULT_SUMMARY", "${docs.size()} documents, ${chunks.size()} chunks, ${masked} PII values masked".toString(), false)
  dataContext.storeStream(new ByteArrayInputStream(JsonOutput.toJson(result).getBytes("UTF-8")), props)
}
