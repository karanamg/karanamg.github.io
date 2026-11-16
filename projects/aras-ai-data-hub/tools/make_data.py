"""Generate the demo data for the Integrasi Connect (Aras Integrasi) AI Data Hub demo.

Writes:
  data/salesforce_cases.json   - simulated Salesforce Service Cloud Case records (SOQL response shape), all tenants
  data/files/*.csv             - file-based sources per tenant (contain PII on purpose, to show masking)
  data/seed_tenants.json       - tenants, connections and mappings pre-configured for the demo
All people, IC numbers, phone numbers and organisations are fictitious.
"""
import csv, io, json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'; (DATA / 'files').mkdir(parents=True, exist_ok=True)

def case(tenant, n, subject, desc, status, prio, typ, origin, created, contact, email, phone, extra=None):
    rec = {"attributes": {"type": "Case", "url": f"/services/data/v61.0/sobjects/Case/500Hs0000{tenant[:3].upper()}{n:04d}"},
           "Id": f"500Hs0000{tenant[:3].upper()}{n:04d}", "CaseNumber": f"000{18000 + n}", "Subject": subject, "Description": desc,
           "Status": status, "Priority": prio, "Type": typ, "Origin": origin, "CreatedDate": created,
           "ContactName__c": contact, "ContactEmail__c": email, "ContactPhone__c": phone, "Tenant__c": tenant}
    rec.update(extra or {})
    return rec

