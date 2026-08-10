import { FactSuggestion } from "fourty";

// A suggestion carries the evidence it came from — the product never shows a
// proposed write without the receipt beside it.
const fact = {
  id: "f_1",
  entityType: "contact",
  entityId: "c_1",
  field: "jobTitle",
  value: "Head of Revenue",
  previousValue: null,
  score: 0.78,
  band: "strong",
  evidence: [
    { kind: "signature", detail: "Email signature, 14 Feb — “Head of Revenue, Acme Corp”" },
    { kind: "reply", detail: "Reply thread, 02 Feb — same title in the sign-off" },
  ],
  status: "pending",
  method: "signature-scan",
  decidedBy: null,
  observedAt: 1770000000000,
};

export const Pending = () => (
  <div style={{ maxWidth: 420 }}>
    <FactSuggestion fact={fact} onDecided={() => {}} />
  </div>
);
