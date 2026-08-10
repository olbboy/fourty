import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent, Button } from "fourty";

export const NoDeals = () => (
  <Empty>
    <EmptyHeader>
      <EmptyTitle>No deals yet</EmptyTitle>
      <EmptyDescription>
        Create your first deal and drag it through the stages as it progresses.
      </EmptyDescription>
    </EmptyHeader>
    <EmptyContent>
      <Button size="sm">New deal</Button>
    </EmptyContent>
  </Empty>
);
