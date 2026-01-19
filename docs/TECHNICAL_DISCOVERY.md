# Technical Systems Discovery
## Integration & Automation Feasibility Assessment

---

## Purpose

This document captures the technical details needed to build integrations with Kent's practice systems. Complete this during or after the Discovery session.

---

## 1. Practice Management / EHR System

### Primary System
| Field | Value |
|-------|-------|
| **System Name** | |
| **Vendor** | |
| **Version** | |
| **Deployment** | [ ] Cloud [ ] On-premise [ ] Hybrid |
| **URL (if cloud)** | |
| **Years using system** | |

### Access Details
| Field | Value |
|-------|-------|
| **Admin login available?** | [ ] Yes [ ] No |
| **Can create test/sandbox user?** | [ ] Yes [ ] No |
| **API available?** | [ ] Yes [ ] No [ ] Unknown |
| **API documentation URL** | |
| **Multi-factor auth?** | [ ] Yes [ ] No |
| **IP restrictions?** | [ ] Yes [ ] No |

### Integration Assessment
| Method | Feasibility | Notes |
|--------|-------------|-------|
| Direct API | [ ] Yes [ ] No [ ] Maybe | |
| Browser automation | [ ] Yes [ ] No [ ] Maybe | |
| File export/import | [ ] Yes [ ] No [ ] Maybe | |
| Webhook/notifications | [ ] Yes [ ] No [ ] Maybe | |

### Key Functions We Need
- [ ] Patient lookup/search
- [ ] Claim lookup/search
- [ ] Payment posting
- [ ] Adjustment posting
- [ ] AR aging report
- [ ] Eligibility update
- [ ] Appointment schedule
- [ ] Other: _______________

---

## 2. Billing / Claims System

### System Details
| Field | Value |
|-------|-------|
| **Same as EHR?** | [ ] Yes [ ] No |
| **If separate, system name** | |
| **Clearinghouse used** | |
| **Clearinghouse login URL** | |

### Clearinghouse Capabilities
| Feature | Available? | Notes |
|---------|------------|-------|
| Real-time eligibility | [ ] Yes [ ] No | |
| Claim submission API | [ ] Yes [ ] No | |
| Claim status API | [ ] Yes [ ] No | |
| ERA/835 delivery | [ ] Yes [ ] No | |
| Remittance download | [ ] Yes [ ] No | |

### EOB/Remittance Sources
| Source | Format | Volume/Week |
|--------|--------|-------------|
| Electronic (835/ERA) | EDI | |
| Payer portal downloads | PDF | |
| Paper mail | Scanned PDF | |
| Fax | | |

---

## 3. Payer Portal Access

### Top Payers (by claim volume)

| Payer | Portal URL | Login Available? | MFA? | Notes |
|-------|------------|------------------|------|-------|
| 1. | | [ ] Yes [ ] No | [ ] Yes [ ] No | |
| 2. | | [ ] Yes [ ] No | [ ] Yes [ ] No | |
| 3. | | [ ] Yes [ ] No | [ ] Yes [ ] No | |
| 4. | | [ ] Yes [ ] No | [ ] Yes [ ] No | |
| 5. | | [ ] Yes [ ] No | [ ] Yes [ ] No | |
| 6. | | [ ] Yes [ ] No | [ ] Yes [ ] No | |
| 7. | | [ ] Yes [ ] No | [ ] Yes [ ] No | |
| 8. | | [ ] Yes [ ] No | [ ] Yes [ ] No | |

### Common Payer Portal Actions
| Action | Frequency | Time per action |
|--------|-----------|-----------------|
| Check eligibility | | |
| Check claim status | | |
| Download EOB/remittance | | |
| Submit appeal | | |
| View auth requirements | | |

---

## 4. Other Business Systems

### Accounting
| Field | Value |
|-------|-------|
| **System** | [ ] QuickBooks [ ] Xero [ ] Other: _____ |
| **Cloud or Desktop?** | |
| **Integration needed?** | [ ] Yes [ ] No [ ] Maybe |

### Email
| Field | Value |
|-------|-------|
| **Provider** | [ ] Gmail/Workspace [ ] Outlook/365 [ ] Other: _____ |
| **Domain** | |
| **Can create app password?** | [ ] Yes [ ] No |

### Document Storage
| Field | Value |
|-------|-------|
| **System** | [ ] Local files [ ] Google Drive [ ] Dropbox [ ] SharePoint [ ] Other |
| **Where are SOPs stored?** | |
| **Where are EOBs stored?** | |

### Scheduling (if separate)
| Field | Value |
|-------|-------|
| **System** | |
| **Integration with EHR?** | [ ] Yes [ ] No |

### Patient Communication
| Field | Value |
|-------|-------|
| **System** | |
| **Appointment reminders?** | [ ] Yes [ ] No |
| **Patient portal?** | [ ] Yes [ ] No |

---

## 5. Data & Reporting

