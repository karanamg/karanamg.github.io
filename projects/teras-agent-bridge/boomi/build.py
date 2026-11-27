#!/usr/bin/env python3
"""Generator for the Teras Legacy Tools Boomi components (Aras Integrasi / MTAI OEM workshop, Nov 24 2026).
Usage: python3 build.py <step> [...]   steps: profiles conn op sub wss procs api all
Creates the component the first time (boomi-component-create.sh) and pushes on later runs (boomi-component-push.sh)."""
import json, os, subprocess, sys, html
from xml.sax.saxutils import escape

HERE = os.path.dirname(os.path.abspath(__file__))
WS = '/Users/guru/Claude-Guru'
AD = os.path.join(WS, 'active-development')
SK = '/Users/guru/.claude/plugins/cache/boomi-companion/bc-integration/1.0.64/skills/boomi-integration/scripts'
FOLDER = 'Rjo4OTgxNTkx'
GATEWAY = 'https://teras-agent-bridge.up.railway.app'
INTERNAL = 'http://host.docker.internal:8096'   # on-prem runtime (Docker) -> IBM i on the internal network
TOKEN = open(os.path.join(HERE, '..', '.legacy_token')).read().strip()
TAG = ' | built with boomi-companion v1.0.64'
REST = 'officialboomi-X3979C-rest-prod'


def sync_id(path):
    d = os.path.join(AD, '.sync-state')
    for f in os.listdir(d):
        try:
            j = json.load(open(os.path.join(d, f)))
        except Exception:
            continue
        if j.get('file_path') == path:
            return j.get('component_id')
    return None


def put(ctype, name, body_xml, desc, extra_attrs=''):
    folder = os.path.join(AD, ctype)
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, name.replace('/', '-') + '.xml')
    cid = sync_id(path) or ''
    xml = (f'<?xml version="1.0" encoding="UTF-8"?>\n<bns:Component xmlns:bns="http://api.platform.boomi.com/" '
           f'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" componentId="{cid}" name="{escape(name)}" type="{ctype.split("_")[0]}" '
           f'{extra_attrs}folderId="{FOLDER}">\n  <bns:encryptedValues/>\n  <bns:description>{escape(desc + TAG)}</bns:description>\n'
           f'  <bns:object>\n{body_xml}\n  </bns:object>\n</bns:Component>\n')
    open(path, 'w').write(xml)
    tool = 'boomi-component-push.sh' if cid else 'boomi-component-create.sh'
    r = subprocess.run(['bash', os.path.join(SK, tool), path], cwd=WS, capture_output=True, text=True)
    out = (r.stdout + r.stderr).strip().splitlines()
    print(f'[{tool.split("-")[2].split(".")[0]}] {name}:', ' | '.join(l for l in out[-3:]))
    cid = sync_id(path)
    if not cid:
        sys.exit(f'FAILED: {name}\n' + '\n'.join(out[-15:]))
    return cid


