import java.util.Properties
import java.io.InputStream
import groovy.json.JsonSlurper
import com.boomi.execution.ExecutionUtil

/* Integrasi Connect - IBM P-Series source. Reads the tenant connection settings from DPP_REQUEST (connection.config.file = VEHMST | LICMST | SUMMST,
   optional config.by / config.key for a keyed read) and works out which runtime is executing, so the next step can reach the IBM i the right way. */
def setDpp = { String n, Object v -> ExecutionUtil.setDynamicProcessProperty(n, v == null ? "" : v.toString(), false) }
def req = [:]
try { req = new JsonSlurper().parseText(ExecutionUtil.getDynamicProcessProperty("DPP_REQUEST") ?: "{}") } catch (e) { }
def cfg = req?.connection?.config instanceof Map ? req.connection.config : [:]
String file = (cfg.file ?: "VEHMST").toString().toUpperCase()
String by = (cfg.by ?: "ALL").toString().toUpperCase(), key = (cfg.key ?: "*").toString().toUpperCase().replaceAll(/[^A-Z0-9*]/, "")
String host = ""; try { host = java.net.InetAddress.getLocalHost().getHostName() } catch (e) { }
String atomName = ""; try { atomName = System.getenv("BOOMI_ATOMNAME") ?: "" } catch (e) { }
setDpp("DPP_FILE", file); setDpp("DPP_BY", by); setDpp("DPP_KEY", key); setDpp("DPP_KEY_RAW", key); setDpp("DPP_VALIDATION", "")
setDpp("DPP_ZONE", atomName ? "ONPREM" : "CLOUD"); setDpp("DPP_RUNTIME_NAME", atomName ?: host)
for (int i = 0; i < dataContext.getDataCount(); i++) {
  InputStream is = dataContext.getStream(i); Properties props = dataContext.getProperties(i)
  dataContext.storeStream(is, props)
}
