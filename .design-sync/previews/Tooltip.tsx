import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, Button } from "fourty";

export const OnAction = () => (
  <TooltipProvider>
    <Tooltip open>
      <TooltipTrigger render={<Button variant="outline">Recalculate</Button>} />
      <TooltipContent>Re-scores every open deal</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);
