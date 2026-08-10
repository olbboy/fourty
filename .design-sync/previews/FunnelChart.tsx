import { FunnelChart } from "fourty";

const data = [
  { stage: "Lead", count: 128, value: 384000 },
  { stage: "Qualified", count: 74, value: 296000 },
  { stage: "Demo", count: 41, value: 218000 },
  { stage: "Proposal", count: 23, value: 190000 },
  { stage: "Negotiation", count: 11, value: 198000 },
];

export const PipelineFunnel = () => (
  <div style={{ width: 460, height: 260 }}>
    <FunnelChart data={data} />
  </div>
);
