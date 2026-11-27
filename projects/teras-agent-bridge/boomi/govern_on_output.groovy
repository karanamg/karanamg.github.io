import java.util.Properties
import java.io.InputStream
import java.security.MessageDigest
import groovy.json.JsonSlurper
import groovy.json.JsonOutput
import com.boomi.execution.ExecutionUtil

/* Teras Legacy Tools - GOVERN ON OUTPUT ("context is governance").
   The same tool call returns different data depending on WHO is asking, through WHICH channel and WHY.
   Policy is decided here, inside the sovereign runtime, before anything reaches the virtual assistant or the SLM:
     CITIZEN_VA       MyJPJ citizen assistant: own records only (verified MyKad), others' vehicles in public view, personal data minimised
     COUNTER_OFFICER  JPJ counter officer: full record, but only with an officer ID and a stated purpose (audited)
     ENFORCEMENT      Roadside enforcement: status data for the stop, no home address / phone / date of birth
     AI_ANALYTICS     SLM training / RAG analytics: de-identified (tokenised MyKad and plates, no names or contact data) */
def dpp = { String n -> String v = ExecutionUtil.getDynamicProcessProperty(n); v == null ? "" : v }
def now = new Date().format("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", TimeZone.getTimeZone("UTC"))
String tool = dpp("DPP_TOOL"), validation = dpp("DPP_VALIDATION")
def toolName = [vehicle: "jpj_vehicle_lookup", licence: "jpj_licence_status", summons: "jpj_summons_check"][tool] ?: tool
def req = [:]
try { req = new JsonSlurper().parseText(dpp("DPP_REQUEST") ?: "{}") } catch (e) { req = [:] }
def ctx = req.context instanceof Map ? req.context : [:]
String channel = (ctx.channel ?: "").toString().toUpperCase()
String requesterIc = (ctx.requester_ic ?: "").toString().replaceAll(/\D/, "")
String officer = (ctx.officer_id ?: "").toString().trim(), purpose = (ctx.purpose ?: "").toString().trim()
def CHANNELS = [CITIZEN_VA: "MyJPJ citizen virtual assistant (public, MyDigital ID verified)", COUNTER_OFFICER: "JPJ counter officer (internal network)",
                ENFORCEMENT: "JPJ / PDRM roadside enforcement", AI_ANALYTICS: "SLM training and RAG analytics (de-identified)"]
def OWNER_FIELD = [vehicle: "owner_ic", licence: "ic", summons: "ic"]
def PUBLIC_VEHICLE = ["plate", "make", "model", "year", "colour", "vehicle_class", "road_tax_valid", "insurance_valid", "status"]

def digits = { Object v -> (v ?: "").toString().replaceAll(/\D/, "") }
def maskIc = { String v -> v && v.length() == 14 ? v[0..5] + "-**-**" + v[12..13] : v }
def maskPhone = { String v -> v ? v.replaceAll(/(\+60 \d\d-)\d+( ?)\d*(\d{4})$/, '$1****$2$3') : v }
def token = { String prefix, String v -> v ? prefix + "-" + MessageDigest.getInstance("SHA-256").digest(("teras-salt:" + v).getBytes("UTF-8")).encodeHex().toString().take(10).toUpperCase() : v }
def cityOnly = { String v -> if (!v) return v; def parts = v.split(",").collect { it.trim() }; parts.size() > 2 ? parts[-2..-1].join(", ") : parts[-1] }

