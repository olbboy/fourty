import { register } from "../registry";
import { factsRecord } from "./record";
import { factsList } from "./list";
import { factsDecide } from "./decide";

// The evidence ledger, defined once and served by every surface (ADR-017).
register(factsRecord);
register(factsList);
register(factsDecide);

export { factsRecord, factsList, factsDecide };