# ---------------- JSON profiles ----------------
class Prof:
    def __init__(self):
        self.k = 2
    def nk(self):
        self.k += 1
        return self.k
    def fmt(self, t):
        return {'character': '<DataFormat><ProfileCharacterFormat/></DataFormat>', 'number': '<DataFormat><ProfileNumberFormat numberFormat=""/></DataFormat>',
                'boolean': '<DataFormat><ProfileBooleanFormat/></DataFormat>'}[t]
    def obj(self, spec):   # spec: list of (name, type|list|dict)
        k = self.nk()
        parts = [f'<JSONObject isMappable="false" isNode="true" key="{k}" name="Object">']
        for name, t in spec:
            parts.append(self.entry(name, t))
        parts.append('</JSONObject>')
        return ''.join(parts)
    def entry(self, name, t):
        k = self.nk()
        if isinstance(t, str):
            return f'<JSONObjectEntry dataType="{t}" isMappable="true" isNode="true" key="{k}" name="{name}">{self.fmt(t)}</JSONObjectEntry>'
        if isinstance(t, dict):   # array
            ak = self.nk(); ek = self.nk()
            inner = t['of']
            if isinstance(inner, str):
                el = f'<JSONArrayElement dataType="{inner}" isMappable="true" isNode="true" key="{ek}" maxOccurs="-1" minOccurs="0" name="ArrayElement1">{self.fmt(inner)}</JSONArrayElement>'
            else:
                el = f'<JSONArrayElement dataType="character" isMappable="false" isNode="true" key="{ek}" maxOccurs="-1" minOccurs="0" name="ArrayElement1">{self.obj(inner)}</JSONArrayElement>'
            return (f'<JSONObjectEntry dataType="character" isMappable="false" isNode="true" key="{k}" name="{name}">{self.fmt("character")}'
                    f'<JSONArray elementType="repeating" isMappable="false" isNode="true" key="{ak}" name="{name}">{el}</JSONArray></JSONObjectEntry>')
        return f'<JSONObjectEntry dataType="character" isMappable="false" isNode="true" key="{k}" name="{name}">{self.fmt("character")}{self.obj(t)}</JSONObjectEntry>'
    def build(self, spec):
        body = self.obj(spec)
        return ('    <JSONProfile strict="false">\n      <DataElements>\n        <JSONRootValue dataType="character" isMappable="true" isNode="true" key="1" name="Root">'
                f'<DataFormat><ProfileCharacterFormat/></DataFormat>{body}</JSONRootValue>\n      </DataElements>\n      <tagLists/>\n    </JSONProfile>')


REQ_SPEC = [('query', [('plate', 'character'), ('ic', 'character')]),
            ('context', [('channel', 'character'), ('requester_ic', 'character'), ('officer_id', 'character'), ('purpose', 'character')])]
RESP_SPEC = [('tool', 'character'), ('status', 'character'), ('decision', 'character'), ('reason', 'character'),
             ('context', [('channel', 'character'), ('channelLabel', 'character'), ('requester', 'character'), ('officerId', 'character'), ('purpose', 'character')]),
             ('count', 'number'),
             ('records', {'of': [('view', 'character'), ('plate', 'character'), ('make', 'character'), ('model', 'character'), ('year', 'number'), ('owner_name', 'character'),
                                 ('road_tax_expiry', 'character'), ('road_tax_valid', 'boolean'), ('name', 'character'), ('licence_type', 'character'), ('expiry', 'character'),
                                 ('demerit_points', 'number'), ('summons_no', 'character'), ('offence', 'character'), ('amount_rm', 'number'), ('status', 'character')]}),
             ('summaries', {'of': 'character'}),
             ('totals', [('outstanding_count', 'number'), ('outstanding_rm', 'number'), ('court_count', 'number')]),
             ('governance', [('policy', 'character'), ('maskedFields', {'of': 'character'}), ('withheldFields', {'of': 'character'}), ('recordsFiltered', 'number'), ('enforcedAt', 'character')]),
             ('cleansing', [('rulesApplied', {'of': 'character'}), ('valuesFixed', 'number'), ('issues', {'of': 'character'})]),
             ('source', [('system', 'character'), ('library', 'character'), ('file', 'character'), ('query', 'character'), ('keyAsReceived', 'character'),
                         ('keyNormalised', 'character'), ('recordsRead', 'number'), ('recordLength', 'number'), ('format', 'character')]),
             ('boomi', [('executionId', 'character'), ('processedAt', 'character'), ('receivedAt', 'character')])]

IDS_FILE = os.path.join(HERE, 'ids.json')
IDS = json.load(open(IDS_FILE)) if os.path.exists(IDS_FILE) else {}
def save_ids():
    json.dump(IDS, open(IDS_FILE, 'w'), indent=1)


def profiles():
    IDS['req'] = put('profile.json', 'j.TERAS.ToolRequest', Prof().build(REQ_SPEC), 'Agent tool call: query (plate / ic) plus the caller context (channel, requester_ic, officer_id, purpose)')
    IDS['resp'] = put('profile.json', 'j.TERAS.ToolResponse', Prof().build(RESP_SPEC), 'Governed tool result: records, AI-ready summaries, governance decision, cleansing report, legacy source lineage')
    save_ids()


