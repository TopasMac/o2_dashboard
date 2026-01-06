<?php

// Bootstrap file for early app setup (timezone, constants, etc.)

// Ensure consistent timezone across CLI and web requests.
// Use America/Cancun (UTC-5, no DST) as default unless overridden in environment.
@date_default_timezone_set($_ENV['APP_TIMEZONE'] ?? 'America/Cancun');
