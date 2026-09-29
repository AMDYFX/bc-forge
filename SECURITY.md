# Security Policy

This document outlines how security issues should be reported and handled for the bc-forge project.

## Supported Versions

The following versions of bc-forge are currently supported for security updates:

| Version | Supported | Notes |
|---------|-----------|-------|
| 1.0.0   | ✅ Yes    | Current stable release |
| < 1.0.0 | ❌ No     | Unsupported legacy versions |

## Reporting a Vulnerability

**Security vulnerabilities must be reported privately.** Do not disclose them publicly or through GitHub issues, discussions, or other public channels.

To report a security vulnerability, please contact the maintainers directly at: **security@bc-forge.org**

When reporting, please include:
- A clear description of the vulnerability
- Steps to reproduce the issue
- The affected component (Smart Contract, SDK, etc.)
- Any relevant environment details
- Your preferred contact method and response timeline

We follow responsible disclosure practices and will work with you to understand and resolve the issue before public disclosure.

## Scope

The following types of issues are in scope for security rewards and coordinated disclosure:

- Smart contract bugs (logic errors, reentrancy, arithmetic overflows/underflows)
- Access control bypasses (admin privilege escalation, unauthorized minting/transfers)
- Token supply manipulation (minting without authorization, burning without proper checks)
- SDK authentication or authorization flaws that could lead to unauthorized contract interactions
- Anything that could result in loss of funds, protocol compromise, or financial impact

## Out of Scope

The following issues are explicitly out of scope:

- Typos, grammatical errors, or minor documentation issues
- User interface or user experience opinions and suggestions
- Feature requests or enhancement proposals
- Gas optimizations without security implications
- Issues affecting unsupported versions
- Theoretical vulnerabilities with no practical exploit path

## Response Timeline

We aim to respond to security reports in a timely manner:

- **Acknowledgement**: Within 48 hours of receiving your report
- **Initial triage**: Within 7 days to assess severity and impact
- **Ongoing updates**: Regular communication about progress toward resolution
- **Resolution**: We will work to fix confirmed vulnerabilities in a timeframe appropriate to their severity (critical issues typically addressed within 14 days)

For critical vulnerabilities that pose immediate risk to users, we may coordinate emergency releases.

## Responsible Disclosure

We ask that researchers follow responsible disclosure practices:
- Do not exploit vulnerabilities beyond what is necessary to demonstrate the issue
- Do not share details with third parties until coordinated disclosure is complete
- Allow us reasonable time to address the issue before public disclosure
- Respect user privacy and data protection requirements

We appreciate the security community's efforts to help keep bc-forge secure.

## Container Image Vulnerability Scanning

All container images are scanned for vulnerabilities before release using Trivy. The scanning process is automated via GitHub Actions and enforces the following policies:

### Scanning Policy

- **Critical vulnerabilities with available fixes**: Block release unless a valid exception exists
- **High vulnerabilities**: Logged as warnings but do not block release
- **Scan reports**: Uploaded as artifacts and to GitHub Security tab for 90-day retention

### Vulnerability Exceptions

In rare cases, a fixable critical vulnerability may require a temporary exception. Exceptions must:

1. Be documented in `.github/vulnerability-exceptions.yml`
2. Include the CVE ID and a security advisory reference (e.g., GHSA-xxxx-xxxx-xxxx)
3. Specify an expiry date (maximum 90 days recommended)
4. Include maintainer approval and approval date
5. Link to a GitHub issue tracking the remediation plan

### Exception Request Process

To request a vulnerability exception:

1. Create a GitHub issue describing the vulnerability and why it cannot be fixed immediately
2. Include the CVE ID, affected package/version, and proposed remediation timeline
3. Tag maintainers for security review
4. Upon approval, add the exception to `.github/vulnerability-exceptions.yml`
5. The exception will be validated during the CI/CD scan process

### Example Exception Entry

```yaml
exceptions:
  - cve: CVE-2024-12345
    advisory: GHSA-xxxx-xxxx-xxxx
    package: package-name@version
    severity: critical
    reason: Upstream fix not yet available; tracking in issue #123
    expires: 2024-12-31
    approved-by: maintainer-name
    approved-date: 2024-01-15
```

Expired exceptions will automatically block releases, ensuring timely remediation.