CASES = [
    # Universiti Nusantara - AISLE student wellbeing (counselling cases)
    case('unus', 1, 'Exam stress and trouble sleeping', 'Student reports severe stress before final exams, sleeping about four hours a night and skipping meals. Requested a counselling session. Student IC 030512-10-4471.', 'In Progress', 'High', 'Counselling', 'AISLE App', '2026-10-02T03:15:00.000+0000', 'Nur Aisyah binti Rahman', 'aisyah.rahman@student.unus.edu.my', '+60 12-418 7730', {"Faculty__c": "Engineering", "Wellbeing_Category__c": "Academic stress"}),
    case('unus', 2, 'Financial hardship - unable to pay hostel fees', 'Final year student cannot pay hostel fees after a family member lost their job. Asked about emergency financial aid and part-time work on campus.', 'New', 'High', 'Financial aid', 'Walk-in', '2026-10-05T06:40:00.000+0000', 'Lim Wei Jie', 'weijie.lim@student.unus.edu.my', '+60 16-772 0915', {"Faculty__c": "Business", "Wellbeing_Category__c": "Financial"}),
    case('unus', 3, 'Feeling isolated in first semester', 'First year international student feels lonely and has not joined any clubs. Peer mentor programme suggested. Follow-up booked for next week.', 'In Progress', 'Medium', 'Counselling', 'AISLE App', '2026-10-07T09:05:00.000+0000', 'Arjun Nair', 'arjun.nair@student.unus.edu.my', '+60 11-2391 4478', {"Faculty__c": "Computer Science", "Wellbeing_Category__c": "Social"}),
    case('unus', 4, 'Request for academic accommodation', 'Student with a documented anxiety condition requests extra exam time and a quiet room. Medical letter submitted to the disability services unit.', 'Escalated', 'Medium', 'Accommodation', 'Email', '2026-10-09T02:30:00.000+0000', 'Siti Hajar binti Osman', 'sitihajar@student.unus.edu.my', '+60 13-905 6612', {"Faculty__c": "Medicine", "Wellbeing_Category__c": "Mental health"}),
    case('unus', 5, 'Hostel noise affecting study', 'Several students in Block C report late-night noise affecting study and sleep. Residential college asked to enforce quiet hours.', 'New', 'Low', 'Facilities', 'AISLE App', '2026-10-11T13:20:00.000+0000', 'Muhammad Danial', 'danial.m@student.unus.edu.my', '+60 17-660 2384', {"Faculty__c": "Engineering", "Wellbeing_Category__c": "Environment"}),
    case('unus', 6, 'Burnout from part-time work and studies', 'Student works 25 hours a week at a cafe and is falling behind in coursework. Discussed workload planning and the student hardship fund.', 'Closed', 'Medium', 'Counselling', 'Phone', '2026-10-14T05:10:00.000+0000', 'Tan Mei Ling', 'meiling.tan@student.unus.edu.my', '+60 12-334 8821', {"Faculty__c": "Business", "Wellbeing_Category__c": "Academic stress"}),
    # Perkasa Manufacturing - customer complaints and warranty cases about pumps
    case('perkasa', 1, 'Chiller pump overheating at Penang site', 'Customer reports the chiller pump (SAP product 200001066) overheats after six hours of continuous running. Bearing temperature above 90 C. Requested a field engineer.', 'In Progress', 'High', 'Warranty', 'Email', '2026-10-03T01:45:00.000+0000', 'Encik Hafiz Kamal', 'hafiz.kamal@penangchem.example.my', '+60 4-642 1180', {"Account_Name__c": "Penang Chemicals Sdn Bhd", "Product_Code__c": "200001066"}),
    case('perkasa', 2, 'Fuel pump delivery delayed two weeks', 'Order of 40 fuel pumps (200001073) for the Kuantan depot is two weeks late. Customer asks for a revised delivery date and partial shipment.', 'New', 'Medium', 'Delivery', 'Phone', '2026-10-06T04:00:00.000+0000', 'Ms Priya Subramaniam', 'priya.s@kuantanlogistics.example.my', '+60 9-515 4402', {"Account_Name__c": "Kuantan Logistics Berhad", "Product_Code__c": "200001073"}),
    case('perkasa', 3, 'Jet pump vibration complaint', 'Jet pump (200001014) shows high vibration after installation. Customer suspects misalignment of the motor coupling. Video evidence attached.', 'Escalated', 'High', 'Quality', 'Web', '2026-10-08T07:25:00.000+0000', 'Mr Wong Kar Seng', 'kswong@johorwater.example.my', '+60 7-338 2209', {"Account_Name__c": "Johor Water Services", "Product_Code__c": "200001014"}),
    case('perkasa', 4, 'Seal leakage on control system pump', 'Control system pump (200001023) leaking at the mechanical seal within the warranty period. Customer requests replacement seals and an on-site inspection.', 'In Progress', 'Medium', 'Warranty', 'Email', '2026-10-10T03:50:00.000+0000', 'Puan Rosnah Yusof', 'rosnah@klpower.example.my', '+60 3-2287 5561', {"Account_Name__c": "KL Power Utilities", "Product_Code__c": "200001023"}),
    case('perkasa', 5, 'Request for pump efficiency data', 'Customer preparing an energy audit asks for efficiency curves for the 50m pump (200001022) and the AHP pump (200001016).', 'Closed', 'Low', 'Information', 'Web', '2026-10-12T08:15:00.000+0000', 'Dr Lee Chong Wei', 'cwlee@greenbuild.example.my', '+60 3-7955 1023', {"Account_Name__c": "GreenBuild Consultants", "Product_Code__c": "200001022"}),
    case('perkasa', 6, 'Repeat failure of chiller pump impeller', 'Second impeller failure on the chiller pump at Shah Alam within three months. Customer considering switching supplier unless root cause is found.', 'Escalated', 'High', 'Quality', 'Phone', '2026-10-15T02:05:00.000+0000', 'Encik Azman Ismail', 'azman@shahalamfoods.example.my', '+60 3-5510 7788', {"Account_Name__c": "Shah Alam Foods", "Product_Code__c": "200001066"}),
    # Klinik Sejahtera Health Group - patient service cases
    case('sejahtera', 1, 'Long waiting time at Klang clinic', 'Patient waited more than three hours for a follow-up appointment at the Klang branch. Asked whether online queue tickets are available. Patient IC 780214-08-5523.', 'New', 'Medium', 'Service', 'Web', '2026-10-02T02:10:00.000+0000', 'Kumar a/l Rajan', 'kumar.rajan@example.my', '+60 12-773 0410', {"Clinic__c": "Klang", "Department__c": "Outpatient"}),
    case('sejahtera', 2, 'Billing dispute for diabetes screening', 'Patient was charged twice for an HbA1c test. Requests a refund and an itemised bill.', 'In Progress', 'Medium', 'Billing', 'Email', '2026-10-04T05:30:00.000+0000', 'Fatimah binti Zakaria', 'fatimah.z@example.my', '+60 19-221 6634', {"Clinic__c": "Petaling Jaya", "Department__c": "Laboratory"}),
    case('sejahtera', 3, 'Question about medication side effects', 'Elderly patient reports dizziness after starting new blood pressure medication. Pharmacist callback requested within 24 hours.', 'Escalated', 'High', 'Clinical', 'Phone', '2026-10-06T10:45:00.000+0000', 'Chong Ah Kow', 'ahkow.chong@example.my', '+60 3-3341 9908', {"Clinic__c": "Klang", "Department__c": "Pharmacy"}),
    case('sejahtera', 4, 'Request for medical report for insurance', 'Patient needs a medical report for an insurance claim after a minor surgery. Asked about the fee and turnaround time.', 'Closed', 'Low', 'Records', 'Web', '2026-10-09T03:00:00.000+0000', 'Nurul Izzah', 'nurul.izzah@example.my', '+60 13-480 2257', {"Clinic__c": "Shah Alam", "Department__c": "Medical records"}),
    case('sejahtera', 5, 'Praise for the paediatric team', 'Parent thanked the paediatric nurses for their care during a dengue admission and suggested more parking at the Shah Alam branch.', 'Closed', 'Low', 'Feedback', 'AISLE App', '2026-10-12T06:20:00.000+0000', 'Rajesh Pillai', 'rajesh.p@example.my', '+60 16-559 3301', {"Clinic__c": "Shah Alam", "Department__c": "Paediatrics"}),
    case('sejahtera', 6, 'Difficulty booking teleconsultation', 'Patient could not complete a teleconsultation booking in the mobile app - payment page timed out twice.', 'New', 'Medium', 'Digital', 'App', '2026-10-14T12:35:00.000+0000', 'Lee Siew Mei', 'siewmei.lee@example.my', '+60 17-902 4418', {"Clinic__c": "Online", "Department__c": "Telehealth"}),
]
for c in CASES:
    for v in c.values():
        assert "'" not in json.dumps(v), c['Subject']   # Boomi Message step literal mode
