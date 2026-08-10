import { CountBarChart } from "fourty";

const data = [
  { month: "Oct", deals: 12 },
  { month: "Nov", deals: 18 },
  { month: "Dec", deals: 9 },
  { month: "Jan", deals: 22 },
  { month: "Feb", deals: 17 },
];

export const DealsPerMonth = () => (
  <div style={{ width: 460, height: 240 }}>
    <CountBarChart data={data} xKey="month" yKey="deals" label="Deals" />
  </div>
);
