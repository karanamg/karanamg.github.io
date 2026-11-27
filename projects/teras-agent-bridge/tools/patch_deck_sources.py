#!/usr/bin/env python3
"""Reposition the deck: IBM P-Series mainframes are ONE of the possible sources (the worked example), not the headline."""
import os, sys
p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'make_deck.js')
s = open(p).read()
R = [
 # 1 title
 ("txt(s, 'From IBM P-Series to governed AI tools',", "txt(s, 'From any system to governed AI tools',"),
 ("[['🗄', 'IBM P-Series', '1E293B', 8.0], ['⚙', 'Boomi', C.blue, 9.75]", "[['🗄', 'Any system', '1E293B', 8.0], ['⚙', 'Boomi', C.blue, 9.75]"),
 # 2 challenge: four sources, IBM is one of them
 ("""  [['🗄', 'IBM P-Series (IBM i · DB2)', 'Vehicle, licence and summons files at the "J" departments'], ['🏭', 'SAP · Salesforce', 'Enterprise systems in every Aras vertical'], ['📄', 'Files & government data', 'CSV exports, data.gov.my, agency APIs']].forEach(([e, t, d], i) => {
    box(s, 0.6, 1.75 + i * 1.12, 5.2, 0.95, C.card, C.line);
    txt(s, e, { x: 0.8, y: 1.95 + i * 1.12, w: 0.6, h: 0.55, fontSize: 24 });
    txt(s, t, { x: 1.5, y: 1.88 + i * 1.12, w: 4.2, h: 0.35, fontSize: 15, bold: true });
    txt(s, d, { x: 1.5, y: 2.23 + i * 1.12, w: 4.2, h: 0.4, fontSize: 11, color: C.ink2 });
  });""",
  """  [['🏭', 'SAP · Oracle · ERP', 'Enterprise systems in every Aras vertical'], ['☁', 'Salesforce · SaaS apps', 'Cases, customers, service data'], ['🗄', 'Mainframes - e.g. IBM P-Series', 'IBM i / DB2 files at the "J" departments'], ['📄', 'Files, databases & government APIs', 'CSV exports, data.gov.my, agency services']].forEach(([e, t, d], i) => {
    box(s, 0.6, 1.62 + i * 0.86, 5.2, 0.76, C.card, C.line);
    txt(s, e, { x: 0.8, y: 1.76 + i * 0.86, w: 0.6, h: 0.5, fontSize: 21 });
    txt(s, t, { x: 1.5, y: 1.7 + i * 0.86, w: 4.2, h: 0.32, fontSize: 14, bold: true });
    txt(s, d, { x: 1.5, y: 2.02 + i * 0.86, w: 4.2, h: 0.3, fontSize: 10.5, color: C.ink2 });
  });"""),
 ("const s = content('The challenge', 'Sovereign AI is stuck behind legacy systems');", "const s = content('The challenge', 'Sovereign AI is stuck behind fragmented systems');"),
 ("['🔒', 'Locked legacy data', 'Fixed-width IBM i records, custom code and IBM vendor reliance']", "['🔒', 'Locked, inconsistent data', 'Every source has its own format - from SaaS JSON to fixed-width mainframe records']"),
 ("['🛠', 'A project per department', 'Every new \"J\" department becomes a bespoke build']", "['🛠', 'A project per customer', 'Every new department or customer becomes a bespoke build']"),
 # 3 use case: list order, mainframe as one option
 ("[['🗄', 'IBM P-Series (IBM i)'], ['🏭', 'SAP S/4HANA'], ['☁', 'Salesforce'], ['📄', 'Files · data.gov.my']]", "[['🏭', 'SAP S/4HANA'], ['☁', 'Salesforce'], ['🗄', 'Mainframes (IBM P-Series)'], ['📄', 'Files · databases · data.gov.my']]"),
 # 4 stats: generic, with IBM as the measured example
 ("['~1 s', 'governed IBM i tool call on the on-prem runtime: read, cleanse, govern, audit', C.blueSoft, C.blue]", "['~1 s', 'governed tool call on the on-prem runtime: read, cleanse, govern, audit (IBM P-Series source)', C.blueSoft, C.blue]"),
 # 5 onboarding
 ("'IBM P-Series, SAP, Salesforce, files and open data are built once in Boomi.'", "'SAP, Salesforce, mainframes (IBM P-Series), files and open data - built once in Boomi.'"),
 ("['Tools published automatically', 'IBM P-Series files become agent tools the moment they are added.', C.violet]", "['Tools published automatically', 'Live sources become agent tools the moment they are added.', C.violet]"),
 # 6 cleanse demo: IBM as the example
 ("const s = content('Demo · cleanse on input', 'From a fixed-width IBM i record to clean, typed data');", "const s = content('Demo · cleanse on input · example: IBM P-Series', 'Even a fixed-width mainframe record becomes clean, typed data');"),
 # 8 assistant
 ("'Vehicle lookup + summons check, live from the IBM P-Series.'", "'Vehicle lookup + summons check, live from the source system (here an IBM P-Series).'"),
 # 10 architecture: customer systems node
 ("[['🗄 JPJ IBM Power9', 'IBM i 7.4 · DB2 for i\\nVEHMST · LICMST · SUMMST', '475569']", "[['🗄 Customer systems', 'SAP · Salesforce · files · databases\\nmainframes, e.g. IBM P-Series (IBM i / DB2)', '475569']"),
 ("'Same package, same processes - reaches the IBM i only through a controlled HTTP gateway. For non-sensitive or public workloads.'", "'Same package, same processes - reaches on-prem systems only through a controlled gateway. For non-sensitive or public workloads.'"),
 # 11 runtime switch (the demo used the IBM source)
 ("'~0.2 s - reads the IBM i on the internal network, inside the firewall.'", "'~0.2 s - reads the source (here the IBM i) on the internal network.'"),
 ("'Seconds - reaches the IBM i only via the controlled HTTP gateway.'", "'Seconds - reaches on-prem sources only via a controlled gateway.'"),
 # 12 security
 ("'Atom or Molecule cluster on MTAI VMs or Kubernetes, next to the SLMs and the IBM i.'", "'Atom or Molecule cluster on MTAI VMs or Kubernetes, next to the SLMs and the source systems.'"),
 # 15 stakeholders
 ("'IBM P-Series data, cleansed on input'", "'Any source - incl. mainframes - cleansed on input'"),
 # 16 next steps
 ("'IBM i files on an on-prem runtime'", "'2-3 sources (e.g. IBM P-Series) on an on-prem runtime'"),
]
for a, b in R:
    if a not in s:
        sys.exit('anchor not found: ' + a[:90])
    s = s.replace(a, b, 1)
open(p, 'w').write(s)
print('patched', len(R), 'edits')
