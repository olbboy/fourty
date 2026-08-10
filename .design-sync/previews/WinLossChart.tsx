import { WinLossChart } from "fourty";

const data = [
  { month: "Oct", won: 6, lost: 3 },
  { month: "Nov", won: 9, lost: 4 },
  { month: "Dec", won: 4, lost: 5 },
  { month: "Jan", won: 11, lost: 3 },
  { month: "Feb", won: 8, lost: 6 },
];

export const WonAgainstLost = () => (
  <div style={{ width: 460, height: 240 }}>
    <WinLossChart data={data} />
  </div>
);
