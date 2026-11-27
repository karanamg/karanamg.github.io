import java.util.Properties
import java.io.InputStream
import groovy.json.JsonSlurper
import com.boomi.execution.ExecutionUtil

/* Teras Legacy Tools - read the agent's tool call and normalise the lookup key into the exact form the IBM i keyed read expects.
   In:  DPP_TOOL (vehicle | licence | summons, set by the API listener), DPP_REQUEST = {"query":{"plate","ic"},"context":{...}}
   Out: DPP_FILE, DPP_BY, DPP_KEY, DPP_KEY_RAW, DPP_CHANNEL, DPP_VALIDATION (empty when the request is valid) */
def setDpp = { String n, Object v -> ExecutionUtil.setDynamicProcessProperty(n, v == null ? "" : v.toString(), false) }
String tool = (ExecutionUtil.getDynamicProcessProperty("DPP_TOOL") ?: "").trim()
/* Which runtime is executing? The on-prem (sovereign) runtime is a Docker Atom started with BOOMI_ATOMNAME; Boomi cloud runtimes are not.
   DPP_ZONE drives the "Running on-prem?" decision: on-prem reads the IBM i over the internal network, cloud goes through the IBM i gateway. */
String host = ""; try { host = java.net.InetAddress.getLocalHost().getHostName() } catch (e) { }
String atomName = ""; try { atomName = System.getenv("BOOMI_ATOMNAME") ?: "" } catch (e) { }   /* cloud runtimes may forbid getenv - that also means "not on-prem" */
setDpp("DPP_ZONE", atomName ? "ONPREM" : "CLOUD")
setDpp("DPP_RUNTIME_NAME", atomName ?: host)
setDpp("DPP_TS_START", new Date().format("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", TimeZone.getTimeZone("UTC")))

for (int i = 0; i < dataContext.getDataCount(); i++) {
  InputStream is = dataContext.getStream(i)
  Properties props = dataContext.getProperties(i)
  String body = is.getText("UTF-8")
  def req = [:]
  try { req = body?.trim() ? new JsonSlurper().parseText(body) : [:] } catch (e) { req = [:] }
  def q = req.query instanceof Map ? req.query : [:]
  def ctx = req.context instanceof Map ? req.context : [:]

  String plateRaw = (q.plate ?: "").toString(), icRaw = (q.ic ?: "").toString()
  String plate = plateRaw.toUpperCase().replaceAll(/[^A-Z0-9]/, "")      /* "wxy 1234" -> "WXY1234" */
  String ic = icRaw.replaceAll(/[^0-9]/, "")                              /* "850412-10-5523" -> "850412105523" */
  String file = "", by = "", key = "", raw = "", problem = ""

  switch (tool) {
    case "vehicle":
      file = "VEHMST"
      if (plate) { by = "PLATE"; key = plate; raw = plateRaw } else if (ic) { by = "OWNIC"; key = ic; raw = icRaw }
      else problem = "Provide a vehicle registration number (plate) or the owner's MyKad number (ic)."
      break
    case "licence":
      file = "LICMST"; by = "ICNO"; key = ic; raw = icRaw
      if (!ic) problem = "Provide the licence holder's MyKad number (ic)."
      break
    case "summons":
      file = "SUMMST"
      if (ic) { by = "ICNO"; key = ic; raw = icRaw } else if (plate) { by = "PLATE"; key = plate; raw = plateRaw }
      else problem = "Provide a MyKad number (ic) or a vehicle registration number (plate)."
      break
    default:
      problem = "Unknown tool '" + tool + "'."
  }
  if (!problem && by in ["ICNO", "OWNIC"] && key.length() != 12) problem = "MyKad number must have 12 digits (got " + key.length() + ")."
  if (!problem && by == "PLATE" && !(key ==~ /[A-Z]{1,3}[0-9]{1,4}[A-Z]?/)) problem = "'" + plateRaw + "' is not a valid Malaysian registration number."

  setDpp("DPP_FILE", file); setDpp("DPP_BY", by); setDpp("DPP_KEY", problem ? "INVALID" : key); setDpp("DPP_KEY_RAW", raw)
  setDpp("DPP_CHANNEL", (ctx.channel ?: "").toString().toUpperCase()); setDpp("DPP_VALIDATION", problem)
  dataContext.storeStream(new ByteArrayInputStream(body.getBytes("UTF-8")), props)
}
