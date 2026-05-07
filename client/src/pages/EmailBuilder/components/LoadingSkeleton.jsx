const GROUPS = [
  { label: 'Document Request', count: 6 },
  { label: 'Special Case', count: 3 },
  { label: 'Rejection', count: 4 }
];

const WIDTHS = [88, 72, 104, 96, 64, 112];

export default function LoadingSkeleton() {
  return (
    <div className="email-template-groups">
      {GROUPS.map((group) => (
        <section className="email-skeleton-group" key={group.label}>
          <div className="email-skeleton-heading" />
          <div className="email-skeleton-pills">
            {Array.from({ length: group.count }, (_, i) => (
              <div
                className="email-skeleton-pill"
                key={i}
                style={{ width: WIDTHS[i % WIDTHS.length] }}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
