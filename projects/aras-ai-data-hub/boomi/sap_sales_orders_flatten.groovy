import java.util.Properties
import java.io.InputStream
import java.io.ByteArrayInputStream
import groovy.json.JsonOutput
import groovy.json.JsonSlurper

/* Input: the SAPHub sales orders response (orders with nested items).
   Output: {"salesOrders":[...]} with one flat record per order - the lines become readable text so the
   AI data prep (mapping, PII masking, chunking) can treat each order as one knowledge document. */
def STATUS = [A: 'Open', B: 'In process', C: 'Completed']
for (int i = 0; i < dataContext.getDataCount(); i++) {
  InputStream is = dataContext.getStream(i)
  Properties props = dataContext.getProperties(i)
  def data = new JsonSlurper().parse(is)
  def day = { String s -> s ? s.take(10) : '' }
  /* orders without lines carry no useful knowledge (empty in SAP), so they are left out */
  def records = (data.salesOrders ?: []).findAll { it.items }.collect { o ->
    def items = o.items ?: []
    [salesOrder: o.salesOrder, customer: o.soldToParty, salesOrganization: o.salesOrganization,
     orderDate: day(o.salesOrderDate), requestedDelivery: day(o.requestedDeliveryDate),
     status: STATUS[o.overallStatus] ?: 'Not set', deliveryStatus: STATUS[o.deliveryStatus] ?: 'Not delivered',
     orderValue: "${o.totalNetAmount} ${o.currency}".toString(), customerPurchaseOrder: o.customerPurchaseOrder ?: '',
     lineCount: items.size(), materials: items*.material.unique().join(', '),
     lines: items.collect { "Ordered ${it.quantity} ${it.unit} of ${it.description} (${it.material}) for ${it.netAmount} ${it.currency}" }.join('. ')]
  }
  dataContext.storeStream(new ByteArrayInputStream(JsonOutput.toJson([salesOrders: records]).getBytes("UTF-8")), props)
}
