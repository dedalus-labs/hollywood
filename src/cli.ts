#!/usr/bin/env node

import { createCli } from "./commands";

await createCli().parseAsync();