def conn():
    body = f'''    <GenericConnectionConfig>
      <field id="url" type="string" value="{GATEWAY}"/>
      <field id="auth" type="string" value="NONE"/>
      <field id="connectTimeout" type="integer" value="30000"/>
      <field id="readTimeout" type="integer" value="60000"/>
      <field id="cookieScope" type="string" value="GLOBAL"/>
      <field id="enableConnectionPooling" type="boolean" value="false"/>
    </GenericConnectionConfig>'''
    IDS['conn'] = put('connector-settings', 'TERAS JPJ IBM i Gateway Connection', body,
                      'Simulated JPJ IBM Power9 / IBM i 7.4 system (DB2 for i keyed reads over the IBM i HTTP gateway). In production this is the on-prem P-Series behind the firewall.',
                      f'subType="{REST}" ')
    save_ids()


def conn_internal():
    body = f'''    <GenericConnectionConfig>
      <field id="url" type="string" value="{INTERNAL}"/>
      <field id="auth" type="string" value="NONE"/>
      <field id="connectTimeout" type="integer" value="15000"/>
      <field id="readTimeout" type="integer" value="60000"/>
      <field id="cookieScope" type="string" value="GLOBAL"/>
      <field id="enableConnectionPooling" type="boolean" value="false"/>
    </GenericConnectionConfig>'''
    IDS['conn_int'] = put('connector-settings', 'TERAS JPJ IBM i Internal Connection (on-prem)', body,
                          'IBM i reached over the internal network from the on-prem runtime (no public internet hop). Used only when the process runs on the sovereign runtime.',
                          f'subType="{REST}" ')
    save_ids()


def op():
    body = f'''    <Operation returnApplicationErrors="false" trackResponse="false">
      <Archiving directory="" enabled="false"/>
      <Configuration>
        <GenericOperationConfig customOperationType="GET" operationType="EXECUTE">
          <field id="followRedirects" type="string" value="NONE"/>
          <field id="path" type="string" value="/legacy/ibmi/v1/query"/>
          <field id="queryParameters" type="customproperties">
            <customProperties><properties key="file" value=""/><properties key="by" value=""/><properties key="key" value=""/></customProperties>
          </field>
          <field id="requestHeaders" type="customproperties"><customProperties><properties key="Accept" value="text/plain"/><properties key="X-IBMi-Token" value="{TOKEN}"/></customProperties></field>
          <Options/>
        </GenericOperationConfig>
      </Configuration>
      <Tracking><TrackedFields/></Tracking>
      <Caching/>
    </Operation>'''
    IDS['op'] = put('connector-action', 'TERAS IBM i DB2 Keyed Read', body,
                    'GET /legacy/ibmi/v1/query?file=&by=&key= - exact-key read of a DB2 for i physical file, returns fixed-width records.', f'subType="{REST}" ')
    save_ids()


def script_shape(name, label, x, y, script, to):
    return (f'<shape image="dataprocess_icon" name="{name}" shapetype="dataprocess" userlabel="{escape(label)}" x="{x}.0" y="{y}.0"><configuration><dataprocess>'
            f'<step index="1" key="1" name="Custom Scripting" processtype="12"><dataprocessscript language="groovy2" useCache="true"><script>{escape(script)}</script>'
            f'</dataprocessscript></step></dataprocess></configuration><dragpoints><dragpoint name="{name}.dragpoint1" toShape="{to}" x="{x + 192}" y="{y + 8}"/></dragpoints></shape>')


def dppv(name):
    return f'<parametervalue key="0" valueType="process"><processparameter processproperty="{name}" processpropertydefaultvalue=""/></parametervalue>'


def process_xml(shapes, desc_opts=''):
    return ('    <process allowSimultaneous="true" enableUserLog="false" processLogOnErrorOnly="false" purgeDataImmediately="false" '
            'stopProcessingIfZeroDocuments="false" updateRunDates="false" workload="general">\n      <shapes>\n' + '\n'.join(shapes) + '\n      </shapes>\n    </process>')


