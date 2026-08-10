import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText, Button } from "fourty";

export const Segmented = () => (
  <ButtonGroup>
    <Button variant="outline">Kanban</Button>
    <Button variant="outline">List</Button>
    <Button variant="outline">Calendar</Button>
  </ButtonGroup>
);

export const WithLabel = () => (
  <ButtonGroup>
    <ButtonGroupText>Currency</ButtonGroupText>
    <ButtonGroupSeparator />
    <Button variant="outline">USD</Button>
    <Button variant="outline">EUR</Button>
  </ButtonGroup>
);