json.dump({"totalSize": len(CASES), "done": True, "records": CASES}, open(DATA / 'salesforce_cases.json', 'w'), indent=1)

def write_csv(name, header, rows):
    buf = io.StringIO(); w = csv.writer(buf); w.writerow(header); w.writerows(rows)
    (DATA / 'files' / name).write_text(buf.getvalue())

write_csv('unus_wellbeing_survey_oct2026.csv',
  ['student_id', 'full_name', 'mykad', 'email', 'phone', 'faculty', 'year', 'stress_level', 'sleep_hours', 'support_requested', 'comments'],
  [['S2301145', 'Nur Aisyah binti Rahman', '030512-10-4471', 'aisyah.rahman@student.unus.edu.my', '+60 12-418 7730', 'Engineering', '3', '5', '4', 'Yes', 'Exams are overwhelming and I cannot sleep. I would like to talk to a counsellor.'],
   ['S2302290', 'Lim Wei Jie', '020918-14-6635', 'weijie.lim@student.unus.edu.my', '+60 16-772 0915', 'Business', '4', '4', '6', 'Yes', 'Worried about paying hostel fees this semester.'],
   ['S2405518', 'Arjun Nair', '040221-08-3319', 'arjun.nair@student.unus.edu.my', '+60 11-2391 4478', 'Computer Science', '1', '3', '7', 'No', 'Settling in slowly, would like more social events for international students.'],
   ['S2203377', 'Siti Hajar binti Osman', '011130-03-5582', 'sitihajar@student.unus.edu.my', '+60 13-905 6612', 'Medicine', '5', '4', '5', 'Yes', 'Clinical rotations are long. Anxiety is getting worse before assessments.'],
   ['S2304421', 'Muhammad Danial', '030707-01-2253', 'danial.m@student.unus.edu.my', '+60 17-660 2384', 'Engineering', '3', '2', '6', 'No', 'Hostel noise at night makes it hard to study.'],
   ['S2208864', 'Tan Mei Ling', '020403-07-8846', 'meiling.tan@student.unus.edu.my', '+60 12-334 8821', 'Business', '4', '5', '4', 'Yes', 'Working part-time and studying full-time is exhausting.'],
   ['S2406612', 'Hannah Koh', '040815-10-9921', 'hannah.koh@student.unus.edu.my', '+60 18-221 0093', 'Design', '1', '2', '8', 'No', 'Enjoying the course. The new library hours help a lot.'],
   ['S2301987', 'Ahmad Faris', '031101-06-4417', 'faris.ahmad@student.unus.edu.my', '+60 19-334 5560', 'Computer Science', '3', '4', '5', 'Yes', 'Group project conflicts are stressing me out.']])
