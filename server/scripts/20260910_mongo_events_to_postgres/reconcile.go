package main

import (
	"context"
	"fmt"
	"sort"
	"strings"
)

// reconciliationReport records the state observed after a migration run. The
// rehearsal treats any mismatch as a failure before cutover.
type reconciliationReport struct {
	Events             int
	Responses          int
	SignupBlocks       int
	SignupResponses    int
	Attendees          int
	Folders            int
	Memberships        int
	Quarantined        int
	QuarantineByReason map[string]int
	Mismatches         []string
}

func (report reconciliationReport) String() string {
	var builder strings.Builder
	builder.WriteString("reconciliation:\n")
	fmt.Fprintf(&builder, "  events=%d responses=%d signup_blocks=%d signup_responses=%d attendees=%d folders=%d memberships=%d\n",
		report.Events, report.Responses, report.SignupBlocks, report.SignupResponses, report.Attendees, report.Folders, report.Memberships)
	fmt.Fprintf(&builder, "  quarantined=%d\n", report.Quarantined)
	reasons := make([]string, 0, len(report.QuarantineByReason))
	for reason := range report.QuarantineByReason {
		reasons = append(reasons, reason)
	}
	sort.Strings(reasons)
	for _, reason := range reasons {
		fmt.Fprintf(&builder, "    %s=%d\n", reason, report.QuarantineByReason[reason])
	}
	if len(report.Mismatches) == 0 {
		builder.WriteString("  mismatches: none\n")
		return builder.String()
	}
	builder.WriteString("  mismatches:\n")
	for _, mismatch := range report.Mismatches {
		fmt.Fprintf(&builder, "    - %s\n", mismatch)
	}
	return builder.String()
}

// reconcile verifies target internal consistency and referential integrity for
// every migrated unit. It never repairs; a mismatch fails the run.
func (m *migrator) reconcile(ctx context.Context) (reconciliationReport, error) {
	report := reconciliationReport{QuarantineByReason: map[string]int{}}
	if err := m.pool.QueryRow(ctx, `SELECT count(*) FROM migration_ledger WHERE kind = $1`, ledgerKindEvent).Scan(&report.Events); err != nil {
		return report, err
	}
	if err := m.pool.QueryRow(ctx, `SELECT count(*) FROM migration_ledger WHERE kind = $1`, ledgerKindFolder).Scan(&report.Folders); err != nil {
		return report, err
	}
	counts := []struct {
		query string
		dest  *int
	}{
		{`SELECT count(*) FROM postgres_event_responses r JOIN migration_ledger l ON l.kind = 'event' AND l.target_id::uuid = r.event_id`, &report.Responses},
		{`SELECT count(*) FROM event_signup_blocks b JOIN migration_ledger l ON l.kind = 'event' AND l.target_id::uuid = b.event_id`, &report.SignupBlocks},
		{`SELECT count(*) FROM event_signup_responses s JOIN migration_ledger l ON l.kind = 'event' AND l.target_id::uuid = s.event_id`, &report.SignupResponses},
		{`SELECT count(*) FROM event_attendees a JOIN migration_ledger l ON l.kind = 'event' AND l.target_id::uuid = a.event_id`, &report.Attendees},
		{`SELECT count(*) FROM folder_events f JOIN migration_ledger l ON l.kind = 'folder' AND l.target_id::uuid = f.folder_id`, &report.Memberships},
	}
	for _, count := range counts {
		if err := m.pool.QueryRow(ctx, count.query).Scan(count.dest); err != nil {
			return report, err
		}
	}

	m.checkNumResponses(ctx, &report)
	m.checkOrphanBlockClaims(ctx, &report)
	if err := m.loadQuarantineSummary(ctx, &report); err != nil {
		return report, err
	}
	return report, nil
}

func (m *migrator) checkNumResponses(ctx context.Context, report *reconciliationReport) {
	var drifted int
	err := m.pool.QueryRow(ctx, `SELECT count(*) FROM postgres_events e
JOIN migration_ledger l ON l.kind = 'event' AND l.target_id::uuid = e.id
WHERE e.type <> $1 AND e.num_responses <> (SELECT count(*) FROM postgres_event_responses r WHERE r.event_id = e.id)`, eventKindSignup).Scan(&drifted)
	if err != nil {
		report.Mismatches = append(report.Mismatches, "num_responses check failed: "+err.Error())
		return
	}
	if drifted != 0 {
		report.Mismatches = append(report.Mismatches, fmt.Sprintf("%d migrated events have num_responses drift", drifted))
	}
}

func (m *migrator) checkOrphanBlockClaims(ctx context.Context, report *reconciliationReport) {
	var orphans int
	err := m.pool.QueryRow(ctx, `SELECT count(*) FROM event_signup_responses s
JOIN migration_ledger l ON l.kind = 'event' AND l.target_id::uuid = s.event_id
WHERE EXISTS (
    SELECT 1 FROM unnest(s.block_ids) AS block
    WHERE NOT EXISTS (
        SELECT 1 FROM event_signup_blocks b WHERE b.event_id = s.event_id AND b.id::text = block
    )
)`).Scan(&orphans)
	if err != nil {
		report.Mismatches = append(report.Mismatches, "block claim check failed: "+err.Error())
		return
	}
	if orphans != 0 {
		report.Mismatches = append(report.Mismatches, fmt.Sprintf("%d signup responses claim absent blocks", orphans))
	}
}

func (m *migrator) loadQuarantineSummary(ctx context.Context, report *reconciliationReport) error {
	rows, err := m.pool.Query(ctx, `SELECT reason, count(*) FROM migration_quarantine GROUP BY reason ORDER BY reason`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var reason string
		var count int
		if err := rows.Scan(&reason, &count); err != nil {
			return err
		}
		report.QuarantineByReason[reason] = count
		report.Quarantined += count
	}
	return rows.Err()
}