def legacy_read_shapes(first_x, y, next_shape, names):
    """Decision 'Running on-prem?' + two keyed-read connector shapes (internal vs gateway) that converge on next_shape."""
    dec, rin, rgw = names
    dyn = ''.join(f'<propertyvalue childKey="{k}" key="queryParameters" name="Query Parameters" valueType="process"><processparameter processproperty="{p}" processpropertydefaultvalue=""/></propertyvalue>'
                  for k, p in [('file', 'DPP_FILE'), ('by', 'DPP_BY'), ('key', 'DPP_KEY')])
    x = first_x
    def rest(name, label, conn, xx, yy):
        return (f'<shape image="connectoraction_icon" name="{name}" shapetype="connectoraction" userlabel="{escape(label)}" x="{xx}.0" y="{yy}.0"><configuration><connectoraction actionType="GET" allowDynamicCredentials="NONE" connectionId="{conn}" connectorType="{REST}" hideSettings="false" operationId="{IDS["op"]}"><parameters/><dynamicProperties>{dyn}</dynamicProperties></connectoraction></configuration>'
                f'<dragpoints><dragpoint name="{name}.dragpoint1" toShape="{next_shape}" x="{xx + 192}" y="{yy + 8}"/></dragpoints></shape>')
    return [
        f'<shape image="decision_icon" name="{dec}" shapetype="decision" userlabel="Running on-prem?" x="{x}.0" y="{y}.0"><configuration><decision comparison="equals" name="Running on-prem?"><decisionvalue valueType="process"><processparameter processproperty="DPP_ZONE" processpropertydefaultvalue="CLOUD"/></decisionvalue><decisionvalue valueType="static"><staticparameter staticproperty="ONPREM"/></decisionvalue></decision></configuration>'
        f'<dragpoints><dragpoint identifier="true" name="{dec}.dragpoint1" text="True" toShape="{rin}" x="{x + 192}" y="{y + 8}"/><dragpoint identifier="false" name="{dec}.dragpoint2" text="False" toShape="{rgw}" x="{x + 192}" y="{y + 168}"/></dragpoints></shape>',
        rest(rin, 'IBM i keyed read - internal network (on-prem)', IDS['conn_int'], x + 208, y),
        rest(rgw, 'IBM i keyed read - via IBM i gateway (cloud)', IDS['conn'], x + 208, y + 160),
    ]


def sub():
    rd = open(os.path.join(HERE, 'read_request.groovy')).read()
    cl = open(os.path.join(HERE, 'cleanse_on_input.groovy')).read()
    gv = open(os.path.join(HERE, 'govern_on_output.groovy')).read()
    shapes = [
        '<shape image="start" name="shape1" shapetype="start" userlabel="" x="48.0" y="48.0"><configuration><passthroughaction/></configuration><dragpoints><dragpoint name="shape1.dragpoint1" toShape="shape2" x="240" y="56"/></dragpoints></shape>',
        script_shape('shape2', 'Read tool call - normalise key, detect runtime', 256, 48, rd, 'shape3'),
        '<shape image="message_icon" name="shape3" shapetype="message" userlabel="Clear document before legacy read" x="464.0" y="48.0"><configuration><message combined="false"><msgTxt></msgTxt><msgParameters></msgParameters></message></configuration><dragpoints><dragpoint name="shape3.dragpoint1" toShape="shape9" x="656" y="56"/></dragpoints></shape>',
        *legacy_read_shapes(672, 48, 'shape5', ('shape9', 'shape10', 'shape4')),
        script_shape('shape5', 'Cleanse on input - parse copybook, standardise', 1088, 48, cl, 'shape6'),
        script_shape('shape6', 'Govern on output - context policy', 1296, 48, gv, 'shape7'),
        f'<shape image="notify_icon" name="shape7" shapetype="notify" userlabel="Audit trail" x="1504.0" y="48.0"><configuration><notify disableEvent="true" enableUserLog="false" perExecution="false" title="TERAS TOOL AUDIT"><notifyMessage>{{1}}</notifyMessage><notifyMessageLevel>INFO</notifyMessageLevel><notifyParameters>{dppv("DPP_AUDIT")}</notifyParameters></notify></configuration><dragpoints><dragpoint name="shape7.dragpoint1" toShape="shape8" x="1696" y="56"/></dragpoints></shape>',
        '<shape image="returndocuments_icon" name="shape8" shapetype="returndocuments" userlabel="Governed tool result" x="1712.0" y="48.0"><configuration><returndocuments label="Governed tool result"/></configuration><dragpoints/></shape>',
    ]
    IDS['sub'] = put('process', '[SUB] TERAS Legacy Tool Pipeline', process_xml(shapes),
                     'Shared pipeline behind every Teras agent tool: normalise the request, read the IBM P-Series (DB2 for i) file - over the internal network when running on the on-prem runtime, via the IBM i gateway on cloud - cleanse on input, apply the context policy, audit, return. DPP_TOOL selects vehicle | licence | summons.')
    save_ids()


