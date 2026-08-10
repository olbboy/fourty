import { CategoryBars } from "fourty";

const data = [
  { source: "Inbound", deals: 34 },
  { source: "Referral", deals: 21 },
  { source: "Outbound", deals: 17 },
  { source: "Event", deals: 9 },
];

export const DealsBySource = () => (
  <div style={{ width: 460, height: 220 }}>
    <CategoryBars data={data} nameKey="source" valueKey="deals" />
  </div>
);