write_csv('perkasa_maintenance_log_q3_2026.csv',
  ['work_order', 'asset_id', 'sap_product', 'asset_name', 'plant', 'technician', 'date', 'failure_mode', 'downtime_hours', 'action_taken', 'notes'],
  [['WO-77120', 'AST-PG-0412', '200001066', 'Chiller Pump CP-4', 'Penang', 'Ravi Shankar', '2026-07-14', 'Bearing overheating', '6', 'Replaced bearing and checked lubrication', 'Third bearing issue this year on CP-4. Recommend vibration monitoring.'],
   ['WO-77188', 'AST-SA-0207', '200001066', 'Chiller Pump CP-2', 'Shah Alam', 'Lee Kok Wai', '2026-07-29', 'Impeller crack', '14', 'Replaced impeller', 'Cavitation marks on impeller. Check suction pressure.'],
   ['WO-77245', 'AST-JB-0118', '200001014', 'Jet Pump JP-1', 'Johor Bahru', 'Siti Aminah', '2026-08-05', 'High vibration', '3', 'Realigned motor coupling', 'Vibration back within limits after alignment.'],
   ['WO-77302', 'AST-KL-0331', '200001023', 'Control System Pump CS-3', 'Kuala Lumpur', 'Ravi Shankar', '2026-08-19', 'Seal leakage', '5', 'Replaced mechanical seal', 'Seal batch 2026-04 may be defective; quarantine remaining stock.'],
   ['WO-77360', 'AST-KT-0090', '200001073', 'Fuel Pump FP-9', 'Kuantan', 'Mohd Rizal', '2026-09-02', 'Low discharge pressure', '2', 'Cleaned strainer', 'Contaminated fuel suspected. Advise customer on filtration.'],
   ['WO-77411', 'AST-SA-0207', '200001066', 'Chiller Pump CP-2', 'Shah Alam', 'Lee Kok Wai', '2026-09-23', 'Impeller crack', '16', 'Replaced impeller and installed suction gauge', 'Repeat failure. Root cause analysis opened (RCA-0912).']])