for (int i = 0; i < dataContext.getDataCount(); i++) {
  InputStream is = dataContext.getStream(i)
  Properties props = dataContext.getProperties(i)
  def data = new JsonSlurper().parseText(is.getText("UTF-8") ?: "{}")
  def records = (data.records ?: []) as List
  def masked = [] as LinkedHashSet, withheld = [] as LinkedHashSet
  int filtered = 0
  String decision = "ALLOW", reason = "", status = "OK", policy = CHANNELS[channel] ?: "none"
  def out = []

  if (validation) { status = "INVALID"; decision = "DENY"; reason = validation }
  else if (data.sourceError) { status = "SOURCE_ERROR"; decision = "DENY"; reason = "Legacy system error: " + data.sourceError }
  else if (!CHANNELS[channel]) { status = "DENIED"; decision = "DENY"; reason = "No access policy exists for channel '" + (channel ?: "(none)") + "'. Requests must declare a known channel." }
  else if (channel == "CITIZEN_VA" && requesterIc.length() != 12) { status = "DENIED"; decision = "DENY"; reason = "The citizen assistant needs a MyDigital ID-verified MyKad (requester_ic) before it can look up JPJ records." }
  else if (channel == "COUNTER_OFFICER" && (!officer || !purpose)) { status = "DENIED"; decision = "DENY"; reason = "Counter access requires an officer ID and a stated purpose of access (audit requirement)." }
  else if (channel == "ENFORCEMENT" && !officer) { status = "DENIED"; decision = "DENY"; reason = "Enforcement access requires an officer ID." }
  else {
    records.each { Map r ->
      Map g = new LinkedHashMap(r)
      boolean own = digits(r[OWNER_FIELD[tool]]) == requesterIc
      switch (channel) {
        case "CITIZEN_VA":
          if (!own) {
            if (tool == "vehicle") { g = r.subMap(PUBLIC_VEHICLE.findAll { r.containsKey(it) }); (r.keySet() - g.keySet()).each { withheld << it }; g.view = "public" }
            else { filtered++; return }
          } else {
            g.view = "own record"
            ["owner_ic", "ic"].each { if (g[it]) { g[it] = maskIc(g[it]); masked << it } }
            if (g.chassis) { g.chassis = "************" + g.chassis.substring(Math.max(0, g.chassis.length() - 5)); masked << "chassis" }
            if (g.phone) { g.phone = maskPhone(g.phone); masked << "phone" }
            if (g.address) { g.address = cityOnly(g.address); masked << "address" }
          }
          break
        case "COUNTER_OFFICER":
          g.view = "full record"
          break
        case "ENFORCEMENT":
          g.view = "enforcement"
          ["address", "phone", "date_of_birth"].each { if (g.containsKey(it)) { g.remove(it); withheld << it } }
          ["owner_ic", "ic"].each { if (g[it]) { g[it] = maskIc(g[it]); masked << it } }
          break
        case "AI_ANALYTICS":
          g.view = "de-identified"
          ["owner_name", "name", "address", "phone", "chassis", "location"].each { if (g.containsKey(it)) { g.remove(it); withheld << it } }
          ["owner_ic", "ic"].each { if (g[it]) { g[it] = token("PERSON", digits(g[it])); masked << it } }
          if (g.plate) { g.plate = token("VEH", g.plate); masked << "plate" }
          if (g.date_of_birth) { g.birth_year = g.date_of_birth.take(4); g.remove("date_of_birth"); masked << "date_of_birth" }
          break
      }
      out << g
    }
    if (records && !out) { status = "DENIED"; decision = "DENY"; reason = "These records belong to someone else. The citizen assistant can only show your own " + (tool == "licence" ? "licence" : "summons") + " records." }
    else if (!records) { status = "NOT_FOUND"; reason = "No " + [vehicle: "vehicle", licence: "licence", summons: "summons"][tool] + " record matches " + data.source?.keyNormalised + "." }
    else if (filtered || masked || withheld) { decision = "PARTIAL"; reason = "Policy for " + channel + " applied: " + [filtered ? filtered + " record(s) filtered" : null, masked ? "masked " + masked.join(", ") : null, withheld ? "withheld " + withheld.join(", ") : null].findAll().join("; ") + "." }
    else reason = "Full access granted for " + channel + (purpose ? " (purpose: " + purpose + ")" : "") + "."
  }

  /* AI-ready one-line summaries, built AFTER governance so they can never leak a masked value */
  def summaries = out.collect { Map g ->
    if (tool == "vehicle") return "${g.plate} - ${g.make} ${g.model} (${g.year}, ${g.colour}). Road tax ${g.road_tax_valid ? 'valid' + (g.road_tax_expiry ? ' until ' + g.road_tax_expiry : '') : 'EXPIRED' + (g.road_tax_expiry ? ' on ' + g.road_tax_expiry : '')}; insurance ${g.insurance_valid ? 'valid' : 'NOT valid'}${g.blacklisted ? '; BLACKLISTED' : ''}${g.owner_name ? '. Owner: ' + g.owner_name : ''}.".toString()
    if (tool == "licence") return "${g.name ?: 'Licence holder'} - ${g.licence_type_desc} (${g.classes?.join(' ')}), status ${g.status}, expires ${g.expiry}${g.days_to_expiry != null && g.days_to_expiry >= 0 ? ' (in ' + g.days_to_expiry + ' days)' : ''}. KEJARA demerit points: ${g.demerit_points}/20.".toString()
    return "${g.summons_no}: ${g.offence} on ${g.offence_date}${g.location ? ' at ' + g.location : ''} (vehicle ${g.plate}) - RM${g.amount_rm} ${g.status}.".toString()
  }
  def totals = tool == "summons" ? [outstanding_count: out.count { it.status == "Outstanding" }, outstanding_rm: out.findAll { it.status == "Outstanding" }.sum { it.amount_rm as BigDecimal } ?: 0,
                                    court_count: out.count { it.status == "Referred to court" }] : null
  String execId = ""
  try { execId = ExecutionUtil.getRuntimeExecutionProperty("EXECUTION_ID") ?: "" } catch (e) { }

  def result = [tool: toolName, status: status, decision: decision, reason: reason,
                context: [channel: channel, channelLabel: CHANNELS[channel] ?: "unknown", requester: requesterIc ? maskIc(requesterIc[0..5] + "-" + requesterIc[6..7] + "-" + requesterIc[8..11]) : (officer ?: ""), officerId: officer, purpose: purpose],
                count: out.size(), records: out, summaries: summaries, totals: totals,
                governance: [policy: policy, maskedFields: masked as List, withheldFields: withheld as List, recordsFiltered: filtered, enforcedAt: dpp("DPP_ZONE") == "ONPREM" ? "On-prem Boomi runtime " + dpp("DPP_RUNTIME_NAME") + " (inside the sovereign zone)" : "Boomi cloud runtime " + dpp("DPP_RUNTIME_NAME")],
                cleansing: data.cleansing ?: [:], source: data.source ?: [:],
                boomi: [executionId: execId, processedAt: now, receivedAt: dpp("DPP_TS_START")],
                runtime: [zone: dpp("DPP_ZONE"), name: dpp("DPP_RUNTIME_NAME"), legacyPath: dpp("DPP_ZONE") == "ONPREM" ? "Internal network (inside the firewall)" : "IBM i HTTP gateway (via the public internet)"]]
  ExecutionUtil.setDynamicProcessProperty("DPP_AUDIT", "${toolName} | runtime=${dpp("DPP_RUNTIME_NAME")} (${dpp("DPP_ZONE")}) | channel=${channel ?: '-'} officer=${officer ?: '-'} purpose=${purpose ?: '-'} | key=${data.source?.keyNormalised ?: '-'} | ${status}/${decision} | returned=${out.size()} filtered=${filtered} masked=${masked.join('+') ?: '-'} withheld=${withheld.join('+') ?: '-'}".toString(), false)
  dataContext.storeStream(new ByteArrayInputStream(JsonOutput.toJson(result).getBytes("UTF-8")), props)
}
