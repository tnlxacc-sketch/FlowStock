#!/usr/bin/env node
// FlowBiz One year-end backup wrapper.
// Uses the commercial backup engine and registers the archive for year-end rollover.
if(!process.env.CLOSED_YEAR)throw new Error('Set CLOSED_YEAR');
process.env.BACKUP_KIND='YEAR_END';
process.env.PERIOD_LABEL=process.env.PERIOD_LABEL||process.env.CLOSED_YEAR;
await import('./backup-project.mjs');
