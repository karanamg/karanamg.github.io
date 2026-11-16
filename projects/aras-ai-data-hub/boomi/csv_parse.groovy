import java.util.Properties
import java.io.InputStream
import groovy.json.JsonSlurper
import groovy.json.JsonOutput
import com.boomi.execution.ExecutionUtil

/* File drop (CSV) -> JSON records. The CSV text arrives in the request (connection.config.csv); the header row names the fields. */
def parseLine = { String line ->
  def out = [], cur = new StringBuilder(); boolean q = false
  for (int k = 0; k < line.length(); k++) {
    char ch = line.charAt(k)
    if (q) { if (ch == '"' as char) { if (k + 1 < line.length() && line.charAt(k + 1) == '"' as char) { cur << '"'; k++ } else q = false } else cur << ch }
    else if (ch == '"' as char) q = true
    else if (ch == ',' as char) { out << cur.toString(); cur = new StringBuilder() }
    else cur << ch }
  out << cur.toString(); out }
for (int i = 0; i < dataContext.getDataCount(); i++) {
  InputStream is = dataContext.getStream(i)
  Properties props = dataContext.getProperties(i)
  def req = new JsonSlurper().parseText(ExecutionUtil.getDynamicProcessProperty("DPP_REQUEST") ?: "{}")
  def lines = (req.connection?.config?.csv ?: "").readLines().findAll { it.trim() }
  def header = lines ? parseLine(lines[0]).collect { it.trim() } : []
  def records = lines.drop(1).collect { l -> def v = parseLine(l); def r = [:]; header.eachWithIndex { h, n -> r[h] = n < v.size() ? v[n].trim() : "" }; r }
  def out = [file: req.connection?.config?.fileName ?: "upload.csv", columns: header, records: records]
  dataContext.storeStream(new ByteArrayInputStream(JsonOutput.toJson(out).getBytes("UTF-8")), props)
}
