import { MoneyBarChart } from "fourty";

const data = [
  { stage: "Lead", value: 84000 },
  { stage: "Qualified", value: 152000 },
  { stage: "Demo", value: 218000 },
  { stage: "Proposal", value: 190000 },
  { stage: "Negotiation", value: 198000 },
];

export const OpenPipeline = () => (
  <div style={{ width: 460, height: 240 }}>
    <MoneyBarChart data={data} xKey="stage" yKey="value" />
  </div>
);
