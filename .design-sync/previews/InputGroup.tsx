import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText, InputGroupButton } from "fourty";

export const WithPrefix = () => (
  <div style={{ maxWidth: 320 }}>
    <InputGroup>
      <InputGroupAddon><InputGroupText>$</InputGroupText></InputGroupAddon>
      <InputGroupInput defaultValue="48,000" />
    </InputGroup>
  </div>
);

export const WithAction = () => (
  <div style={{ maxWidth: 320 }}>
    <InputGroup>
      <InputGroupInput placeholder="Search records…" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="xs">Go</InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  </div>
);
