import { PageHeader, Button } from "fourty";

export const WithAction = () => (
  <PageHeader
    title="Deals"
    subtitle="38 deals · $1.24M total"
    actions={<Button size="sm">New deal</Button>}
  />
);

export const TitleOnly = () => <PageHeader title="Dashboard" />;
