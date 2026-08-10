import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupButton } from "fourty";

// InputGroupButton only has a shape inside an InputGroup — the wrapper is the
// only render that is true.
export const InGroup = () => (
  <div style={{ maxWidth: 320 }}>
    <InputGroup>
      <InputGroupInput placeholder="acme.com" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="xs">Verify</InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  </div>
);
