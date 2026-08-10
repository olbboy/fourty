import { AppliedFact } from "fourty";

// Every automatic write shows its source and reverts in one click.
const fact = {
  id: "f_2",
  entityType: "contact",
  entityId: "c_1",
  field: "company",
  value: "Acme Corp",
  previousValue: null,
  score: 0.91,
  band: "strong",
  evidence: [{ kind: "domain", detail: "the email domain acme.com" }],
  status: "applied",
  method: "domain-match",
  decidedBy: null,
  observedAt: 1770000000000,
};

export const Applied = () => (
  <div style={{ maxWidth: 420 }}>
    <AppliedFact fact={fact} onDecided={() => {}} />
  </div>
);