def aih_ps():
    """Integrasi Connect source: IBM P-Series (IBM i DB2) file extract, cleansed - plugs into [SUB] AIH Ingest Pipeline like any other source."""
    sel = open(os.path.join(HERE, 'ps_select.groovy')).read()
    cl = open(os.path.join(HERE, 'cleanse_on_input.groovy')).read()
    shapes = [
        '<shape image="start" name="shape1" shapetype="start" userlabel="" x="48.0" y="48.0"><configuration><passthroughaction/></configuration><dragpoints><dragpoint name="shape1.dragpoint1" toShape="shape2" x="240" y="56"/></dragpoints></shape>',
        script_shape('shape2', 'Read connection settings - file, runtime', 256, 48, sel, 'shape3'),
        '<shape image="message_icon" name="shape3" shapetype="message" userlabel="Clear document before legacy read" x="464.0" y="48.0"><configuration><message combined="false"><msgTxt></msgTxt><msgParameters></msgParameters></message></configuration><dragpoints><dragpoint name="shape3.dragpoint1" toShape="shape4" x="656" y="56"/></dragpoints></shape>',
        *legacy_read_shapes(672, 48, 'shape7', ('shape4', 'shape5', 'shape6')),
        script_shape('shape7', 'Cleanse on input - parse copybook, standardise', 1088, 48, cl, 'shape8'),
        '<shape image="returndocuments_icon" name="shape8" shapetype="returndocuments" userlabel="IBM P-Series records" x="1296.0" y="48.0"><configuration><returndocuments label="IBM P-Series records"/></configuration><dragpoints/></shape>',
    ]
    IDS['aih_ps'] = put('process', '[SUB] AIH IBM P-Series (IBM i DB2)', process_xml(shapes),
                        'Integrasi Connect source connector: extracts a DB2 for i physical file (VEHMST / LICMST / SUMMST) from the IBM P-Series - internal network on the on-prem runtime, IBM i gateway on cloud - and cleanses it on input. Called by [SUB] AIH Ingest Pipeline for source type IBM_PSERIES.')
    save_ids()


TOOLS = [('vehicle', 'Vehicle', 'jpj_vehicle_lookup', 'Look up a vehicle by registration number (plate) or all vehicles owned by a MyKad (ic): make, model, road tax and insurance validity, blacklist status.'),
         ('licence', 'Licence', 'jpj_licence_status', 'Driving licence status for a MyKad (ic): licence type and classes, expiry, KEJARA demerit points.'),
         ('summons', 'Summons', 'jpj_summons_check', 'Traffic summons (saman) by MyKad (ic) or plate: offence, date, amount, status, outstanding total.')]


def wss():
    for key, label, tool, desc in TOOLS:
        body = f'''    <Operation>
      <Archiving directory="" enabled="false"/>
      <Configuration>
        <WebServicesServerListenAction inputType="singlejson" objectName="teras{label}" operationType="EXECUTE" outputType="singlejson" requestProfile="{IDS['req']}" responseProfile="{IDS['resp']}" responseContentType="application/json"/>
      </Configuration>
      <Tracking><TrackedFields/></Tracking>
      <Caching/>
    </Operation>'''
        IDS['wss_' + key] = put('connector-action', f'TERAS WSS {label} Tool', body, f'Listener: POST /ws/rest/teras/v1/{key} (agent tool {tool})', 'subType="wss" ')
    save_ids()


