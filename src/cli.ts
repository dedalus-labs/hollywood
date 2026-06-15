#!/usr/bin/env node

import { createHollywoodCli } from "./cli-program";

await createHollywoodCli().parseAsync();
