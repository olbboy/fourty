import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverDescription, PopoverTrigger, Button } from "fourty";

export const Filters = () => (
  <Popover open>
    <PopoverTrigger render={<Button variant="outline">Filters</Button>} />
    <PopoverContent>
      <PopoverHeader>
        <PopoverTitle>Filter deals</PopoverTitle>
        <PopoverDescription>Applies to the current saved view.</PopoverDescription>
      </PopoverHeader>
    </PopoverContent>
  </Popover>
);
