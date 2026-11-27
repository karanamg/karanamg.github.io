#!/usr/bin/env python3
"""Patch the existing Integrasi Connect (AIDataHub) components so IBM P-Series is just another source:
  * [SUB] AIH Ingest Pipeline  - Route value IBM_PSERIES -> [SUB] AIH IBM P-Series (IBM i DB2); ai_prep reports which runtime ran it
  * AIH API Connectors         - catalogue entry for IBM_PSERIES
Idempotent. Works on the pulled XML in active-development, then pushes."""
import html, json, os, re, subprocess, sys

AD = '/Users/guru/Claude-Guru/active-development'
SK = '/Users/guru/.claude/plugins/cache/boomi-companion/bc-integration/1.0.64/skills/boomi-integration/scripts'
IDS = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ids.json')))
PIPE = os.path.join(AD, 'process', '[SUB] AIH Ingest Pipeline.xml')
CONN = os.path.join(AD, 'process', 'AIH API Connectors.xml')


def strip_branch(x):
    return re.sub(r'\s(branchName|branchId)="[^"]*"', '', x)


def push(path):
    r = subprocess.run(['bash', os.path.join(SK, 'boomi-component-push.sh'), path], cwd='/Users/guru/Claude-Guru', capture_output=True, text=True)
    print(os.path.basename(path), '|', ' '.join((r.stdout + r.stderr).strip().splitlines()[-2:]))


def pipeline():
    x = strip_branch(open(PIPE).read())
    if 'IBM_PSERIES' not in x:
        x = x.replace('<routevalue key="7" name="SAP_SALES_ORDERS" qualifier="equals" value="SAP_SALES_ORDERS"/>',
                      '<routevalue key="7" name="SAP_SALES_ORDERS" qualifier="equals" value="SAP_SALES_ORDERS"/><routevalue key="8" name="IBM_PSERIES" qualifier="equals" value="IBM_PSERIES"/>')
        x = x.replace('text="5 - SAP_SALES_ORDERS" toShape="shape16" x="864" y="696"/>',
                      'text="5 - SAP_SALES_ORDERS" toShape="shape16" x="864" y="696"/><dragpoint identifier="8" name="shape4.dragpoint7" text="6 - IBM_PSERIES" toShape="shape17" x="864" y="1176"/>')
        # move the default "unknown source" message down so the new path has room
        new_shape = (f'<shape image="processcall_icon" name="shape17" shapetype="processcall" userlabel="IBM P-Series - IBM i DB2 file extract (JPJ)" x="880.0" y="1168.0">'
                     f'<configuration><processcall abort="true" processId="{IDS["aih_ps"]}" wait="true"><parameters/><returnpaths><returnpaths childShapeName="shape8"/></returnpaths></processcall></configuration>'
                     f'<dragpoints><dragpoint identifier="shape8" name="shape17.dragpoint1" text="IBM P-Series records" toShape="shape10" x="1072" y="56"/></dragpoints></shape>')
        x = x.replace('</shapes>', new_shape + '\n      </shapes>', 1)
        assert 'shape17' in x and 'routevalue key="8"' in x and 'dragpoint7' in x, 'pipeline patch anchors not found'
    # ai_prep: system label + runtime info in the result
    m = re.search(r'(<shape [^>]*name="shape12"[^>]*>.*?<script>)(.*?)(</script>)', x, re.S)
    script = html.unescape(m.group(2))
    if 'IBM_PSERIES' not in script:
        script = script.replace('OPEN_DATA: "data.gov.my open data"]', 'OPEN_DATA: "data.gov.my open data", IBM_PSERIES: "IBM P-Series (IBM i DB2)"]')
        script = script.replace('def utc = TimeZone.getTimeZone("UTC")',
            'def utc = TimeZone.getTimeZone("UTC")\n/* which runtime executed this run: the on-prem Docker Atom carries BOOMI_ATOMNAME, cloud runtimes do not */\n'
            'String rtHost = ""; try { rtHost = java.net.InetAddress.getLocalHost().getHostName() } catch (e) { }\n'
            'String rtAtom = ""; try { rtAtom = System.getenv("BOOMI_ATOMNAME") ?: "" } catch (e) { }')
        script = script.replace('    sample: records.take(10),', '    runtime: [zone: rtAtom ? "ONPREM" : "CLOUD", name: rtAtom ?: rtHost],\n    sample: records.take(10),')
        assert 'rtAtom' in script and 'IBM_PSERIES' in script and 'runtime: [zone' in script, 'ai_prep patch anchors not found'
        x = x[:m.start(2)] + html.escape(script, quote=False) + x[m.end(2):]
    open(PIPE, 'w').write(x)
    push(PIPE)


def connectors():
    x = strip_branch(open(CONN).read())
    if 'IBM_PSERIES' not in x:
        entry = ''',
  {
   "type": "IBM_PSERIES",
   "name": "IBM P-Series (IBM i DB2)",
   "status": "Simulated",
   "detail": "JPJ IBM Power9, IBM i 7.4: DB2 for i physical files (VEHMST vehicles, LICMST licences, SUMMST summons), fixed-width records cleansed on input",
   "boomiConnector": "REST client to the IBM i HTTP gateway (on-prem: internal network)",
   "config": [
    {
     "key": "file",
     "label": "DB2 file (VEHMST / LICMST / SUMMST)",
     "example": "VEHMST"
    }
   ],
   "composableApi": "POST /ws/rest/teras/v1/vehicle"
  }
 ]
}\'</msgTxt>'''
        i = x.rfind('\n ]\n}\'</msgTxt>')
        assert i > 0, 'connectors anchor not found'
        x = x[:i] + entry + x[i + len('\n ]\n}\'</msgTxt>'):]
    open(CONN, 'w').write(x)
    push(CONN)


if __name__ == '__main__':
    for step in sys.argv[1:] or ['pipeline', 'connectors']:
        {'pipeline': pipeline, 'connectors': connectors}[step]()