def procs():
    for key, label, tool, desc in TOOLS:
        shapes = [
            f'<shape image="start" name="shape1" shapetype="start" userlabel="" x="48.0" y="48.0"><configuration><connectoraction actionType="Listen" allowDynamicCredentials="NONE" connectorType="wss" hideSettings="true" operationId="{IDS["wss_" + key]}"><parameters/><dynamicProperties/></connectoraction></configuration><dragpoints><dragpoint name="shape1.dragpoint1" toShape="shape2" x="240" y="56"/></dragpoints></shape>',
            f'<shape image="documentproperties_icon" name="shape2" shapetype="documentproperties" userlabel="Tool = {key}" x="256.0" y="48.0"><configuration><documentproperties>'
            f'<documentproperty defaultValue="" isDynamicCredential="false" isTradingPartner="false" name="Dynamic Process Property - DPP_TOOL" persist="false" propertyId="process.DPP_TOOL" shouldEncrypt="false"><sourcevalues><parametervalue key="0" valueType="static"><staticparameter staticproperty="{key}"/></parametervalue></sourcevalues></documentproperty>'
            f'<documentproperty defaultValue="" isDynamicCredential="false" isTradingPartner="false" name="Dynamic Process Property - DPP_REQUEST" persist="false" propertyId="process.DPP_REQUEST" shouldEncrypt="false"><sourcevalues><parametervalue key="0" valueType="current"/></sourcevalues></documentproperty>'
            f'</documentproperties></configuration><dragpoints><dragpoint name="shape2.dragpoint1" toShape="shape3" x="448" y="56"/></dragpoints></shape>',
            f'<shape image="processcall_icon" name="shape3" shapetype="processcall" userlabel="Legacy tool pipeline" x="464.0" y="48.0"><configuration><processcall abort="true" processId="{IDS["sub"]}" wait="true"><parameters/><returnpaths><returnpaths childShapeName="shape8"/></returnpaths></processcall></configuration><dragpoints><dragpoint identifier="shape8" text="Governed tool result" name="shape3.dragpoint1" toShape="shape4" x="656" y="56"/></dragpoints></shape>',
            '<shape image="returndocuments_icon" name="shape4" shapetype="returndocuments" userlabel="API Response" x="672.0" y="48.0"><configuration><returndocuments label="API Response"/></configuration><dragpoints/></shape>',
        ]
        IDS['proc_' + key] = put('process', f'TERAS API {label} Tool', process_xml(shapes), f'Agent tool {tool}: POST /ws/rest/teras/v1/{key}. {desc}')
    save_ids()


def api():
    routes = ''.join(f'<route processId="{IDS["proc_" + key]}"><overrides contentType="" httpMethod="POST" inputProfileKey="" inputType="" objectName="v1" outputProfileKey="" outputType="" urlPath="{key}"/><description>{escape(tool + ": " + desc)}</description></route>'
                     for key, label, tool, desc in TOOLS)
    body = f'''    <webservice xmlns="" urlPath="teras">
      <restApi>{routes}</restApi>
      <soapApi fullEnvelopePassthrough="false" singleWsdlSchema="false" suppressWrappers="false" wsdlNamespace="" wsdlServiceName=""><SOAPVersion>SOAP_1_1</SOAPVersion></soapApi>
      <odataApi/>
      <metaInfo title="Teras JPJ Legacy Tools API" version="1" contactEmail="" contactName="" contactUrl="" licenseName="" licenseUrl=""><description/><termsOfService/></metaInfo>
      <profileOverrides/>
      <capturedHeaders/>
      <apiRoles/>
    </webservice>'''
    IDS['api'] = put('webservice', 'TERAS JPJ Legacy Tools API', body,
                     'Governed agent tools over the JPJ IBM P-Series (simulated): vehicle, licence, summons. Each call is cleansed on input and governed on output by caller context.')
    save_ids()


STEPS = {'profiles': profiles, 'conn': conn, 'conn_internal': conn_internal, 'op': op, 'aih_ps': aih_ps, 'sub': sub, 'wss': wss, 'procs': procs, 'api': api}
if __name__ == '__main__':
    todo = sys.argv[1:] or ['all']
    for s in (list(STEPS) if todo == ['all'] else todo):
        STEPS[s]()
    print(json.dumps(IDS, indent=1))
