# Security reporting

Do not place credentials, exploit details or production data in a public issue. Report privately to repository owner BartSchuster22 using an existing verified private contact. GitHub private vulnerability reporting is not assumed enabled. If no private route is available, request a contact without disclosing sensitive details.

Include affected commit, impact, safe reproduction, expected boundary, and suggested mitigation. Do not test against V1/production services without explicit authorization. Revoke exposed credentials through their issuing service; removing a file from Git is not sufficient. Security-boundary changes require an ADR and negative tests. The foundation secret-pattern check is defense in depth, not comprehensive secret discovery.