write_csv('sejahtera_patient_feedback_oct2026.csv',
  ['feedback_id', 'patient_name', 'mykad', 'phone', 'clinic', 'visit_date', 'department', 'rating', 'comments'],
  [['FB-50121', 'Kumar a/l Rajan', '780214-08-5523', '+60 12-773 0410', 'Klang', '2026-10-01', 'Outpatient', '2', 'Waited more than three hours. Please add an online queue.'],
   ['FB-50134', 'Fatimah binti Zakaria', '850622-10-6612', '+60 19-221 6634', 'Petaling Jaya', '2026-10-03', 'Laboratory', '1', 'Charged twice for my blood test.'],
   ['FB-50149', 'Chong Ah Kow', '520910-07-3381', '+60 3-3341 9908', 'Klang', '2026-10-05', 'Pharmacy', '3', 'Pharmacist explained my new medicine clearly but I feel dizzy.'],
   ['FB-50160', 'Rajesh Pillai', '800117-14-2209', '+60 16-559 3301', 'Shah Alam', '2026-10-11', 'Paediatrics', '5', 'Excellent care for my son. Parking is very limited.'],
   ['FB-50177', 'Lee Siew Mei', '910305-08-7764', '+60 17-902 4418', 'Online', '2026-10-13', 'Telehealth', '2', 'App payment page keeps timing out.'],
   ['FB-50183', 'Aminah binti Yusof', '670828-03-4450', '+60 13-662 1987', 'Klang', '2026-10-15', 'Outpatient', '4', 'Doctor was kind. Waiting time was shorter this visit.']])

SF_MAP = {"id": "{CaseNumber}", "title": "Case {CaseNumber}: {Subject}",
          "content": ["Description", "Status", "Priority", "Type"], "metadata": [{"from": "CreatedDate", "to": "created_at"}, {"from": "Origin", "to": "channel"}]}
