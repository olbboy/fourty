import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Button } from "fourty";

export const Default = () => (
  <Card style={{ maxWidth: 380 }}>
    <CardHeader>
      <CardTitle>Open pipeline</CardTitle>
      <CardDescription>38 deals · $1.24M total</CardDescription>
    </CardHeader>
    <CardContent>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.025em" }}>$842,000</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
        Stage-probability adjusted forecast
      </div>
    </CardContent>
    <CardFooter>
      <Button size="sm" variant="outline">View deals</Button>
    </CardFooter>
  </Card>
);

export const Minimal = () => (
  <Card style={{ maxWidth: 380 }}>
    <CardHeader>
      <CardTitle>Win rate (90d)</CardTitle>
    </CardHeader>
    <CardContent>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.025em" }}>31%</div>
    </CardContent>
  </Card>
);