### Key Reports
| Report | Source System | Frequency | Format |
|--------|---------------|-----------|--------|
| Daily production | | | |
| AR aging | | | |
| Collections report | | | |
| Provider productivity | | | |
| Denial report | | | |

### Data Export Capabilities
| Data Type | Can Export? | Format | Notes |
|-----------|-------------|--------|-------|
| Patient demographics | [ ] Yes [ ] No | | |
| Claims history | [ ] Yes [ ] No | | |
| Payment history | [ ] Yes [ ] No | | |
| AR aging detail | [ ] Yes [ ] No | | |
| Appointment schedule | [ ] Yes [ ] No | | |

---

## 6. Security & Compliance

### Current Security Measures
- [ ] All systems require login
- [ ] Passwords meet complexity requirements
- [ ] Multi-factor authentication enabled
- [ ] Automatic session timeout
- [ ] Audit logging enabled
- [ ] Regular backups
- [ ] Encryption at rest
- [ ] Encryption in transit (HTTPS)

### Compliance Status
- [ ] HIPAA Security Risk Assessment completed
- [ ] BAAs in place with all vendors
- [ ] Staff HIPAA training current
- [ ] Incident response plan documented
- [ ] Data retention policy defined

### Access Control
| System | Who has access? | Role-based? |
|--------|-----------------|-------------|
| EHR | | [ ] Yes [ ] No |
| Billing | | [ ] Yes [ ] No |
| Payer portals | | [ ] Yes [ ] No |
| Accounting | | [ ] Yes [ ] No |

---

## 7. Network & Infrastructure

### Practice Network
| Field | Value |
|-------|-------|
| **Internet provider** | |
| **Connection type** | [ ] Fiber [ ] Cable [ ] DSL [ ] Other |
| **Static IP?** | [ ] Yes [ ] No |
| **VPN required?** | [ ] Yes [ ] No |

### Workstations
| Field | Value |
|-------|-------|
| **Operating system** | [ ] Windows [ ] Mac [ ] Mixed |
| **Browser used** | [ ] Chrome [ ] Edge [ ] Firefox [ ] Safari |
| **Remote access available?** | [ ] Yes [ ] No |

---

## 8. Integration Priority Matrix

Based on discovery, rank integration priorities:

| System | Priority | Complexity | Approach |
|--------|----------|------------|----------|
| EHR - Payment posting | [ ] High [ ] Med [ ] Low | [ ] Easy [ ] Med [ ] Hard | |
| EHR - Patient lookup | [ ] High [ ] Med [ ] Low | [ ] Easy [ ] Med [ ] Hard | |
| EHR - AR reports | [ ] High [ ] Med [ ] Low | [ ] Easy [ ] Med [ ] Hard | |
| Clearinghouse | [ ] High [ ] Med [ ] Low | [ ] Easy [ ] Med [ ] Hard | |
| Payer portal 1 | [ ] High [ ] Med [ ] Low | [ ] Easy [ ] Med [ ] Hard | |
| Payer portal 2 | [ ] High [ ] Med [ ] Low | [ ] Easy [ ] Med [ ] Hard | |
| Email | [ ] High [ ] Med [ ] Low | [ ] Easy [ ] Med [ ] Hard | |

---

## 9. Technical Risks & Blockers

### Identified Risks
| Risk | Severity | Mitigation |
|------|----------|------------|
| | [ ] High [ ] Med [ ] Low | |
| | [ ] High [ ] Med [ ] Low | |
| | [ ] High [ ] Med [ ] Low | |

### Potential Blockers
- [ ] No API access - browser automation only
- [ ] MFA on all systems - may need workarounds
- [ ] IP restrictions - need whitelisting
- [ ] Vendor doesn't allow automation
- [ ] On-premise systems - remote access needed
- [ ] Other: _______________

---

## 10. Recommended Integration Approach

### Phase 1 (Week 1-2)
| Integration | Method | Risk Level |
|-------------|--------|------------|
| | | |
| | | |

### Phase 2 (Week 3-4)
| Integration | Method | Risk Level |
|-------------|--------|------------|
| | | |
| | | |

### Future / Deferred
| Integration | Reason for Deferral |
|-------------|---------------------|
| | |
| | |

---

## Credentials Vault

**IMPORTANT:** All credentials should be stored securely. Do NOT store passwords in this document.

| System | Credential Storage Location |
|--------|----------------------------|
| EHR | vault://kent/ehr |
| Clearinghouse | vault://kent/clearinghouse |
| Payer portals | vault://kent/payers/* |
| Email | vault://kent/email |

---

## Technical Discovery Sign-Off

**Date:** _____________

**Completed by:** _____________

**Reviewed by (Kent):** _____________

**Key findings:**
1. _____________
2. _____________
3. _____________

**Next steps:**
1. _____________
2. _____________
3. _____________

---

*Document Version 1.0 | ChiroFlow*