TENANTS = [
  {"id": "unus", "name": "Universiti Nusantara", "industry": "Higher education", "solution": "AISLE student wellbeing", "color": "#0f766e",
   "classification": "Confidential", "boomiEnvironment": "ARAS-UNUS-PROD", "region": "MTAI Sovereign Cloud - Cyberjaya",
   "connections": [
     {"id": "sf", "name": "Student services cases", "type": "SALESFORCE", "config": {"object": "Case"},
      "mapping": {**SF_MAP, "metadata": SF_MAP["metadata"] + [{"from": "Faculty__c", "to": "faculty"}, {"from": "Wellbeing_Category__c", "to": "category"}]},
      "policy": {"maskFields": ["ContactName__c", "ContactEmail__c", "ContactPhone__c"], "autoDetect": True, "chunkSize": 500}},
     {"id": "csv", "name": "Wellbeing survey (SIS export)", "type": "FILE_CSV", "config": {"fileName": "unus_wellbeing_survey_oct2026.csv"},
      "mapping": {"id": "{student_id}", "title": "Wellbeing survey - {faculty} year {year}", "content": ["comments", "stress_level", "sleep_hours", "support_requested"],
                  "metadata": [{"from": "faculty", "to": "faculty"}, {"from": "year", "to": "year_of_study"}]},
      "policy": {"maskFields": ["full_name", "mykad", "email", "phone"], "autoDetect": True, "chunkSize": 500}},
     {"id": "opendata", "name": "School enrolment - Selangor (data.gov.my)", "type": "OPEN_DATA", "config": {"dataset": "enrolment_school_district", "filter": "Selangor@state", "sort": "-date", "limit": 12},
      "mapping": {"id": "{date}-{stage}-{sex}", "title": "Selangor {stage} school enrolment {date} ({sex}, {district})", "content": ["students", "stage", "sex", "district"],
                  "metadata": [{"from": "state", "to": "state"}, {"from": "date", "to": "period"}]},
      "policy": {"maskFields": [], "autoDetect": True, "chunkSize": 500}}],
   "questions": ["Which students asked for counselling because of exam stress?", "What financial hardship issues were reported?", "How many primary school students were enrolled in Selangor?"]},
  {"id": "perkasa", "name": "Perkasa Manufacturing Berhad", "industry": "Manufacturing", "solution": "Predictive maintenance assistant", "color": "#1d4ed8",
   "classification": "Internal", "boomiEnvironment": "ARAS-PERKASA-PROD", "region": "Customer data centre - Shah Alam (on-premise runtime)",
   "connections": [
     {"id": "sap", "name": "SAP S/4HANA product master", "type": "SAP_S4HANA", "config": {"search": "pump"},
      "mapping": {"id": "SAP-{product}", "title": "SAP product {product}: {description}", "content": ["description", "product"], "metadata": [{"from": "language", "to": "language"}]},
      "policy": {"maskFields": [], "autoDetect": False, "chunkSize": 500}},
     {"id": "sf", "name": "Customer complaints (Service Cloud)", "type": "SALESFORCE", "config": {"object": "Case"},
      "mapping": {**SF_MAP, "metadata": SF_MAP["metadata"] + [{"from": "Account_Name__c", "to": "customer"}, {"from": "Product_Code__c", "to": "sap_product"}]},
      "policy": {"maskFields": ["ContactName__c", "ContactEmail__c", "ContactPhone__c"], "autoDetect": True, "chunkSize": 500}},
     {"id": "csv", "name": "Plant maintenance log (CMMS export)", "type": "FILE_CSV", "config": {"fileName": "perkasa_maintenance_log_q3_2026.csv"},
      "mapping": {"id": "{work_order}", "title": "Work order {work_order}: {asset_name} - {failure_mode}", "content": ["failure_mode", "action_taken", "notes", "downtime_hours"],
                  "metadata": [{"from": "plant", "to": "plant"}, {"from": "sap_product", "to": "sap_product"}, {"from": "date", "to": "date"}]},
      "policy": {"maskFields": ["technician"], "autoDetect": True, "chunkSize": 500}}],
   "questions": ["What problems have we had with chiller pumps?", "Which customers are unhappy and why?", "What caused the seal leakage?"]},
  {"id": "sejahtera", "name": "Klinik Sejahtera Health Group", "industry": "Healthcare", "solution": "Patient experience insights", "color": "#9d174d",
   "classification": "Restricted", "boomiEnvironment": "ARAS-SEJAHTERA-PROD", "region": "MTAI Sovereign Cloud - Cyberjaya",
   "connections": [
     {"id": "sf", "name": "Patient service cases", "type": "SALESFORCE", "config": {"object": "Case"},
      "mapping": {**SF_MAP, "metadata": SF_MAP["metadata"] + [{"from": "Clinic__c", "to": "clinic"}, {"from": "Department__c", "to": "department"}]},
      "policy": {"maskFields": ["ContactName__c", "ContactEmail__c", "ContactPhone__c"], "autoDetect": True, "chunkSize": 500}},
     {"id": "csv", "name": "Patient feedback survey", "type": "FILE_CSV", "config": {"fileName": "sejahtera_patient_feedback_oct2026.csv"},
      "mapping": {"id": "{feedback_id}", "title": "Patient feedback {feedback_id} - {clinic} {department}", "content": ["comments", "rating"],
                  "metadata": [{"from": "clinic", "to": "clinic"}, {"from": "department", "to": "department"}, {"from": "visit_date", "to": "visit_date"}]},
      "policy": {"maskFields": ["patient_name", "mykad", "phone"], "autoDetect": True, "chunkSize": 500}},
     {"id": "opendata", "name": "Hospital beds - Selangor (data.gov.my)", "type": "OPEN_DATA", "config": {"dataset": "hospital_beds", "filter": "Selangor@state", "sort": "-date", "limit": 12},
      "mapping": {"id": "{date}-{district}-{type}", "title": "Hospital beds in {district}, {state} ({type}) {date}", "content": ["beds", "type", "district"],
                  "metadata": [{"from": "state", "to": "state"}, {"from": "date", "to": "period"}]},
      "policy": {"maskFields": [], "autoDetect": True, "chunkSize": 500}}],
   "questions": ["What do patients complain about at the Klang clinic?", "Were there any billing problems?", "How many hospital beds are there in Selangor?"]},
]
json.dump({"tenants": TENANTS}, open(DATA / 'seed_tenants.json', 'w'), indent=1)
print('cases', len(CASES), '| csv files', len(list((DATA / 'files').glob('*.csv'))), '| tenants', len(TENANTS))
